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
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');

class MysqlAdapter implements DriverInterface {
  private consoleLog = true;
  private pool: Pool | null = null;
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
    const pool: Pool = mysql.createPool({
      host: this.dsnOptions.host,
      // undefined falls back to the driver default (3306)
      port: this.dsnOptions.port,
      user: this.connectionData.userData.username,
      password: this.connectionData.userData.password,
      insecureAuth: true,
      multipleStatements: true,
      connectionLimit: 10,
    });

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
        this.keepaliveIntervalId = setInterval(this.keepalive, 1000 * 60 * 5);
        resolve(this);
      });
    });
  }

  disconnect(): void {
    if (this.keepaliveIntervalId) {
      clearInterval(this.keepaliveIntervalId);
      this.keepaliveIntervalId = null;
    }

    if (this.pool) {
      this.pool.end((err) => err && this.log(err));
      this.pool = null;
    }
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
            const columnType:ColumnInterface = {
              table: {databaseName, name: selectFromType.table, alias: selectFromType.as},
              autoIncrement: column.Extra === 'auto_increment',
              defaultValue: column.Default,
              name: column.Field,
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

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('Not connected');
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
    try {
      this.getPool().query('SELECT 1 + 1 AS solution', (err: MysqlError | null) => {
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
