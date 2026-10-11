import {
  AdviceInterface,
  ServerAdminInterface,
  ServerInfoInterface,
  ServerMetricInterface,
  ServerStatusInterface,
  ServerVariablesInterface,
  SetVariableRequestInterface,
  LogEventsInterface,
  LogEventsRequestInterface,
  ReplicationActionType,
  ReplicationInterface,
} from '../../Interface/Data/ServerInterface';
import PostgresReplication from './PostgresReplication';
import {formatBytesText, percentText} from '../ServerText';
import PostgresSql from './PostgresSql';

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

/** size settings in units of pg_settings - 8kB pages, kB, MB */
const UNIT_BYTES: {[unit: string]: number} = {'B': 1, 'kB': 1024, '8kB': 8192, '16kB': 16384, '32kB': 32768, 'MB': 1024 * 1024, 'GB': 1024 ** 3};

/**
 * pg_stat_* statistics, pg_settings (ALTER SYSTEM), advisor, collations and extensions of PostgreSQL.
 * @author Mateusz Bochen
 */
class PostgresServerAdmin implements ServerAdminInterface {
  constructor(private readonly queryRows: QueryRowsType) {
  }

  async status(withAdvice: boolean): Promise<ServerStatusInterface> {
    const [[server], [database], [activity], checkpoints] = await Promise.all([
      this.queryRows(
        `SELECT current_setting('server_version') AS version, EXTRACT(EPOCH FROM now() - pg_postmaster_start_time())::bigint AS uptime,
                current_setting('max_connections')::int AS max_connections`,
      ),
      this.queryRows(
        `SELECT SUM(xact_commit) AS xact_commit, SUM(xact_rollback) AS xact_rollback, SUM(blks_read) AS blks_read, SUM(blks_hit) AS blks_hit,
                SUM(tup_returned) AS tup_returned, SUM(tup_fetched) AS tup_fetched, SUM(tup_inserted) AS tup_inserted,
                SUM(tup_updated) AS tup_updated, SUM(tup_deleted) AS tup_deleted, SUM(conflicts) AS conflicts,
                SUM(temp_files) AS temp_files, SUM(temp_bytes) AS temp_bytes, SUM(deadlocks) AS deadlocks
         FROM pg_stat_database`,
      ),
      this.queryRows(
        `SELECT COUNT(*) FILTER (WHERE backend_type = 'client backend') AS connections,
                COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'active') AS running,
                COUNT(*) FILTER (WHERE state LIKE 'idle in transaction%') AS idle_in_transaction,
                COUNT(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_for_lock
         FROM pg_stat_activity`,
      ),
      // PostgreSQL 17 moved checkpoints to pg_stat_checkpointer
      this.queryRows('SELECT num_timed AS timed, num_requested AS requested FROM pg_stat_checkpointer')
        .catch(() => this.queryRows('SELECT checkpoints_timed AS timed, checkpoints_req AS requested FROM pg_stat_bgwriter'))
        .catch(() => []),
    ]);
    const n = (value: any): number | null => value === null || value === undefined ? null : Number(value);
    const metric = (key: string, label: string, value: number | null, kind: 'counter' | 'gauge', unit: 'bytes' | 'seconds' | null = null): ServerMetricInterface => ({key, label, value, kind, unit});
    const sum = (...values: any[]): number | null => values.some((value) => value !== null && value !== undefined)
      ? values.reduce((total, value) => total + Number(value || 0), 0)
      : null;

    const metrics: ServerMetricInterface[] = [
      metric('connections', 'Connections', n(activity.connections), 'gauge'),
      metric('running', 'Active queries', n(activity.running), 'gauge'),
      metric('maxConnections', 'Max connections', n(server.max_connections), 'gauge'),
      metric('idleInTransaction', 'Idle in transaction', n(activity.idle_in_transaction), 'gauge'),
      metric('waitingForLock', 'Waiting for lock', n(activity.waiting_for_lock), 'gauge'),
      metric('transactions', 'Transactions', sum(database.xact_commit, database.xact_rollback), 'counter'),
      metric('commits', 'Commits', n(database.xact_commit), 'counter'),
      metric('rollbacks', 'Rollbacks', n(database.xact_rollback), 'counter'),
      metric('select', 'Rows fetched', n(database.tup_fetched), 'counter'),
      metric('insert', 'Rows inserted', n(database.tup_inserted), 'counter'),
      metric('update', 'Rows updated', n(database.tup_updated), 'counter'),
      metric('delete', 'Rows deleted', n(database.tup_deleted), 'counter'),
      metric('cacheRequests', 'Block reads', sum(database.blks_hit, database.blks_read), 'counter'),
      metric('cacheMisses', 'Block reads from disk', n(database.blks_read), 'counter'),
      metric('tempBytes', 'Temporary files', n(database.temp_bytes), 'counter', 'bytes'),
      metric('deadlocks', 'Deadlocks', n(database.deadlocks), 'counter'),
    ];

    const raw: {name: string, value: string}[] = [
      ...Object.entries(database).map(([name, value]) => ({name: `pg_stat_database.${name}`, value: String(value ?? '')})),
      ...Object.entries(activity).map(([name, value]) => ({name: `pg_stat_activity.${name}`, value: String(value ?? '')})),
      ...Object.entries(checkpoints[0] || {}).map(([name, value]) => ({name: `checkpoints.${name}`, value: String(value ?? '')})),
      {name: 'max_connections', value: String(server.max_connections)},
    ];

    const result: ServerStatusInterface = {
      version: server.version,
      uptime: Number(server.uptime) || 0,
      takenAt: Date.now(),
      metrics,
      raw,
    };
    if (withAdvice) {
      const settings = await this.queryRows('SELECT name, setting, unit, pending_restart FROM pg_settings');
      result.advice = PostgresServerAdmin.advice(result, database, activity, checkpoints[0] || null, settings);
    }
    return result;
  }

  static advice(status: ServerStatusInterface, database: any, activity: any, checkpoints: any, settings: any[]): AdviceInterface[] {
    const setting = new Map(settings.map((row) => [row.name, row]));
    const value = (name: string): string => setting.get(name)?.setting ?? '';
    const bytes = (name: string): number => Number(value(name)) * (UNIT_BYTES[setting.get(name)?.unit] || 1);
    const advice: AdviceInterface[] = [];

    if (status.uptime < 86400) {
      advice.push({
        severity: 'info',
        title: 'Server is running less than one day',
        detail: `Uptime ${Math.round(status.uptime / 3600)} h - statistics do not describe usual traffic yet (or they were reset).`,
        recommendation: 'Check the advice again after the server has been running for a while.',
      });
    }

    const hit = Number(database.blks_hit || 0);
    const read = Number(database.blks_read || 0);
    if (hit + read > 10000) {
      const ratio = hit / (hit + read);
      if (ratio < 0.99) {
        advice.push({
          severity: ratio < 0.95 ? 'critical' : 'warning',
          title: 'Cache hit ratio is low',
          detail: `${percentText(ratio)} of blocks are read from shared buffers, shared_buffers is ${formatBytesText(bytes('shared_buffers'))}.`,
          recommendation: 'Increase shared_buffers (usually 25 % of RAM) and effective_cache_size; needs restart.',
          variable: 'shared_buffers',
        });
      }
    }

    const maxConnections = Number(value('max_connections') || 0);
    const connections = Number(activity.connections || 0);
    if (maxConnections > 0 && connections / maxConnections > 0.8) {
      advice.push({
        severity: connections / maxConnections > 0.95 ? 'critical' : 'warning',
        title: 'Connections are near the limit',
        detail: `${connections} of max_connections ${maxConnections} (${percentText(connections / maxConnections)}).`,
        recommendation: 'Use connection pooler (PgBouncer) or increase max_connections (needs restart).',
        variable: 'max_connections',
      });
    }

    if (Number(database.deadlocks || 0) > 0) {
      advice.push({
        severity: 'warning',
        title: 'Deadlocks happened',
        detail: `${database.deadlocks} deadlocks since statistics reset.`,
        recommendation: 'Change rows in the same order in all transactions; log_lock_waits shows waiting queries.',
        variable: 'log_lock_waits',
      });
    }

    const tempBytes = Number(database.temp_bytes || 0);
    if (tempBytes > 1024 ** 3) {
      advice.push({
        severity: 'warning',
        title: 'Queries write temporary files',
        detail: `${formatBytesText(tempBytes)} in ${database.temp_files} temporary files, work_mem is ${formatBytesText(bytes('work_mem'))}.`,
        recommendation: 'Increase work_mem (memory of one sort / hash per query) carefully; log_temp_files shows the queries.',
        variable: 'work_mem',
      });
    }

    const commits = Number(database.xact_commit || 0);
    const rollbacks = Number(database.xact_rollback || 0);
    if (commits + rollbacks > 1000 && rollbacks / (commits + rollbacks) > 0.05) {
      advice.push({
        severity: 'info',
        title: 'Many transactions are rolled back',
        detail: `${percentText(rollbacks / (commits + rollbacks))} of transactions ended with rollback.`,
        recommendation: 'Check errors of applications - rollback is often result of failed statement.',
      });
    }

    if (Number(activity.idle_in_transaction || 0) > 0 && /^0$/.test(value('idle_in_transaction_session_timeout'))) {
      advice.push({
        severity: 'warning',
        title: 'Sessions are idle in transaction',
        detail: `${activity.idle_in_transaction} sessions keep open transaction without work - they hold locks and stop vacuum.`,
        recommendation: 'Fix the application or set idle_in_transaction_session_timeout.',
        variable: 'idle_in_transaction_session_timeout',
      });
    }

    if (checkpoints && Number(checkpoints.requested) > Number(checkpoints.timed) && Number(checkpoints.requested) > 10) {
      advice.push({
        severity: 'warning',
        title: 'Checkpoints are forced by WAL size',
        detail: `${checkpoints.requested} requested and ${checkpoints.timed} timed checkpoints, max_wal_size is ${formatBytesText(bytes('max_wal_size'))}.`,
        recommendation: 'Increase max_wal_size - frequent checkpoints write more data.',
        variable: 'max_wal_size',
      });
    }

    if (value('autovacuum') === 'off') {
      advice.push({
        severity: 'critical',
        title: 'Autovacuum is disabled',
        detail: 'Dead rows are not removed and statistics are not refreshed automatically.',
        recommendation: 'Enable autovacuum.',
        variable: 'autovacuum',
      });
    }

    const pending = settings.filter((row) => row.pending_restart);
    if (pending.length) {
      advice.push({
        severity: 'info',
        title: 'Restart is needed',
        detail: `Changed settings wait for restart: ${pending.map((row) => row.name).join(', ')}.`,
        recommendation: 'Restart PostgreSQL to use the new values.',
      });
    }
    return advice;
  }

  async variables(): Promise<ServerVariablesInterface> {
    const rows = await this.queryRows(
      `SELECT name, setting, current_setting(name, true) AS display, unit, category, short_desc, extra_desc, context, vartype,
              source, sourcefile, enumvals, boot_val, pending_restart, min_val, max_val
       FROM pg_settings ORDER BY name`,
    );
    return {
      supportsPersist: false,
      persistentChanges: true,
      variables: rows.map((row) => {
        const range = row.min_val !== null && row.max_val !== null ? ` Range ${row.min_val} - ${row.max_val}${row.unit ? ` ${row.unit}` : ''}.` : '';
        return {
          name: row.name,
          value: row.setting ?? '',
          display: row.display && row.display !== row.setting ? row.display : null,
          unit: row.unit,
          category: row.category,
          description: `${row.short_desc || ''}${row.extra_desc ? ` ${row.extra_desc}` : ''}${range}`.trim() || null,
          defaultValue: row.boot_val ?? null,
          source: row.sourcefile ? `${row.source} (${row.sourcefile})` : row.source,
          // internal - compiled in, cannot be changed
          editable: row.context !== 'internal',
          needsRestart: row.context === 'postmaster',
          pendingRestart: !!row.pending_restart,
          options: row.vartype === 'bool' ? ['on', 'off'] : Array.isArray(row.enumvals) ? row.enumvals : PostgresServerAdmin.textArray(row.enumvals),
        };
      }),
    };
  }

  /** {a,b} -> [a, b] when array type is not parsed */
  private static textArray(value: any): string[] | null {
    if (typeof value !== 'string' || !value.startsWith('{')) return null;
    return value.slice(1, -1).split(',').map((item) => item.replace(/^"(.*)"$/, '$1'));
  }

  async info(): Promise<ServerInfoInterface> {
    const [databases, collations, extensions, methods] = await Promise.all([
      this.queryRows(
        `SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate, datctype,
                CASE WHEN has_database_privilege(oid, 'CONNECT') THEN pg_database_size(oid) END AS size
         FROM pg_database WHERE NOT datistemplate ORDER BY datname`,
      ),
      this.queryRows(
        `SELECT collname, CASE collprovider WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' WHEN 'b' THEN 'builtin' ELSE 'default' END AS provider,
                COALESCE(pg_encoding_to_char(collencoding), '') AS encoding
         FROM pg_collation ORDER BY collname`,
      ),
      this.queryRows('SELECT name, default_version, installed_version, comment FROM pg_available_extensions ORDER BY installed_version IS NULL, name'),
      this.queryRows(`SELECT amname, CASE amtype WHEN 't' THEN 'table' WHEN 'i' THEN 'index' ELSE amtype::text END AS type FROM pg_am ORDER BY amtype DESC, amname`),
    ]);
    return {
      charsets: null,
      collations: collations.map((row) => ({name: row.collname, charset: row.encoding || 'any', isDefault: row.collname === 'default', provider: row.provider})),
      engines: methods.map((row) => ({name: row.amname, support: row.type, comment: row.type === 'table' ? 'Table access method' : 'Index access method', transactions: null})),
      extensions: extensions.map((row) => ({name: row.name, installed: row.installed_version, available: row.default_version, comment: row.comment || ''})),
      databases: databases.map((row) => ({name: row.datname, encoding: row.encoding, collation: row.datcollate || '', ctype: row.datctype || '', size: row.size === null ? null : Number(row.size)})),
    };
  }

  async buildSetVariable(request: SetVariableRequestInterface): Promise<string[]> {
    const name = String(request?.name || '').trim();
    if (!/^[A-Za-z0-9_.]+$/.test(name)) {
      throw new Error(`Invalid setting name ${name}`);
    }
    if (request.persist) {
      throw new Error('ALTER SYSTEM always keeps the value - persist option is not needed');
    }
    // written to postgresql.auto.conf, reload applies settings which do not need restart
    return [
      request.value === null || request.value === undefined
        ? `ALTER SYSTEM RESET ${PostgresSql.identifier(name)}`
        : `ALTER SYSTEM SET ${PostgresSql.identifier(name)} = ${PostgresSql.literal(String(request.value))}`,
      'SELECT pg_reload_conf()',
    ];
  }

  async executeSetVariable(statements: string[]): Promise<void> {
    // ALTER SYSTEM cannot run in transaction block
    for (const statement of statements) {
      await this.queryRows(statement);
    }
  }

  private replicationAdmin() {
    return new PostgresReplication(this.queryRows);
  }

  replication(): Promise<ReplicationInterface> {
    return this.replicationAdmin().replication();
  }

  logEvents(request: LogEventsRequestInterface): Promise<LogEventsInterface> {
    return this.replicationAdmin().logEvents(request);
  }

  buildReplicationAction(action: ReplicationActionType): Promise<string[]> {
    return this.replicationAdmin().buildAction(action);
  }

  executeReplicationAction(statements: string[]): Promise<void> {
    return this.replicationAdmin().executeAction(statements);
  }
}

export default PostgresServerAdmin;
