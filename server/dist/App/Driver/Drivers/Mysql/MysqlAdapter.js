"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = __importDefault(require("stream"));
const rxjs_1 = require("rxjs");
const TotalCountDto_1 = __importDefault(require("../../../../Driver/Dto/TotalCountDto"));
const RowDto_1 = __importDefault(require("../../../../Driver/Dto/RowDto"));
const dsn_parser_1 = require("@soluble/dsn-parser");
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');
class MysqlAdapter {
    constructor(connectionData, dsnOptions) {
        this.consoleLog = true;
        /** prevent for query spam */
        this.lastQuery = '';
        this.lastQueryTimeStamp = 0;
        this.streamQueryResults = (query) => {
            this.log(`Query Stream: ${query}`);
            const now = Date.now();
            if (this.lastQuery === query && (now - this.lastQueryTimeStamp < 500)) {
                this.log(`Query Skipped: ${query}`);
                return new rxjs_1.Observable();
            }
            this.lastQuery = query;
            this.lastQueryTimeStamp = now;
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
        this.dsnOptions = dsnOptions;
    }
    connect() {
        const parsedDsn = dsn_parser_1.parseDsnOrThrow(this.connectionData.connectionData.dsn);
        this.nativeConnection = mysql.createConnection({
            host: parsedDsn.host,
            user: this.connectionData.userData.username,
            password: this.connectionData.userData.password,
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
    updateQuery(query) {
        return new Promise((resolve, reject) => {
            this.nativeConnection.query(query, (err, result) => {
                if (err) {
                    reject(`${err.sqlMessage}: ${query}`);
                    return;
                }
                resolve({
                    affectedRows: +result.affectedRows,
                    message: `${result.message}): ${query}`,
                });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxvREFBaUQ7QUFDakQsK0JBQWdDO0FBR2hDLHlGQUFpRTtBQUNqRSwyRUFBbUQ7QUFRbkQsb0RBQStEO0FBQy9ELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMvQixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUMsTUFBTSxZQUFZO0lBV2hCLFlBQVksY0FBMEMsRUFBRSxVQUFxQjtRQVZyRSxlQUFVLEdBQUcsSUFBSSxDQUFDO1FBTTFCLDZCQUE2QjtRQUNyQixjQUFTLEdBQVcsRUFBRSxDQUFDO1FBQ3ZCLHVCQUFrQixHQUFXLENBQUMsQ0FBQztRQStLL0IsdUJBQWtCLEdBQUcsQ0FBQyxLQUFZLEVBQXlCLEVBQUU7WUFDbkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNuQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFFdkIsSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLEtBQUssSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsR0FBRyxDQUFDLEVBQUU7Z0JBQ3JFLElBQUksQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ3BDLE9BQU8sSUFBSSxpQkFBVSxFQUFFLENBQUM7YUFDekI7WUFFRCxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUN2QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsR0FBRyxDQUFDO1lBRTlCLE9BQU8sSUFBSSxpQkFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFF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