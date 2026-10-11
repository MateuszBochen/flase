import {
  LogEventsInterface,
  ReplicationActionType,
  ReplicationInterface,
  ReplicationSummaryItemInterface,
  ReplicationTableInterface,
} from '../../Interface/Data/ServerInterface';
import PostgresSql from './PostgresSql';

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

const SETTINGS = [
  'wal_level', 'max_wal_senders', 'max_replication_slots', 'wal_keep_size', 'max_slot_wal_keep_size', 'synchronous_commit',
  'synchronous_standby_names', 'hot_standby', 'hot_standby_feedback', 'archive_mode', 'archive_command', 'primary_slot_name',
];

const text = (value: any): string | null => value === null || value === undefined || value === '' ? null : String(value);

const bytesText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  let size = Number(value);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unit = 0;
  while (Math.abs(size) >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
};

/**
 * Streaming and logical replication of PostgreSQL - standbys, slots, WAL receiver, publications, subscriptions, WAL files.
 * @author Mateusz Bochen
 */
class PostgresReplication {
  constructor(private readonly queryRows: QueryRowsType) {
  }

  async replication(): Promise<ReplicationInterface> {
    const warnings: string[] = [];
    const load = async <T>(part: string, loader: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await loader();
      } catch (e: any) {
        warnings.push(`${part}: ${e?.message || e}`);
        return fallback;
      }
    };

    const [[state]] = await Promise.all([
      this.queryRows(
        `SELECT pg_is_in_recovery() AS standby,
                CASE WHEN pg_is_in_recovery() THEN pg_last_wal_receive_lsn() ELSE pg_current_wal_lsn() END::text AS lsn,
                CASE WHEN pg_is_in_recovery() THEN pg_last_wal_replay_lsn() END::text AS replay_lsn,
                CASE WHEN pg_is_in_recovery() THEN EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())::int END AS replay_delay,
                current_setting('wal_level') AS wal_level`,
      ),
    ]);
    const standby = !!state.standby;
    // position of WAL - on standby the last received one
    const currentLsn = standby ? 'pg_last_wal_receive_lsn()' : 'pg_current_wal_lsn()';

    const [settings, standbys, slots, receiver, publications, subscriptions, wal] = await Promise.all([
      load('Settings', () => this.queryRows('SELECT name, setting, unit FROM pg_settings WHERE name = ANY($1) ORDER BY name', [SETTINGS]), []),
      load('Standbys', () => this.queryRows(
        `SELECT application_name, client_addr::text AS client, usename, state, sync_state, sent_lsn::text, replay_lsn::text,
                pg_wal_lsn_diff(${currentLsn}, replay_lsn) AS lag_bytes, replay_lag::text AS replay_lag
         FROM pg_stat_replication ORDER BY application_name`,
      ), []),
      load('Replication slots', () => this.queryRows(
        `SELECT slot_name, slot_type, plugin, database, active, restart_lsn::text AS restart_lsn,
                pg_wal_lsn_diff(${currentLsn}, restart_lsn) AS retained
         FROM pg_replication_slots ORDER BY slot_name`,
      ), []),
      standby ? load('WAL receiver', () => this.queryRows(
        'SELECT status, sender_host, sender_port, slot_name, latest_end_lsn::text AS latest_end_lsn, last_msg_receipt_time::text AS last_message FROM pg_stat_wal_receiver',
      ), []) : Promise.resolve([]),
      load('Publications', () => this.queryRows(
        `SELECT p.pubname, p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate,
                (SELECT COUNT(*) FROM pg_publication_tables t WHERE t.pubname = p.pubname) AS tables
         FROM pg_publication p ORDER BY p.pubname`,
      ), []),
      load('Subscriptions', () => this.queryRows(
        `SELECT s.subname, s.subenabled, array_to_string(s.subpublications, ', ') AS publications,
                st.received_lsn::text AS received_lsn, st.latest_end_time::text AS latest_end_time
         FROM pg_subscription s LEFT JOIN pg_stat_subscription st ON st.subid = s.oid AND st.relid IS NULL
         WHERE s.subdbid = (SELECT oid FROM pg_database WHERE datname = current_database())
         ORDER BY s.subname`,
      ), []),
      // superuser or pg_monitor
      this.queryRows('SELECT name, size, modification::text AS modified FROM pg_ls_waldir() ORDER BY name DESC LIMIT 500')
        .then((rows) => ({rows, error: null as string | null}))
        .catch((e: any) => ({rows: [] as any[], error: e?.message || String(e)})),
    ]);

    const role = standby ? 'standby' : standbys.length ? 'primary' : 'standalone';
    const summary: ReplicationSummaryItemInterface[] = [
      {label: 'Role', value: role, state: null},
      {label: 'WAL level', value: state.wal_level, state: state.wal_level === 'minimal' ? 'warning' : null},
      {label: standby ? 'Received WAL' : 'Current WAL', value: text(state.lsn) || '?', state: null},
    ];
    if (standby) {
      summary.push({label: 'Replayed WAL', value: text(state.replay_lsn) || '?', state: null});
      summary.push({
        label: 'Replay delay',
        value: state.replay_delay === null ? 'unknown' : `${state.replay_delay} s`,
        state: state.replay_delay === null ? null : Number(state.replay_delay) > 60 ? 'warning' : 'ok',
      });
      const wal = receiver[0];
      summary.push({label: 'WAL receiver', value: wal ? `${wal.status} from ${wal.sender_host}:${wal.sender_port}` : 'not running', state: wal?.status === 'streaming' ? 'ok' : 'error'});
    } else {
      summary.push({label: 'Standbys', value: String(standbys.length), state: null});
    }
    const inactiveSlots = slots.filter((slot) => !slot.active);
    summary.push({
      label: 'Replication slots',
      value: `${slots.length}${inactiveSlots.length ? `, ${inactiveSlots.length} inactive` : ''}`,
      // inactive slot keeps WAL - disk can fill up
      state: inactiveSlots.length ? 'warning' : null,
    });

    const tables: ReplicationTableInterface[] = [
      {
        id: 'standbys',
        title: 'Standbys (pg_stat_replication)',
        columns: ['Application', 'Client', 'User', 'State', 'Sync', 'Sent LSN', 'Replay LSN', 'Lag', 'Replay lag'],
        rows: standbys.map((row) => [text(row.application_name), text(row.client), text(row.usename), text(row.state), text(row.sync_state),
          text(row.sent_lsn), text(row.replay_lsn), bytesText(row.lag_bytes), text(row.replay_lag)]),
        empty: 'No standby is connected.',
      },
      {
        id: 'slots',
        title: 'Replication slots',
        columns: ['Name', 'Type', 'Plugin', 'Database', 'Active', 'Restart LSN', 'Retained WAL'],
        rows: slots.map((row) => [text(row.slot_name), text(row.slot_type), text(row.plugin), text(row.database), row.active ? 'yes' : 'no', text(row.restart_lsn), bytesText(row.retained)]),
        empty: 'No replication slot.',
      },
      ...(standby ? [{
        id: 'receiver',
        title: 'WAL receiver',
        columns: ['Status', 'Sender', 'Slot', 'Latest end LSN', 'Last message'],
        rows: receiver.map((row) => [text(row.status), `${row.sender_host}:${row.sender_port}`, text(row.slot_name), text(row.latest_end_lsn), text(row.last_message)]),
        empty: 'WAL receiver is not running.',
      }] : []),
      {
        id: 'publications',
        title: 'Publications (logical replication, this database)',
        columns: ['Name', 'Tables', 'Operations'],
        rows: publications.map((row) => [
          text(row.pubname),
          row.puballtables ? 'all tables' : String(row.tables),
          ['insert', 'update', 'delete', 'truncate'].filter((operation) => row[`pub${operation}`]).join(', '),
        ]),
        empty: 'No publication.',
      },
      {
        id: 'subscriptions',
        title: 'Subscriptions (logical replication, this database)',
        columns: ['Name', 'Enabled', 'Publications', 'Received LSN', 'Latest end time'],
        rows: subscriptions.map((row) => [text(row.subname), row.subenabled ? 'yes' : 'no', text(row.publications), text(row.received_lsn), text(row.latest_end_time)]),
        empty: 'No subscription.',
      },
      {
        id: 'settings',
        title: 'Settings',
        columns: ['Setting', 'Value'],
        rows: settings.map((row) => [row.name, `${row.setting ?? ''}${row.unit ? ` ${row.unit}` : ''}`]),
        empty: '',
      },
    ];

    return {
      role,
      summary,
      tables,
      logs: wal.error ? null : wal.rows.map((row) => ({name: row.name, size: row.size === null ? null : Number(row.size), modified: row.modified})),
      logsTitle: 'WAL files',
      logsMessage: wal.error ? `WAL files cannot be listed: ${wal.error}` : null,
      logEvents: false,
      actions: [...(standby ? [] : ['switchWal'] as const), ...(slots.length ? ['dropSlot'] as const : [])],
      warnings,
    };
  }

  async logEvents(request?: unknown): Promise<LogEventsInterface> {
    throw new Error('Records of WAL are not shown - use pg_walinspect extension in SQL console');
  }

  async buildAction(action: ReplicationActionType): Promise<string[]> {
    switch (action?.kind) {
      case 'switchWal':
        return ['SELECT pg_switch_wal()'];
      case 'dropSlot': {
        const name = String(action.name || '');
        if (!/^[a-z0-9_]+$/.test(name)) {
          throw new Error(`Invalid slot name ${name}`);
        }
        return [`SELECT pg_drop_replication_slot(${PostgresSql.literal(name)})`];
      }
      default:
        throw new Error(`${(action as any)?.kind} is not available in PostgreSQL`);
    }
  }

  async executeAction(statements: string[]): Promise<void> {
    for (const statement of statements) {
      await this.queryRows(statement);
    }
  }
}

export default PostgresReplication;
