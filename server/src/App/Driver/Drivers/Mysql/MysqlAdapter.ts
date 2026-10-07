import DriverInterface from '../../DriverInterface';
import DatabaseInterface from '../../Interface/Data/DatabaseInterface';
import {Observable} from 'rxjs';
import {MysqlError, Pool, PoolConnection} from 'mysql';
import RecordType from '../../../../Driver/Type/Data/RecordType';
import ColumnInterface from '../../Interface/Data/ColumnInterface';
import SelectFromType from '../../../../Driver/Type/Data/SelectFromType';
import MysqlColumnReference from './Type/MysqlColumnReference';
import ReferenceTableInterface from '../../Interface/Data/ReferenceTableInterface';
import TableInformationInterface from '../../Interface/Data/TableInformationInterface';
import ConnectionRequestInterface from '../../../Connection/Interface/ConnectionRequestInterface';
import {ParsedDsn} from '@soluble/dsn-parser';
import DriverSessionInterface from '../../DriverSessionInterface';
import MysqlSession from './MysqlSession';
import TableInterface from '../../Interface/Data/TableInterface';
import RowChangeInterface, {RowValuesType} from '../../Interface/Data/RowChangeInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');

class MysqlAdapter implements DriverInterface {
  private consoleLog = true;
  private pool: Pool | null = null;
  /** credentials were verified and disconnect was not called */
  private connected = false;
  private keepaliveIntervalId: NodeJS.Timeout | null = null;
  private connectionData: ConnectionRequestInterface;
  private parser: typeof Parser;
  private dsnOptions: ParsedDsn;

  constructor(connectionData: ConnectionRequestInterface, dsnOptions: ParsedDsn) {
    this.connectionData = connectionData;
    this.parser = new Parser();
    this.dsnOptions = dsnOptions;
  }

  connect(): Promise<DriverInterface> {
    const pool = this.createPool();

    // check credentials with first connection
    return new Promise((resolve, reject) => {
      pool.getConnection((err: MysqlError, connection: PoolConnection) => {
        if (err) {
          this.log(err);
          pool.end();
          reject(err);
          return;
        }
        connection.release();

        this.pool = pool;
        this.connected = true;
        this.keepaliveIntervalId = setInterval(this.keepalive, 1000 * 60 * 5);
        resolve(this);
      });
    });
  }

  disconnect(): void {
    this.connected = false;
    if (this.keepaliveIntervalId) {
      clearInterval(this.keepaliveIntervalId);
      this.keepaliveIntervalId = null;
    }
    this.releaseConnections();
  }

  releaseConnections(): void {
    if (this.pool) {
      this.pool.end((err) => err && this.log(err));
      this.pool = null;
    }
  }

  private createPool(): Pool {
    return mysql.createPool({
      host: this.dsnOptions.host,
      // undefined falls back to the driver default (3306)
      port: this.dsnOptions.port,
      user: this.connectionData.userData.username,
      password: this.connectionData.userData.password,
      insecureAuth: true,
      multipleStatements: true,
      connectionLimit: 5,
      // values must stay as they are in database - dates without timezone shift, big numbers without rounding
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
  }

  openSession(database: string): Promise<DriverSessionInterface> {
    return new Promise((resolve, reject) => {
      this.getPool().getConnection((err: MysqlError, connection: PoolConnection) => {
        if (err) {
          reject(err);
          return;
        }

        connection.query('USE ??', [database], (useErr: MysqlError | null) => {
          if (useErr) {
            connection.release();
            reject(useErr);
            return;
          }
          resolve(new MysqlSession(connection, this.parser));
        });
      });
    });
  }

  getListOfDatabases():Observable<DatabaseInterface> {
    const query = 'SHOW DATABASES';
    return new Observable(observer => {
      this.streamQueryResults(query).subscribe({
        next: (record) => observer.next({name: `${record.Database}`}),
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
    });
  }

  getListOfTablesInDatabase(databaseName:string): Observable<TableInformationInterface> {
    const showTablesQuery = mysql.format('SHOW TABLES FROM ??', [databaseName]);
    this.log('Show tables');

    return new Observable(observer => {
      // tables still waiting for keys and columns
      let pending = 0;
      let allTablesListed = false;
      const completeIfDone = () => {
        if (allTablesListed && pending === 0) {
          observer.complete();
        }
      };

      this.streamQueryResults(showTablesQuery).subscribe({
        next: (record) => {
          Object.values(record).forEach((value) => {
            const tableName = `${value}`;
            const showKeysFromTableQuery = mysql.format('SHOW KEYS FROM ??.??', [databaseName, tableName]);
            pending++;

            // send empty object to short loading
            observer.next({
              tableName: tableName,
              columns: [],
              preload: true,
              dataBaseName: databaseName,
              primaryColumns: [],
              uniqueColumns: [],
            });

            this.getPool().query(showKeysFromTableQuery, (err: MysqlError | null, keysRecords: RecordType[]) => {
              if (err) {
                observer.error(err);
                return;
              }

              this.getColumnsOfTable(databaseName, {table: tableName}).then((columnsOfTable) => {
                observer.next({
                  tableName: tableName,
                  columns: columnsOfTable,
                  preload: false,
                  dataBaseName: databaseName,
                  primaryColumns: this.preparePrimaryColumns(columnsOfTable, keysRecords),
                  uniqueColumns: [],
                });
                pending--;
                completeIfDone();
              }).catch((error) => observer.error(error));
            });
          });
        },
        error: (error) => observer.error(error),
        complete: () => {
          allTablesListed = true;
          completeIfDone();
        },
      });
    });
  }

  getSelectFromTypeFromQuery(query:string): SelectFromType[]
  {
    const ast = this.parser.astify(query);
    const statement = Array.isArray(ast) ? ast[0] : ast;
    return statement?.from || [];
  }

  getColumnsOfTable(databaseName: string, selectFromType:SelectFromType): Promise<ColumnInterface[]> {
    const showColumnsQuery = mysql.format('SHOW COLUMNS FROM ??.??', [databaseName, selectFromType.table]);

    return new Promise((resolve, reject) => {
      this.getPool().query(showColumnsQuery, (err: MysqlError | null, columns: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
          const newColumns: ColumnInterface[] = [];

          columns.forEach((column:any) => {
            const reference = this.findReference(column.Field, referencesResult);
            const type = `${column.Type}`;
            const columnType:ColumnInterface = {
              table: {databaseName, name: selectFromType.table, alias: selectFromType.as},
              autoIncrement: column.Extra === 'auto_increment',
              defaultValue: column.Default,
              name: column.Field,
              key: column.Field,
              orgName: column.Field,
              type,
              enumValues: MysqlAdapter.parseEnumValues(type),
              editable: MysqlAdapter.isEditableType(type) && !/GENERATED/i.test(column.Extra || ''),
              nullable: column.Null === 'YES',
              primaryKey: column.Key === 'PRI',
              reference,
            }
            newColumns.push(columnType);
          });

          resolve(newColumns);
        }).catch(reject);
      });
    });
  }

  getEditableTableOfQuery(query: string): {table: SelectFromType | null, reason?: string} {
    let parsed;
    try {
      parsed = this.parser.astify(query);
    } catch (e) {
      return {table: null, reason: 'Query could not be analysed'};
    }

    const statements = Array.isArray(parsed) ? parsed : [parsed];
    const ast = statements[0];
    if (statements.length !== 1 || ast?.type !== 'select') {
      return {table: null, reason: 'Only single SELECT result can be edited'};
    }
    if (ast._next || ast.union) {
      return {table: null, reason: 'Result of UNION cannot be edited'};
    }
    if (ast.with) {
      return {table: null, reason: 'Result of WITH query cannot be edited'};
    }
    if (!ast.from?.length) {
      return {table: null, reason: 'Result does not come from a table'};
    }
    if (ast.from.length > 1) {
      return {table: null, reason: 'Result comes from more tables (JOIN)'};
    }
    if (!ast.from[0].table || ast.from[0].expr) {
      return {table: null, reason: 'Result comes from sub query'};
    }
    const groupBy = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby?.columns;
    if (ast.distinct || groupBy?.length || ast.having) {
      return {table: null, reason: 'Grouped or DISTINCT result cannot be edited'};
    }
    const columns = Array.isArray(ast.columns) ? ast.columns : [];
    if (columns.some((column: any) => column?.expr?.type === 'aggr_func')) {
      return {table: null, reason: 'Aggregated result cannot be edited'};
    }

    return {table: ast.from[0]};
  }

  buildRowChangeStatements(table: TableInterface, changes: RowChangeInterface[]): RowChangeStatementInterface[] {
    return changes.map((change) => {
      const limit = change.limitOne ? ' LIMIT 1' : '';

      switch (change.kind) {
        case 'update':
          if (!change.values || !Object.keys(change.values).length) {
            throw new Error('Update without values');
          }
          return {
            sql: mysql.format('UPDATE ??.?? SET ? WHERE ', [table.databaseName, table.name, change.values])
              + MysqlAdapter.buildWhere(change.where) + limit,
            expectOneRow: true,
          };
        case 'delete':
          return {
            sql: mysql.format('DELETE FROM ??.?? WHERE ', [table.databaseName, table.name])
              + MysqlAdapter.buildWhere(change.where) + limit,
            expectOneRow: true,
          };
        case 'insert': {
          const values = change.values || {};
          const columns = Object.keys(values);
          return {
            sql: columns.length
              ? mysql.format('INSERT INTO ??.?? (??) VALUES (?)', [table.databaseName, table.name, columns, columns.map((column) => values[column])])
              : mysql.format('INSERT INTO ??.?? () VALUES ()', [table.databaseName, table.name]),
            expectOneRow: false,
          };
        }
        default:
          throw new Error(`Unknown change ${(change as RowChangeInterface).kind}`);
      }
    });
  }

  /** NULL must be compared with IS NULL, `= NULL` never matches */
  private static buildWhere(where?: RowValuesType): string {
    const entries = Object.entries(where || {});
    if (!entries.length) {
      // never change whole table
      throw new Error('Row cannot be identified - missing WHERE values');
    }

    return entries
      .map(([column, value]) => value === null
        ? mysql.format('?? IS NULL', [column])
        : mysql.format('?? = ?', [column, value]))
      .join(' AND ');
  }

  /** enum('a','it''s') -> ['a', "it's"] */
  private static parseEnumValues(type: string): string[] | undefined {
    const match = /^enum\((.*)\)$/i.exec(type);
    if (!match) {
      return undefined;
    }
    const values: string[] = [];
    const valueRegex = /'((?:[^']|'')*)'/g;
    let item;
    while ((item = valueRegex.exec(match[1])) !== null) {
      values.push(item[1].replace(/''/g, "'"));
    }
    return values;
  }

  /** binary values are not sent to client in editable form */
  private static isEditableType(type: string): boolean {
    return !/blob|binary|^bit|geometry|point|linestring|polygon/i.test(type);
  }

  /** pool is opened again after releaseConnections */
  private getPool(): Pool {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.pool) {
      this.pool = this.createPool();
    }
    return this.pool;
  }

  private streamQueryResults = (query:string):Observable<RecordType> => {
    this.log(`Query Stream: ${query}`);

    return new Observable(observer => {
      this.getPool().query(query)
        .on('error', (error: MysqlError) => observer.error(error))
        .on('result', (row: RecordType) => observer.next(row))
        // 'end' is emitted also after error - complete is then ignored by rxjs
        .on('end', () => observer.complete());
    });
  }

  private getReferencesColumns(databaseName:string, tableName:string):Promise<ReferenceTableInterface[]> {
    const sql = `SELECT
          \`COLUMN_NAME\`,
          \`REFERENCED_TABLE_NAME\`,
          \`REFERENCED_COLUMN_NAME\`
      FROM \`INFORMATION_SCHEMA\`.\`KEY_COLUMN_USAGE\`
      WHERE
          \`TABLE_SCHEMA\` = ?
      AND \`TABLE_NAME\` = ?
      AND \`REFERENCED_TABLE_NAME\` IS NOT NULL
      `;

    return new Promise((resolve, reject) => {
      this.getPool().query(sql, [databaseName, tableName], (err: MysqlError | null, results: MysqlColumnReference[]) => {
        if (err) {
          reject(err);
          return;
        }

        const converted = results.map((result) => {
          return {
            columnName: result.REFERENCED_COLUMN_NAME,
            originColumnName: result.COLUMN_NAME,
            table: {
              databaseName,
              name: result.REFERENCED_TABLE_NAME
            }
          }
        });

        resolve(converted);
      });
    });
  }

  private findReference(columnName:string, references:ReferenceTableInterface[]):undefined|ReferenceTableInterface {
    return references.find((reference) => reference.originColumnName === columnName);
  }

  private preparePrimaryColumns = (columnsOfTable: ColumnInterface[], records: RecordType[]): ColumnInterface[] => {
    return columnsOfTable.filter((tableColumn) => records.some((record) => {
      return record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY';
    }));
  }

  private log(input:any): void {
    if (this.consoleLog) {
      if(typeof input === 'string') {
        console.log(`\x1b[33m ${input} \x1b[0m`);
      } else {
        console.log(input);
      }
    }
  }

  private keepalive = () => {
    // released pool is not opened just for keepalive
    if (!this.pool) {
      return;
    }
    try {
      this.pool.query('SELECT 1 + 1 AS solution', (err: MysqlError | null) => {
        if (err) {
          console.log(err.code); // 'ER_BAD_DB_ERROR'
        }
      });
    } catch (e) {
      console.log(e);
    }
  }
}

export default MysqlAdapter;
