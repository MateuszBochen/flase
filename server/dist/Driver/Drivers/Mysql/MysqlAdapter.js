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
        this.preparePrimaryColumns = (columnsOfTable, records, databaseName) => {
            const columns = [];
            for (const tableColumn of columnsOfTable) {
                for (const record of records) {
                    if (record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY') {
                        columns.push(tableColumn);
                    }
                }
            }
            return columns;
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
        const useDatabaseQuery = `SHOW TABLES FROM \`${databaseName}\``;
        this.log('Show tables');
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(useDatabaseQuery).subscribe((record) => {
                Object.entries(record).forEach((item) => {
                    const tableName = record[item[0]] + '';
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
                    this.nativeConnection.query(showKeysFromTableQuery, (err, keysRecords) => {
                        if (err) {
                            observer.error(err);
                            return;
                        }
                        this.getColumnsOfTable(databaseName, { table: tableName }).then((columnsOfTable) => {
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
    getSelectFromTypeFromQuery(query) {
        try {
            const ast = this.parser.astify(query);
            return ast.from;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    getColumnsOfTable(databaseName, selectFromType) {
        const showColumnsQuery = `SHOW COLUMNS FROM \`${databaseName}\`.\`${selectFromType.table}\``;
        return new Promise((resolve, reject) => {
            this.nativeConnection.query(showColumnsQuery, (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
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
                            reference,
                        };
                        newColumns.push(columnType);
                    });
                    resolve(newColumns);
                });
            });
        });
    }
    countRecords(query) {
        return new Promise((resolve, reject) => {
            let countQuery;
            try {
                countQuery = this.getAllCountRowsQuery(query);
            }
            catch (e) {
                console.log(444444444444444);
                reject(e);
                return;
            }
            if (countQuery === '') {
                reject('Fail');
            }
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
                const converted = results.map((result) => {
                    return {
                        columnName: result.REFERENCED_COLUMN_NAME,
                        originColumnName: result.COLUMN_NAME,
                        table: {
                            databaseName,
                            name: result.REFERENCED_TABLE_NAME
                        }
                    };
                });
                resolve(converted);
            });
        });
    }
    findReference(columnName, references) {
        if (references.length) {
            for (let i = 0; i < references.length; i++) {
                if (columnName === references[i].originColumnName) {
                    return references[i];
                }
            }
        }
        return undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0RyaXZlci9Ecml2ZXJzL015c3FsL015c3FsQWRhcHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUdBLG9EQUFpRDtBQUNqRCwrQkFBZ0M7QUFJaEMsNEVBQW9EO0FBQ3BELDhEQUFzQztBQU10QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sWUFBWTtJQU1oQixZQUFZLGNBQWtDO1FBTHRDLGVBQVUsR0FBRyxJQUFJLENBQUM7UUE4S2xCLHVCQUFrQixHQUFHLENBQUMsS0FBWSxFQUF5QixFQUFFO1lBQ25FLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDbkMsT0FBTyxJQUFJLGlCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3FCQUMvQixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBaUIsRUFBRSxFQUFFO29CQUNqQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4QixDQUFDLENBQUM7cUJBQ0QsTUFBTSxFQUFFO3FCQUNSLElBQUksQ0FBQyxJQUFJLGdCQUFNLENBQUMsU0FBUyxDQUFDO29CQUN6QixVQUFVLEVBQUUsSUFBSTtvQkFDaEIsU0FBUyxFQUFFLENBQUMsR0FBZSxFQUFFLFFBQXdCLEVBQUUsUUFBMkIsRUFBRSxFQUFFO3dCQUNwRixRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUNuQixJQUFJOzRCQUNGLFFBQVEsRUFBRSxDQUFDO3lCQUNaO3dCQUFDLE9BQU8sQ0FBQyxFQUFFOzRCQUNW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