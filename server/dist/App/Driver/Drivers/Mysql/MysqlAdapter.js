"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const MysqlSession_1 = __importDefault(require("./MysqlSession"));
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');
class MysqlAdapter {
    constructor(connectionData, dsnOptions) {
        this.consoleLog = true;
        this.pool = null;
        this.keepaliveIntervalId = null;
        this.streamQueryResults = (query) => {
            this.log(`Query Stream: ${query}`);
            return new rxjs_1.Observable(observer => {
                this.getPool().query(query)
                    .on('error', (error) => observer.error(error))
                    .on('result', (row) => observer.next(row))
                    // 'end' is emitted also after error - complete is then ignored by rxjs
                    .on('end', () => observer.complete());
            });
        };
        this.preparePrimaryColumns = (columnsOfTable, records) => {
            return columnsOfTable.filter((tableColumn) => records.some((record) => {
                return record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY';
            }));
        };
        this.keepalive = () => {
            try {
                this.getPool().query('SELECT 1 + 1 AS solution', (err) => {
                    if (err) {
                        console.log(err.code); // 'ER_BAD_DB_ERROR'
                    }
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
        const pool = mysql.createPool({
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
            pool.getConnection((err, connection) => {
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
    disconnect() {
        if (this.keepaliveIntervalId) {
            clearInterval(this.keepaliveIntervalId);
            this.keepaliveIntervalId = null;
        }
        if (this.pool) {
            this.pool.end((err) => err && this.log(err));
            this.pool = null;
        }
    }
    openSession(database) {
        return new Promise((resolve, reject) => {
            this.getPool().getConnection((err, connection) => {
                if (err) {
                    reject(err);
                    return;
                }
                connection.query('USE ??', [database], (useErr) => {
                    if (useErr) {
                        connection.release();
                        reject(useErr);
                        return;
                    }
                    resolve(new MysqlSession_1.default(connection, this.parser));
                });
            });
        });
    }
    getListOfDatabases() {
        const query = 'SHOW DATABASES';
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(query).subscribe({
                next: (record) => observer.next({ name: `${record.Database}` }),
                error: (error) => observer.error(error),
                complete: () => observer.complete(),
            });
        });
    }
    getListOfTablesInDatabase(databaseName) {
        const showTablesQuery = mysql.format('SHOW TABLES FROM ??', [databaseName]);
        this.log('Show tables');
        return new rxjs_1.Observable(observer => {
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
                        this.getPool().query(showKeysFromTableQuery, (err, keysRecords) => {
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
    getSelectFromTypeFromQuery(query) {
        const ast = this.parser.astify(query);
        const statement = Array.isArray(ast) ? ast[0] : ast;
        return (statement === null || statement === void 0 ? void 0 : statement.from) || [];
    }
    getColumnsOfTable(databaseName, selectFromType) {
        const showColumnsQuery = mysql.format('SHOW COLUMNS FROM ??.??', [databaseName, selectFromType.table]);
        return new Promise((resolve, reject) => {
            this.getPool().query(showColumnsQuery, (err, columns) => {
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
                }).catch(reject);
            });
        });
    }
    getPool() {
        if (!this.pool) {
            throw new Error('Not connected');
        }
        return this.pool;
    }
    getReferencesColumns(databaseName, tableName) {
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
            this.getPool().query(sql, [databaseName, tableName], (err, results) => {
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
        return references.find((reference) => reference.originColumnName === columnName);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrQkFBZ0M7QUFXaEMsa0VBQTBDO0FBQzFDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMvQixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUMsTUFBTSxZQUFZO0lBUWhCLFlBQVksY0FBMEMsRUFBRSxVQUFxQjtRQVByRSxlQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLFNBQUksR0FBZ0IsSUFBSSxDQUFDO1FBQ3pCLHdCQUFtQixHQUEwQixJQUFJLENBQUM7UUFnTWxELHVCQUFrQixHQUFHLENBQUMsS0FBWSxFQUF5QixFQUFFO1lBQ25FLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFbkMsT0FBTyxJQUFJLGlCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3FCQUN4QixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBaUIsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztxQkFDekQsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQWUsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDdEQsdUVBQXVFO3FCQUN0RSxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFBO1FBeUNP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