import {
  AdviceInterface,
  ServerAdminInterface,
  ServerInfoInterface,
  ServerMetricInterface,
  ServerStatusInterface,
  ServerVariableInterface,
  ServerVariablesInterface,
  SetVariableRequestInterface,
  LogEventsInterface,
  LogEventsRequestInterface,
  ReplicationActionType,
  ReplicationInterface,
} from '../../Interface/Data/ServerInterface';
import MysqlReplication from './MysqlReplication';
import {formatBytesText, percentText} from '../ServerText';
const mysql = require('mysql');

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

const KEYWORD_VALUE = /^(ON|OFF|TRUE|FALSE|DEFAULT)$/i;
const NUMBER_VALUE = /^-?\d+(\.\d+)?$/;

/**
 * SHOW GLOBAL STATUS / VARIABLES, advisor, character sets and engines of MySQL / MariaDB.
 * @author Mateusz Bochen
 */
class MysqlServerAdmin implements ServerAdminInterface {
  constructor(private readonly queryRows: QueryRowsType, private readonly isMariaDb: () => Promise<boolean>) {
  }

  private async globalStatus(): Promise<Map<string, string>> {
    const rows = await this.queryRows('SHOW GLOBAL STATUS');
    return new Map(rows.map((row) => [row.Variable_name, String(row.Value ?? '')]));
  }

  private async globalVariables(): Promise<Map<string, string>> {
    const rows = await this.queryRows('SHOW GLOBAL VARIABLES');
    return new Map(rows.map((row) => [row.Variable_name, String(row.Value ?? '')]));
  }

  async status(withAdvice: boolean): Promise<ServerStatusInterface> {
    const [status, [server]] = await Promise.all([
      this.globalStatus(),
      this.queryRows('SELECT VERSION() AS `version`, @@max_connections AS `maxConnections`'),
    ]);
    const number = (name: string): number | null => status.has(name) && status.get(name) !== '' ? Number(status.get(name)) : null;
    const sum = (...names: string[]): number | null => {
      const values = names.map(number).filter((value): value is number => value !== null);
      return values.length ? values.reduce((total, value) => total + value, 0) : null;
    };
    const metric = (key: string, label: string, value: number | null, kind: 'counter' | 'gauge', unit: 'bytes' | 'seconds' | null = null): ServerMetricInterface => ({key, label, value, kind, unit});

    const metrics: ServerMetricInterface[] = [
      metric('connections', 'Connections', number('Threads_connected'), 'gauge'),
      metric('running', 'Running threads', number('Threads_running'), 'gauge'),
      metric('maxConnections', 'Max connections', Number(server.maxConnections), 'gauge'),
      metric('maxUsedConnections', 'Max used connections', number('Max_used_connections'), 'gauge'),
      metric('connectionAttempts', 'Connection attempts', number('Connections'), 'counter'),
      metric('abortedConnects', 'Aborted connects', number('Aborted_connects'), 'counter'),
      metric('queries', 'Queries', number('Questions'), 'counter'),
      metric('select', 'SELECT', number('Com_select'), 'counter'),
      metric('insert', 'INSERT', sum('Com_insert', 'Com_insert_select', 'Com_replace', 'Com_replace_select'), 'counter'),
      metric('update', 'UPDATE', sum('Com_update', 'Com_update_multi'), 'counter'),
      metric('delete', 'DELETE', sum('Com_delete', 'Com_delete_multi'), 'counter'),
      metric('commits', 'Commits', number('Com_commit'), 'counter'),
      metric('rollbacks', 'Rollbacks', number('Com_rollback'), 'counter'),
      metric('slowQueries', 'Slow queries', number('Slow_queries'), 'counter'),
      metric('bytesReceived', 'Received', number('Bytes_received'), 'counter', 'bytes'),
      metric('bytesSent', 'Sent', number('Bytes_sent'), 'counter', 'bytes'),
      metric('cacheRequests', 'Buffer pool read requests', number('Innodb_buffer_pool_read_requests'), 'counter'),
      metric('cacheMisses', 'Buffer pool reads from disk', number('Innodb_buffer_pool_reads'), 'counter'),
      metric('tmpDiskTables', 'Temporary tables on disk', number('Created_tmp_disk_tables'), 'counter'),
      metric('openTables', 'Open tables', number('Open_tables'), 'gauge'),
    ];

    const result: ServerStatusInterface = {
      version: server.version,
      uptime: number('Uptime') || 0,
      takenAt: Date.now(),
      metrics,
      raw: Array.from(status.entries()).map(([name, value]) => ({name, value})),
    };
    if (withAdvice) {
      result.advice = MysqlServerAdmin.advice(status, await this.globalVariables());
    }
    return result;
  }

  /** rules of advisor - measured values of running server compared with configuration */
  static advice(status: Map<string, string>, variables: Map<string, string>): AdviceInterface[] {
    const s = (name: string) => Number(status.get(name) || 0);
    const v = (name: string) => variables.get(name);
    const advice: AdviceInterface[] = [];
    const uptime = s('Uptime');

    if (uptime < 86400) {
      advice.push({
        severity: 'info',
        title: 'Server is running less than one day',
        detail: `Uptime ${Math.round(uptime / 3600)} h - counters do not describe usual traffic yet.`,
        recommendation: 'Check the advice again after the server has been running for a while.',
      });
    }

    const requests = s('Innodb_buffer_pool_read_requests');
    const diskReads = s('Innodb_buffer_pool_reads');
    if (requests > 10000) {
      const ratio = 1 - diskReads / requests;
      if (ratio < 0.99) {
        advice.push({
          severity: ratio < 0.95 ? 'critical' : 'warning',
          title: 'InnoDB buffer pool is too small',
          detail: `${percentText(ratio)} of reads are served from memory, innodb_buffer_pool_size is ${formatBytesText(Number(v('innodb_buffer_pool_size')))}.`,
          recommendation: 'Increase innodb_buffer_pool_size - on dedicated server usually 60-75 % of RAM.',
          variable: 'innodb_buffer_pool_size',
        });
      }
    }

    const maxConnections = Number(v('max_connections') || 0);
    if (maxConnections > 0) {
      const used = s('Max_used_connections') / maxConnections;
      if (used > 0.85) {
        advice.push({
          severity: used >= 1 ? 'critical' : 'warning',
          title: 'Connections are near the limit',
          detail: `Max used connections ${s('Max_used_connections')} of max_connections ${maxConnections} (${percentText(used)}).`,
          recommendation: 'Increase max_connections or use connection pooling in the application.',
          variable: 'max_connections',
        });
      }
    }

    if (s('Connections') > 100 && s('Aborted_connects') / s('Connections') > 0.1) {
      advice.push({
        severity: 'warning',
        title: 'Many connection attempts fail',
        detail: `${s('Aborted_connects')} of ${s('Connections')} connection attempts were aborted (${percentText(s('Aborted_connects') / s('Connections'))}).`,
        recommendation: 'Check credentials of applications, network and connect_timeout; blocked hosts depend on max_connect_errors.',
        variable: 'connect_timeout',
      });
    }

    if (s('Created_tmp_tables') > 100 && s('Created_tmp_disk_tables') / s('Created_tmp_tables') > 0.25) {
      advice.push({
        severity: 'warning',
        title: 'Temporary tables are written to disk',
        detail: `${percentText(s('Created_tmp_disk_tables') / s('Created_tmp_tables'))} of temporary tables were created on disk `
          + `(tmp_table_size ${formatBytesText(Number(v('tmp_table_size')))}, max_heap_table_size ${formatBytesText(Number(v('max_heap_table_size')))}).`,
        recommendation: 'Increase tmp_table_size together with max_heap_table_size, avoid TEXT / BLOB columns in GROUP BY / ORDER BY.',
        variable: 'tmp_table_size',
      });
    }

    if (/^(OFF|0)$/i.test(v('slow_query_log') || '')) {
      advice.push({
        severity: 'info',
        title: 'Slow query log is disabled',
        detail: 'Slow queries are only counted, not logged.',
        recommendation: `Enable slow_query_log - queries longer than long_query_time (${v('long_query_time') ?? '?'} s) are logged.`,
        variable: 'slow_query_log',
      });
    } else if (s('Questions') > 1000 && s('Slow_queries') / s('Questions') > 0.01) {
      advice.push({
        severity: 'warning',
        title: 'Many slow queries',
        detail: `${s('Slow_queries')} slow queries (${percentText(s('Slow_queries') / s('Questions'))} of all).`,
        recommendation: 'Look at the slow query log and add missing indexes.',
        variable: 'long_query_time',
      });
    }

    const tableOpenCache = Number(v('table_open_cache') || 0);
    if (tableOpenCache > 0 && s('Open_tables') >= tableOpenCache * 0.95 && uptime > 0 && s('Opened_tables') / (uptime / 3600) > 10) {
      advice.push({
        severity: 'warning',
        title: 'Table cache is full',
        detail: `Open tables ${s('Open_tables')} of table_open_cache ${tableOpenCache}, ${Math.round(s('Opened_tables') / (uptime / 3600))} tables opened per hour.`,
        recommendation: 'Increase table_open_cache (and open_files_limit if needed).',
        variable: 'table_open_cache',
      });
    }

    if (uptime > 0 && s('Select_full_join') / (uptime / 3600) > 1) {
      advice.push({
        severity: 'info',
        title: 'Joins without indexes',
        detail: `${s('Select_full_join')} joins scanned whole table (Select_full_join).`,
        recommendation: 'Add indexes on columns of JOIN conditions; log_queries_not_using_indexes shows them in slow log.',
        variable: 'log_queries_not_using_indexes',
      });
    }

    if (uptime > 0 && s('Sort_merge_passes') / (uptime / 3600) > 10) {
      advice.push({
        severity: 'info',
        title: 'Sorts need more passes',
        detail: `${s('Sort_merge_passes')} merge passes of sort (Sort_merge_passes).`,
        recommendation: 'Increase sort_buffer_size moderately or add indexes for ORDER BY.',
        variable: 'sort_buffer_size',
      });
    }

    if (s('Connections') > 1000 && s('Threads_created') / s('Connections') > 0.1) {
      advice.push({
        severity: 'info',
        title: 'Threads are created for new connections',
        detail: `${s('Threads_created')} threads created for ${s('Connections')} connections.`,
        recommendation: `Increase thread_cache_size (now ${v('thread_cache_size') ?? '?'}).`,
        variable: 'thread_cache_size',
      });
    }

    return advice;
  }

  async variables(): Promise<ServerVariablesInterface> {
    if (await this.isMariaDb()) {
      // MariaDB describes variables - read only flag, default, comment, allowed values
      const rows = await this.queryRows(
        `SELECT \`VARIABLE_NAME\`, \`GLOBAL_VALUE\`, \`SESSION_VALUE\`, \`DEFAULT_VALUE\`, \`VARIABLE_TYPE\`, \`VARIABLE_COMMENT\`,
                \`ENUM_VALUE_LIST\`, \`READ_ONLY\`, \`GLOBAL_VALUE_ORIGIN\`
         FROM \`information_schema\`.\`SYSTEM_VARIABLES\` ORDER BY \`VARIABLE_NAME\``,
      );
      return {
        supportsPersist: false,
        persistentChanges: false,
        variables: rows.map((row): ServerVariableInterface => {
          const type = String(row.VARIABLE_TYPE || '');
          return {
            name: String(row.VARIABLE_NAME).toLowerCase(),
            value: String(row.GLOBAL_VALUE ?? row.SESSION_VALUE ?? ''),
            display: null,
            unit: null,
            category: type || null,
            description: row.VARIABLE_COMMENT || null,
            defaultValue: row.DEFAULT_VALUE ?? null,
            source: row.GLOBAL_VALUE_ORIGIN || null,
            editable: row.READ_ONLY === 'NO' && row.GLOBAL_VALUE !== null,
            needsRestart: row.READ_ONLY === 'YES',
            pendingRestart: false,
            options: type === 'BOOLEAN' ? ['ON', 'OFF'] : row.ENUM_VALUE_LIST ? String(row.ENUM_VALUE_LIST).split(',') : null,
          };
        }),
      };
    }

    const [variables, info] = await Promise.all([
      this.globalVariables(),
      // performance_schema can be disabled
      this.queryRows('SELECT `VARIABLE_NAME`, `VARIABLE_SOURCE`, `MIN_VALUE`, `MAX_VALUE` FROM `performance_schema`.`variables_info`').catch(() => []),
    ]);
    const infoOf = new Map(info.map((row) => [row.VARIABLE_NAME, row]));
    return {
      supportsPersist: true,
      persistentChanges: false,
      variables: Array.from(variables.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]): ServerVariableInterface => {
        const row = infoOf.get(name);
        const range = row && row.MAX_VALUE !== null && row.MAX_VALUE !== undefined && String(row.MAX_VALUE) !== '0'
          ? `Range ${row.MIN_VALUE} - ${row.MAX_VALUE}`
          : null;
        return {
          name,
          value,
          display: null,
          unit: null,
          category: null,
          description: range,
          defaultValue: null,
          source: row?.VARIABLE_SOURCE || null,
          // MySQL does not tell which variables are dynamic - SET fails for the others
          editable: null,
          needsRestart: false,
          pendingRestart: false,
          options: /^(ON|OFF)$/.test(value) ? ['ON', 'OFF'] : null,
        };
      }),
    };
  }

  async info(): Promise<ServerInfoInterface> {
    const [charsets, collations, engines] = await Promise.all([
      this.queryRows('SELECT `CHARACTER_SET_NAME`, `DEFAULT_COLLATE_NAME`, `DESCRIPTION`, `MAXLEN` FROM `information_schema`.`CHARACTER_SETS` ORDER BY `CHARACTER_SET_NAME`'),
      this.queryRows(
        `SELECT \`COLLATION_NAME\`, \`CHARACTER_SET_NAME\`, \`IS_DEFAULT\` FROM \`information_schema\`.\`COLLATIONS\`
         WHERE \`CHARACTER_SET_NAME\` IS NOT NULL ORDER BY \`CHARACTER_SET_NAME\`, \`COLLATION_NAME\``,
      ),
      this.queryRows('SELECT `ENGINE`, `SUPPORT`, `COMMENT`, `TRANSACTIONS` FROM `information_schema`.`ENGINES` ORDER BY `SUPPORT` = \'NO\', `ENGINE`'),
    ]);
    return {
      charsets: charsets.map((row) => ({name: row.CHARACTER_SET_NAME, description: row.DESCRIPTION, defaultCollation: row.DEFAULT_COLLATE_NAME, maxLength: Number(row.MAXLEN)})),
      collations: collations.map((row) => ({name: row.COLLATION_NAME, charset: row.CHARACTER_SET_NAME, isDefault: /yes/i.test(row.IS_DEFAULT || ''), provider: null})),
      engines: engines.map((row) => ({name: row.ENGINE, support: row.SUPPORT, comment: row.COMMENT || '', transactions: row.TRANSACTIONS === null ? null : row.TRANSACTIONS === 'YES'})),
      extensions: null,
      databases: null,
    };
  }

  async buildSetVariable(request: SetVariableRequestInterface): Promise<string[]> {
    const name = String(request?.name || '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error(`Invalid variable name ${name}`);
    }
    if (request.persist && await this.isMariaDb()) {
      throw new Error('SET PERSIST is not available in MariaDB - change the configuration file to keep the value after restart');
    }
    let value: string;
    if (request.value === null || request.value === undefined) {
      value = 'DEFAULT';
    } else {
      const text = String(request.value).trim();
      value = NUMBER_VALUE.test(text) ? text : KEYWORD_VALUE.test(text) ? text.toUpperCase() : mysql.escape(String(request.value));
    }
    return [`SET ${request.persist ? 'PERSIST' : 'GLOBAL'} ${name} = ${value}`];
  }

  async executeSetVariable(statements: string[]): Promise<void> {
    for (const statement of statements) {
      await this.queryRows(statement);
    }
  }

  private replicationAdmin() {
    return new MysqlReplication(this.queryRows, this.isMariaDb);
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

export default MysqlServerAdmin;
