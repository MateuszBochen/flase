import DriverInterface from '../../DriverInterface';
import ConnectionDataType from '../../Type/ConnectionDataType';
import Database from '../../Type/Data/Database';
import stream, {TransformCallback} from 'stream';
import {Observable} from 'rxjs';
import {MysqlError} from 'mysql';
import RecordType from '../../Type/Data/RecordType';
import TableType from '../../Type/Data/TableType';
import TotalCountDto from '../../Dto/TotalCountDto';
import RowDto from '../../Dto/RowDto';
import ColumnType from '../../Type/Data/ColumnType';
import SelectFromType from '../../Type/Data/SelectFromType';
import MysqlColumnReference from './Type/MysqlColumnReference';
import ReferenceTableType from '../../Type/Data/ReferenceTableType';
import TableInformationType from '../../Type/Data/TableInformationType';
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');

class MysqlAdapter implements DriverInterface {
  private consoleLog = true;
  private nativeConnection: any;
  private connectionData: ConnectionDataType;
  private parser: typeof Parser;

  constructor(connectionData: ConnectionDataType) {
    this.connectionData = connectionData;
    this.parser = new Parser();
  }

  connect(): Promise<DriverInterface> {
    this.nativeConnection = mysql.createConnection({
      host: this.connectionData.host,
      user: this.connectionData.user,
      password: this.connectionData.password,
      insecureAuth: true,
      multipleStatements: true,
    });

    return new Promise((resolve, reject) => {
      this.nativeConnection.connect((err: any) => {
        if (err) {
          this.log(err);
          return reject(err);
        }
        setInterval(this.keepalive, 1000 * 60 * 5);

        resolve(this);
      });
    });
  }

  selectDatabase(database:string): Promise<void>
  {
    const useDatabaseQuery = `USE ${database}`;
    return new Promise((resolve, reject) => {
      this.nativeConnection.query(useDatabaseQuery, (err: any) => {
        // If change database fails
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }


  getListOfDatabases():Observable<Database> {
    const query = 'SHOW DATABASES';
    return new Observable(observer => {
      this.streamQueryResults(query).subscribe((record) => {
        observer.next({name: `${record.Database}`});
      });
    });
  }

  getListOfTablesInDatabase(databaseName:string): Observable<TableInformationType> {
    const useDatabaseQuery = `SHOW TABLES FROM \`${databaseName}\``;
    this.log('Show tables');
    return new Observable(observer => {
      this.streamQueryResults(useDatabaseQuery).subscribe((record) => {
        Object.entries(record).forEach((item) => {
          const tableName = record[item[0]]+'';
          const showKeysFromTableQuery = `SHOW KEYS FROM \`${databaseName}\`.\`${tableName}\` WHERE 1`;

          // send empty object to short loading
          observer.next({
            tableName: tableName,
            columns: [],
            preload: true,
            dataBaseName: databaseName,
            primaryColumns: [],
            uniqueColumns: [],
          });

          this.nativeConnection.query(showKeysFromTableQuery, (err: any, keysRecords: RecordType[]) => {
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
                primaryColumns: this.preparePrimaryColumns(columnsOfTable, keysRecords, databaseName),
                uniqueColumns: [],
              });
            });
          });
        });
      });
    });
  }

  getSelectFromTypeFromQuery(query:string): SelectFromType[]
  {
    try {
      const ast = this.parser.astify(query);
      return ast.from;
    } catch (e) {
      throw new Error(e);
    }
  }

  getColumnsOfTable(databaseName: string, selectFromType:SelectFromType): Promise<ColumnType[]> {
    const showColumnsQuery = `SHOW COLUMNS FROM \`${databaseName}\`.\`${selectFromType.table}\``;

    return new Promise((resolve, reject) => {
      this.nativeConnection.query(showColumnsQuery, (err: any, columns: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
          const newColumns: ColumnType[] = [];

          columns.forEach((column:any) => {
            const reference = this.findReference(column.Field, referencesResult);
            const columnType:ColumnType = {
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
        });
      });
    });
  }

  countRecords(query: string): Promise<TotalCountDto>
  {
    return new Promise((resolve, reject) => {
      let countQuery;
      try {
         countQuery = this.getAllCountRowsQuery(query);
      } catch (e) {
        console.log(444444444444444);
        reject(e);
        return;
      }

      if (countQuery === '') {
        reject('Fail');
      }

      this.nativeConnection.query(countQuery, (err: any, results: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new TotalCountDto(results[0].total));
      });
    });
  }

  streamSelect(query:string): Observable<RowDto> {
    return new Observable(observer => {
      this.streamQueryResults(query).subscribe((rowItem) => {
        observer.next(new RowDto(rowItem));
      });
    });
  }

  private streamQueryResults = (query:string):Observable<RecordType> => {
    this.log(`Query Stream: ${query}`);
    return new Observable(observer => {
      this.nativeConnection.query(query)
        .on('error', (error: MysqlError) => {
          observer.error(error);
        })
        .stream()
        .pipe(new stream.Transform({
          objectMode: true,
          transform: (row: RecordType, encoding: BufferEncoding, callback: TransformCallback) => {
            observer.next(row);
            try {
              callback();
            } catch (e) {
              console.log(e);
              observer.error(e);
            }
          }
        }))
      ;
    });
  }

  /**
   * Function helping change select query into count query
   */
  private getAllCountRowsQuery(query: string): string {

    const ast = this.parser.astify(query);

    ast.limit = null;
    ast.columns = [
      {
        expr: {
          type: 'aggr_func',
          name: 'COUNT',
          args: {
            expr: {
              type: 'star',
              value: '*'
            }
          },
          over: null
        },
        as: 'total'
      },
    ];

    return this.parser.sqlify(ast);
  }


  private getReferencesColumns(databaseName:string, tableName:string):Promise<ReferenceTableType[]> {
    const sql = `SELECT
          \`COLUMN_NAME\`,
          \`REFERENCED_TABLE_NAME\`,
          \`REFERENCED_COLUMN_NAME\`
      FROM \`INFORMATION_SCHEMA\`.\`KEY_COLUMN_USAGE\`
      WHERE
          \`TABLE_SCHEMA\` = '${databaseName}'
      AND \`TABLE_NAME\` = '${tableName}'
      AND \`REFERENCED_TABLE_NAME\` IS NOT NULL
      `;

    return new Promise((resolve, reject) => {
      this.nativeConnection.query(sql, (err: any, results: MysqlColumnReference[]) => {
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

  private findReference(columnName:string, references:ReferenceTableType[]):undefined|ReferenceTableType {
    if (references.length) {
      for (let i = 0; i < references.length; i++) {
        if (columnName === references[i].originColumnName) {
          return references[i];
        }
      }
    }

    return undefined;
  }


  private preparePrimaryColumns = (columnsOfTable:  ColumnType[], records: RecordType[], databaseName: string): ColumnType[] => {
    const columns:ColumnType[] = [];
    for (const tableColumn of columnsOfTable ) {
      for (const record of records) {
        if (record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY') {
          columns.push(tableColumn);
        }
      }
    }
    return columns;
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
      this.nativeConnection.query('SELECT 1 + 1 AS solution', (err:any) => {
        if (err) {
          console.log(err.code); // 'ER_BAD_DB_ERROR'
        }
        console.log('Keepalive RDS connection pool using connection id');
      });
    } catch (e) {
      console.log(e);
    }
  }
}

export default MysqlAdapter;
