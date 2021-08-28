"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ActionEnum_1 = require("../Server/ActionEnum");
const { Parser } = require('node-sql-parser');
const SqlClient = require('../SqlClient');
const WebSocketClient = require('../SqlClient');
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
class SelectHelper {
    constructor(databaseName, query, sqlClient, webSocketClient, tabIndex) {
        this.tempColumns = [];
        this.columns = [];
        this.changeDatabase = (databaseName) => {
            console.log("use database");
            this.sqlClient
                .queryResults(`USE ${databaseName}`, this.countRecordsOfCurrentQuery, (error) => { console.log(error); });
        };
        this.countRecordsOfCurrentQuery = () => {
            console.log('counting: ', this.getAllCountRowsQuery());
            this.sqlClient
                .queryResults(this.getAllCountRowsQuery(), (rows) => {
                console.log(rows);
                if (rows.length > 0) {
                    this.webSocketClient
                        .sendMessage(new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_TOTAL_ROWS, 200, null, {
                        tabIndex: this.tabIndex,
                        totalRows: rows[0].total,
                    }));
                    this.selectData();
                }
            }, (error) => { console.log(error); });
        };
        this.selectData = () => {
            console.log("selecting data");
            this.sqlClient
                .streamQueryResults(this.query, this.fetchData, (row) => console.log(row));
        };
        this.fetchData = (row) => {
            console.log("fetching data");
            if (!this.tempColumns.length) {
                console.log("fetching columns");
                this.getColumnsFromSelectRecord(row);
            }
            this.sendDataRow(row);
        };
        this.getColumnsFromSelectRecord = (row) => {
            let ast;
            try {
                ast = this.parser.astify(this.query);
            }
            catch (e) {
                console.log(e);
                return false;
            }
            /**
             * [
                { db: null, table: 'user_attachment', as: 'ua' },
                {
                    db: null,
                    table: 'attachment_type',
                    as: 'at',
                    join: 'INNER JOIN',
                    on: {
                        type: 'binary_expr',
                        operator: '=',
                        left: [Object],
                        right: [Object]
                    }
                }
             ]
             *
             * */
            this.tempColumns = Object.keys(row);
            if (ast.from.length) {
                console.log('columns ok 1');
                ast.from.forEach((item) => {
                    console.log('columns ok 2');
                    this.getColumnsFromTable(item.table);
                });
            }
        };
        this.sendDataRow = (row) => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW, 200, null, {
                tabIndex: this.tabIndex,
                row: row,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.sendColumns = () => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS, 200, null, {
                tabIndex: this.tabIndex,
                columns: this.columns,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.getAllCountRowsQuery = () => {
            let ast;
            try {
                ast = this.parser.astify(this.query);
            }
            catch (e) {
                console.log(e);
                return false;
            }
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
            try {
                return this.parser.sqlify(ast);
            }
            catch (e) {
                console.log(e);
                return false;
            }
        };
        this.getColumnsFromTable = (tableName) => {
            console.log('columns ok 3');
            const sql = `SHOW COLUMNS FROM \`${tableName}\`;`;
            console.log(sql);
            this.sqlClient
                .queryResults(sql, (results) => { this.getReferencesColumns(results, tableName); }, (error) => { console.log(error); });
        };
        this.getReferencesColumns = (columns, tableName) => {
            console.log('columns ok 4');
            const sql = `SELECT
            \`COLUMN_NAME\`,
            \`REFERENCED_TABLE_NAME\`,
            \`REFERENCED_COLUMN_NAME\`
        FROM \`INFORMATION_SCHEMA\`.\`KEY_COLUMN_USAGE\`
        WHERE
            \`TABLE_SCHEMA\` = '${this.databaseName}'
        AND \`TABLE_NAME\` = '${tableName}'
        AND \`REFERENCED_TABLE_NAME\` IS NOT NULL
        `;
            this.sqlClient
                .queryResults(sql, (results) => { this.sendFullColumns(columns, results); }, (error) => { console.log(error); });
        };
        this.sendFullColumns = (columns, references) => {
            console.log('columns ok 5');
            const newColumns = [];
            columns.forEach((column) => {
                const reference = this.findReference(column.Field, references);
                const columnType = {
                    autoIncrement: column.Extra === 'auto_increment',
                    defaultValue: column.Default,
                    name: column.Field,
                    nullable: column.Null === 'YES',
                    primaryKey: column.Key === 'PRI',
                    referenceColumn: reference.column,
                    referenceTable: reference.table,
                };
                newColumns.push(columnType);
            });
            console.log(newColumns);
            // this.columns = newColumns;
            this.matchColumns(newColumns);
        };
        this.matchColumns = (columnObjects) => {
            console.log('columns ok 6');
            const newColumns = [];
            this.tempColumns.forEach((columnName) => {
                let isFound = false;
                columnObjects.forEach((columnObject) => {
                    if (columnObject.name === columnName) {
                        newColumns.push(columnObject);
                        isFound = true;
                    }
                });
                if (!isFound) {
                    const simpleColumn = {
                        autoIncrement: false,
                        defaultValue: null,
                        name: columnName,
                        nullable: false,
                        primaryKey: false,
                        referenceColumn: '',
                        referenceTable: '',
                    };
                    newColumns.push(simpleColumn);
                }
            });
            console.log(newColumns);
            this.columns = newColumns;
            this.sendColumns();
        };
        this.findReference = (columnName, references) => {
            console.log('columns ok 5 reference');
            console.log(references);
            const reference = {
                table: '',
                column: '',
            };
            if (references.length) {
                for (let i = 0; i < references.length; i++) {
                    if (columnName === references[i].COLUMN_NAME) {
                        reference.table = references[i].REFERENCED_TABLE_NAME;
                        reference.column = references[i].REFERENCED_COLUMN_NAME;
                        return reference;
                    }
                }
            }
            return reference;
        };
        this.sqlClient = sqlClient;
        this.webSocketClient = webSocketClient;
        this.databaseName = databaseName;
        this.query = query;
        this.tabIndex = tabIndex;
        this.parser = new Parser();
        this.changeDatabase(databaseName);
    }
}
module.exports = SelectHelper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0SGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0hlbHBlcnMvU2VsZWN0SGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQStDO0FBRy9DLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU5QyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDMUMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ2hELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLCtCQUErQixDQUFDLENBQUM7QUFHckUsTUFBTSxZQUFZO0lBVWQsWUFBWSxZQUFtQixFQUFFLEtBQVksRUFBRSxTQUEyQixFQUFFLGVBQXVDLEVBQUUsUUFBZTtRQUhwSSxnQkFBVyxHQUFZLEVBQUUsQ0FBQztRQUMxQixZQUFPLEdBQXFCLEVBQUUsQ0FBQztRQWEvQixtQkFBYyxHQUFHLENBQUMsWUFBbUIsRUFBRSxFQUFFO1lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDNUIsSUFBSSxDQUFDLFNBQVM7aUJBQ1QsWUFBWSxDQUNULE9BQU8sWUFBWSxFQUFFLEVBQ3JCLElBQUksQ0FBQywwQkFBMEIsRUFDL0IsQ0FBQyxLQUFTLEVBQUUsRUFBRSxHQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFDLENBQ3RDLENBQUM7UUFDVixDQUFDLENBQUE7UUFFRCwrQkFBMEIsR0FBRyxHQUFHLEVBQUU7WUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQztZQUV2RCxJQUFJLENBQUMsU0FBUztpQkFDVCxZQUFZLENBQ1QsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEVBQzNCLENBQUMsSUFBUSxFQUFFLEVB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