import DriverInterface from '../../DriverInterface';
import ConnectionDataType from '../../Type/ConnectionDataType';
import Database from '../../Type/Data/Database';
import stream, {TransformCallback} from 'stream';
import {Observable} from 'rxjs';
import {MysqlError} from 'mysql';
import RecordType from '../../Type/Data/RecordType';
import TableNameType from '../../Type/Data/TableNameType';
import TotalCountDto from '../../Dto/TotalCountDto';
import RowDto from '../../Dto/RowDto';
import ColumnType from '../../Type/Data/ColumnType';
import SelectFromType from '../../Type/Data/SelectFromType';
import MysqlColumnReference from './Type/MysqlColumnReference';
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');

class MysqlAdapter implements DriverInterface {
  private consoleLog = true;
  // private nativeConnections: {[key:string]: any};
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

  getListOfTablesInDatabase(databaseName:string): Observable<TableNameType> {
    const useDatabaseQuery = `USE ${databaseName}; SHOW TABLES`;

    let skip = true;
    this.log('Show tables');
    return new Observable(observer => {
      this.streamQueryResults(useDatabaseQuery).subscribe((record) => {
        if (!skip) {
          this.log('record');
          this.log(record);
          Object.entries(record).forEach((item) => {
            observer.next({name: `${record[item[0]]}`, databaseName});
          });
        }
        skip = false;
      });
    });
  }

  getSelectFromTypeFromQuery(query:string): SelectFromType[]
  {
    const ast = this.parser.astify(query);
    return ast.from;
  }

  getColumnsOfTable(databaseName: string, selectFromType:SelectFromType): Promise<ColumnType[]> {
    const showColumnsQuery = `SHOW COLUMNS FROM \`${selectFromType.table}\``;

    return new Promise((resolve, reject) => {
      this.nativeConnection.query(showColumnsQuery, (err: any, columns: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
          console.log('referencesResult', referencesResult);

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
              referenceColumn: reference.REFERENCED_COLUMN_NAME,
              referenceTable: reference.REFERENCED_TABLE_NAME,
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
    const countQuery = this.getAllCountRowsQuery(query);
    return new Promise((resolve, reject) => {
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
            this.log(`Query Stream result: ${query}`);
            this.log(row);
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


  private getReferencesColumns(databaseName:string, tableName:string):Promise<MysqlColumnReference[]> {
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
      this.nativeConnection.query(sql, (err: any, results: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  }

  private findReference(columnName:string, references:MysqlColumnReference[]):MysqlColumnReference {
    if (references.length) {
      for (let i = 0; i < references.length; i++) {
        if (columnName === references[i].COLUMN_NAME) {
          return references[i];
        }
      }
    }

    return {
      COLUMN_NAME: '',
      REFERENCED_TABLE_NAME: '',
      REFERENCED_COLUMN_NAME: '',
    }
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
