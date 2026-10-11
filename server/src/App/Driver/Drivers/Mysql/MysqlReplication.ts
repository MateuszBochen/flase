import {
  LogEventsInterface,
  LogEventsRequestInterface,
  ReplicationActionType,
  ReplicationInterface,
  ReplicationSummaryItemInterface,
  ReplicationTableInterface,
} from '../../Interface/Data/ServerInterface';
const mysql = require('mysql');

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

/** variables shown in replication view */
const SETTINGS = [
  'server_id', 'log_bin', 'log_bin_basename', 'binlog_format', 'binlog_row_image', 'sync_binlog',
  'binlog_expire_logs_seconds', 'expire_logs_days', 'gtid_mode', 'enforce_gtid_consistency', 'gtid_domain_id',
  'gtid_binlog_pos', 'gtid_current_pos', 'gtid_slave_pos', 'read_only', 'super_read_only', 'relay_log',
  'rpl_semi_sync_master_enabled', 'rpl_semi_sync_slave_enabled', 'log_slave_updates', 'log_replica_updates',
];

const LOG_FILE = /^[\w.-]+$/;

/** value of first existing column - MySQL 8.4 uses Replica / Source, MariaDB and older MySQL Slave / Master */
const pick = (row: any, ...names: string[]): any => {
  const name = names.find((item) => row && row[item] !== undefined);
  return name ? row[name] : undefined;
};

const text = (value: any): string | null => value === null || value === undefined || value === '' ? null : String(value);

/**
 * Replication of MySQL / MariaDB - binary log of source, replica channels, connected replicas, events of binary logs.
 * @author Mateusz Bochen
 */
class MysqlReplication {
  constructor(private readonly queryRows: QueryRowsType, private readonly isMariaDb: () => Promise<boolean>) {
  }

  /** first statement which works - names of statements changed between versions */
  private async first(statements: string[]): Promise<any[]> {
    let error: any = null;
    for (const statement of statements) {
      try {
        return await this.queryRows(statement);
      } catch (e) {
        error = e;
      }
    }
    throw error;
  }

  async replication(): Promise<ReplicationInterface> {
    const mariaDb = await this.isMariaDb();
    const warnings: string[] = [];
    const load = async <T>(part: string, loader: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await loader();
      } catch (e: any) {
        warnings.push(`${part}: ${e?.sqlMessage || e?.message || e}`);
        return fallback;
      }
    };

    const variables = new Map((await this.queryRows('SHOW GLOBAL VARIABLES WHERE `Variable_name` IN (?)', [SETTINGS]))
      .map((row) => [row.Variable_name, String(row.Value ?? '')]));
    const binaryLogging = /^(ON|1)$/i.test(variables.get('log_bin') || '');

    const [sourceStatus, channels, hosts, dumps] = await Promise.all([
      binaryLogging ? load('Binary log status', () => this.first(['SHOW BINARY LOG STATUS', 'SHOW MASTER STATUS']), []) : Promise.resolve([]),
      load('Replica status', () => this.first(mariaDb
        ? ['SHOW ALL REPLICAS STATUS', 'SHOW ALL SLAVES STATUS']
        : ['SHOW REPLICA STATUS', 'SHOW SLAVE STATUS']), []),
      load('Connected replicas', () => this.first(mariaDb
        ? ['SHOW REPLICA HOSTS', 'SHOW SLAVE HOSTS']
        : ['SHOW REPLICAS', 'SHOW SLAVE HOSTS']), []),
      load('Replication threads', () => this.queryRows(
        "SELECT `ID`, `USER`, `HOST`, `TIME`, `STATE` FROM `information_schema`.`PROCESSLIST` WHERE `COMMAND` LIKE 'Binlog Dump%'",
      ), []),
    ]);

    let logs: ReplicationInterface['logs'] = null;
    let logsMessage: string | null = null;
    if (binaryLogging) {
      try {
        logs = (await this.queryRows('SHOW BINARY LOGS')).map((row) => ({name: row.Log_name, size: row.File_size === undefined ? null : Number(row.File_size), modified: null}));
      } catch (e: any) {
        logsMessage = e?.sqlMessage || e?.message;
      }
    } else {
      logsMessage = 'Binary logging is disabled (log_bin = OFF) - the server cannot be source of replication. Start the server with log_bin to enable it.';
    }

    const source = sourceStatus[0];
    const summary: ReplicationSummaryItemInterface[] = [];
    const role = channels.length ? (dumps.length ? 'source and replica' : 'replica') : dumps.length || hosts.length ? 'source' : 'standalone';
    summary.push({label: 'Role', value: role, state: null});
    summary.push({label: 'Server ID', value: variables.get('server_id') || '?', state: null});
    summary.push({
      label: 'Binary log',
      value: binaryLogging ? `ON${variables.get('binlog_format') ? `, ${variables.get('binlog_format')}` : ''}` : 'OFF',
      state: binaryLogging ? 'ok' : null,
    });
    if (source) {
      summary.push({label: 'Current position', value: `${source.File}:${source.Position}`, state: null});
    }
    const gtid = mariaDb ? text(variables.get('gtid_current_pos')) : text(source?.Executed_Gtid_Set);
    summary.push({
      label: 'GTID',
      value: mariaDb ? gtid || 'none' : `${variables.get('gtid_mode') || 'OFF'}${gtid ? ` · ${gtid}` : ''}`,
      state: null,
    });
    summary.push({label: 'Connected replicas', value: String(Math.max(hosts.length, dumps.length)), state: null});
    if (/^(ON|1)$/i.test(variables.get('read_only') || '')) {
      summary.push({label: 'Read only', value: /^(ON|1)$/i.test(variables.get('super_read_only') || '') ? 'super_read_only' : 'read_only', state: null});
    }

    const channelRows = channels.map((row) => {
      const io = text(pick(row, 'Replica_IO_Running', 'Slave_IO_Running'));
      const sql = text(pick(row, 'Replica_SQL_Running', 'Slave_SQL_Running'));
      const lag = text(pick(row, 'Seconds_Behind_Source', 'Seconds_Behind_Master'));
      const error = text(pick(row, 'Last_IO_Error')) || text(pick(row, 'Last_SQL_Error'));
      const channel = text(pick(row, 'Channel_Name', 'Connection_name')) || '';
      summary.push({
        label: `Replication${channel ? ` ${channel}` : ''}`,
        value: io === 'Yes' && sql === 'Yes' ? `running, lag ${lag ?? '?'} s` : `IO ${io}, SQL ${sql}`,
        state: error ? 'error' : io === 'Yes' && sql === 'Yes' ? (Number(lag) > 60 ? 'warning' : 'ok') : 'warning',
      });
      return [
        channel || '(default)',
        `${pick(row, 'Source_Host', 'Master_Host')}:${pick(row, 'Source_Port', 'Master_Port')}`,
        text(pick(row, 'Source_User', 'Master_User')),
        io,
        sql,
        lag,
        `${pick(row, 'Source_Log_File', 'Master_Log_File')}:${pick(row, 'Read_Source_Log_Pos', 'Read_Master_Log_Pos')}`,
        text(pick(row, 'Replica_SQL_Running_State', 'Slave_SQL_Running_State')),
        error,
      ];
    });

    const tables: ReplicationTableInterface[] = [
      {
        id: 'channels',
        title: 'Replica channels',
        columns: ['Channel', 'Source', 'User', 'IO thread', 'SQL thread', 'Lag (s)', 'Read position', 'State', 'Last error'],
        rows: channelRows,
        empty: 'This server does not replicate from any source.',
      },
      {
        id: 'replicas',
        title: 'Connected replicas',
        columns: ['Server ID', 'Host', 'Port', 'Source ID'],
        rows: hosts.map((row) => [text(row.Server_Id ?? row.Server_id), text(row.Host), text(row.Port), text(pick(row, 'Source_Id', 'Master_Id', 'Master_id'))]),
        empty: 'No replica is registered on this server.',
      },
      {
        id: 'threads',
        title: 'Binlog dump threads',
        columns: ['Thread', 'User', 'Host', 'Time (s)', 'State'],
        rows: dumps.map((row) => [text(row.ID), text(row.USER), text(row.HOST), text(row.TIME), text(row.STATE)]),
        empty: 'No replica reads the binary log now.',
      },
      ...channels.map((row, index): ReplicationTableInterface => ({
        id: `channel-status:${index}`,
        title: `Replica status${channelRows[index][0] !== '(default)' ? ` - ${channelRows[index][0]}` : ''}`,
        columns: ['Field', 'Value'],
        rows: Object.entries(row).map(([name, value]) => [name, text(value)]),
        empty: '',
      })),
      {
        id: 'settings',
        title: 'Settings',
        columns: ['Variable', 'Value'],
        rows: SETTINGS.filter((name) => variables.has(name)).map((name) => [name, variables.get(name) || '']),
        empty: '',
      },
    ];

    return {
      role,
      summary,
      tables,
      logs,
      logsTitle: 'Binary logs',
      logsMessage,
      logEvents: !!logs,
      actions: [
        ...(binaryLogging ? ['flushLogs', 'purgeLogs'] as const : []),
        ...(channels.length ? ['startReplica', 'stopReplica'] as const : []),
      ],
      warnings,
    };
  }

  async logEvents(request: LogEventsRequestInterface): Promise<LogEventsInterface> {
    const file = String(request?.file || '');
    if (!LOG_FILE.test(file)) {
      throw new Error(`Invalid log file ${file}`);
    }
    const offset = Math.max(0, Math.floor(Number(request.offset) || 0));
    const limit = Math.min(1000, Math.max(1, Math.floor(Number(request.limit) || 100)));
    const rows = await this.queryRows('SHOW BINLOG EVENTS IN ? LIMIT ?, ?', [file, offset, limit]);
    return {
      file,
      offset,
      events: rows.map((row) => ({
        position: Number(row.Pos),
        type: row.Event_type,
        serverId: String(row.Server_id),
        endPosition: Number(row.End_log_pos),
        info: row.Info || '',
      })),
    };
  }

  async buildAction(action: ReplicationActionType): Promise<string[]> {
    const mariaDb = await this.isMariaDb();
    const channel = (name?: string): string => {
      if (!name) return '';
      if (!/^[\w-]+$/.test(name)) throw new Error(`Invalid channel ${name}`);
      return mariaDb ? ` ${mysql.escape(name)}` : ` FOR CHANNEL ${mysql.escape(name)}`;
    };
    switch (action?.kind) {
      case 'flushLogs':
        return ['FLUSH BINARY LOGS'];
      case 'purgeLogs':
        if (!LOG_FILE.test(String(action.to || ''))) {
          throw new Error(`Invalid log file ${action.to}`);
        }
        return [`PURGE BINARY LOGS TO ${mysql.escape(action.to)}`];
      case 'startReplica':
        return [`START REPLICA${channel(action.channel)}`];
      case 'stopReplica':
        return [`STOP REPLICA${channel(action.channel)}`];
      default:
        throw new Error(`${(action as any)?.kind} is not available in MySQL / MariaDB`);
    }
  }

  async executeAction(statements: string[]): Promise<void> {
    for (const statement of statements) {
      await this.queryRows(statement);
    }
  }
}

export default MysqlReplication;
