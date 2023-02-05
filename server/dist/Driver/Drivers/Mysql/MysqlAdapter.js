"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = __importDefault(require("stream"));
const rxjs_1 = require("rxjs");
const TotalCountDto_1 = __importDefault(require("../../Dto/TotalCountDto"));
const RowDto_1 = __importDefault(require("../../Dto/RowDto"));
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');
class MysqlAdapter {
    constructor(connectionData) {
        this.consoleLog = true;
        this.streamQueryResults = (query) => {
            this.log(`Query Stream: ${query}`);
            return new rxjs_1.Observable(observer => {
                this.nativeConnection.query(query)
                    .on('error', (error) => {
                    observer.error(error);
                })
                    .stream()
                    .pipe(new stream_1.default.Transform({
                    objectMode: true,
                    transform: (row, encoding, callback) => {
                        this.log(`Query Stream result: ${query}`);
                        this.log(row);
                        observer.next(row);
                        try {
                            callback();
                        }
                        catch (e) {
                            console.log(e);
                            observer.error(e);
                        }
                    }
                }));
            });
        };
        this.keepalive = () => {
            try {
                this.nativeConnection.query('SELECT 1 + 1 AS solution', (err) => {
                    if (err) {
                        console.log(err.code); // 'ER_BAD_DB_ERROR'
                    }
                    console.log('Keepalive RDS connection pool using connection id');
                });
            }
            catch (e) {
                console.log(e);
            }
        };
        this.connectionData = connectionData;
        this.parser = new Parser();
    }
    connect() {
        this.nativeConnection = mysql.createConnection({
            host: this.connectionData.host,
            user: this.connectionData.user,
            password: this.connectionData.password,
            insecureAuth: true,
            multipleStatements: true,
        });
        return new Promise((resolve, reject) => {
            this.nativeConnection.connect((err) => {
                if (err) {
                    this.log(err);
                    return reject(err);
                }
                setInterval(this.keepalive, 1000 * 60 * 5);
                resolve(this);
            });
        });
    }
    selectDatabase(database) {
        const useDatabaseQuery = `USE ${database}`;
        return new Promise((resolve, reject) => {
            this.nativeConnection.query(useDatabaseQuery, (err) => {
                // If change database fails
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    getListOfDatabases() {
        const query = 'SHOW DATABASES';
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(query).subscribe((record) => {
                observer.next({ name: `${record.Database}` });
            });
        });
    }
    getListOfTablesInDatabase(databaseName) {
        const useDatabaseQuery = `USE ${databaseName}; SHOW TABLES`;
        let skip = true;
        this.log('Show tables');
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(useDatabaseQuery).subscribe((record) => {
                if (!skip) {
                    this.log('record');
                    this.log(record);
                    Object.entries(record).forEach((item) => {
                        observer.next({ name: `${record[item[0]]}`, databaseName });
                    });
                }
                skip = false;
            });
        });
    }
    getSelectFromTypeFromQuery(query) {
        const ast = this.parser.astify(query);
        return ast.from;
    }
    getColumnsOfTable(databaseName, selectFromType) {
        const showColumnsQuery = `SHOW COLUMNS FROM \`${selectFromType.table}\``;
        return new Promise((resolve, reject) => {
            this.nativeConnection.query(showColumnsQuery, (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
                    console.log('referencesResult', referencesResult);
                    const newColumns = [];
                    columns.forEach((column) => {
                        const reference = this.findReference(column.Field, referencesResult);
                        const columnType = {
                            table: { databaseName, name: selectFromType.table, alias: selectFromType.as },
                            autoIncrement: column.Extra === 'auto_increment',
                            defaultValue: column.Default,
                            name: column.Field,
                            nullable: column.Null === 'YES',
                            primaryKey: column.Key === 'PRI',
                            referenceColumn: reference.REFERENCED_COLUMN_NAME,
                            referenceTable: reference.REFERENCED_TABLE_NAME,
                        };
                        newColumns.push(columnType);
                    });
                    resolve(newColumns);
                });
            });
        });
    }
    countRecords(query) {
        const countQuery = this.getAllCountRowsQuery(query);
        return new Promise((resolve, reject) => {
            this.nativeConnection.query(countQuery, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(new TotalCountDto_1.default(results[0].total));
            });
        });
    }
    streamSelect(query) {
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(query).subscribe((rowItem) => {
                observer.next(new RowDto_1.default(rowItem));
            });
        });
    }
    /**
     * Function helping change select query into count query
     */
    getAllCountRowsQuery(query) {
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
    getReferencesColumns(databaseName, tableName) {
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
            this.nativeConnection.query(sql, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(results);
            });
        });
    }
    findReference(columnName, references) {
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
        };
    }
    log(input) {
        if (this.consoleLog) {
            if (typeof input === 'string') {
                console.log(`\x1b[33m ${input} \x1b[0m`);
            }
            else {
                console.log(input);
            }
        }
    }
}
exports.default = MysqlAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0RyaXZlci9Ecml2ZXJzL015c3FsL015c3FsQWRhcHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUdBLG9EQUFpRDtBQUNqRCwrQkFBZ0M7QUFJaEMsNEVBQW9EO0FBQ3BELDhEQUFzQztBQUl0QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sWUFBWTtJQU9oQixZQUFZLGNBQWtDO1FBTnRDLGVBQVUsR0FBRyxJQUFJLENBQUM7UUE2SWxCLHVCQUFrQixHQUFHLENBQUMsS0FBWSxFQUF5QixFQUFFO1lBQ25FLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDbkMsT0FBTyxJQUFJLGlCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3FCQUMvQixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBaUIsRUFBRSxFQUFFO29CQUNqQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4QixDQUFDLENBQUM7cUJBQ0QsTUFBTSxFQUFFO3FCQUNSLElBQUksQ0FBQyxJQUFJLGdCQUFNLENBQUMsU0FBUyxDQUFDO29CQUN6QixVQUFVLEVBQUUsSUFBSTtvQkFDaEIsU0FBUyxFQUFFLENBQUMsR0FBZSxFQUFFLFFBQXdCLEVBQUUsUUFBMkIsRUFBRSxFQUFFO3dCQUNwRixJQUFJLENBQUMsR0FBRyxDQUFDLHdCQUF3QixLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUMxQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUNkLFFBQVEs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