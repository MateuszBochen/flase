"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Parser } = require('node-sql-parser');
const SqlClient = require('../SqlClient');
const WebSocketClient = require('../WebSocketClient');
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const ActionEnum_1 = require("../Server/ActionEnum");
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
                ast.from.forEach((item) => {
                    console.log('getColumnsFromSelectRecord', item);
                    this.getColumnsFromTable(item.table);
                    this.getTableIndex(item);
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
            const sql = `SHOW COLUMNS FROM \`${tableName}\`;`;
            this.sqlClient
                .queryResults(sql, (results) => { this.getReferencesColumns(results, tableName); }, (error) => { console.log(error); });
        };
        this.getReferencesColumns = (columns, tableName) => {
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
            const newColumns = [];
            columns.forEach((column) => {
                const reference = this.findReference(column.Field, references);
                const columnType = {
                    table: { databaseName: '', name: '', alias: '' },
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
            this.matchColumns(newColumns);
        };
        this.matchColumns = (columnObjects) => {
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
                        table: { databaseName: '', name: '', alias: '' },
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
        this.getTableIndex = (item) => {
            const tableName = item.table;
            const sql = `SHOW INDEX FROM \`${this.databaseName}\`.\`${tableName}\`;`;
            console.log(sql);
            this.sqlClient
                .queryResults(sql, (results) => { this.prepareTableIndexes(results, item); }, (error) => { console.log(error); });
        };
        this.prepareTableIndexes = (results, item) => {
            if (!results.length) {
                return;
            }
            console.log(results);
            const tableKeyCollection = [];
            for (let i = 0; i < results.length; i++) {
                const tableIndex = results[i];
                let find = false;
                for (let j = 0; j < tableKeyCollection.length; j++) {
                    if (tableKeyCollection[j].keyName === tableIndex.Key_name) {
                        find = true;
                        tableKeyCollection[j].isUnique = tableIndex.Non_unique === 0;
                        tableKeyCollection[j].columns.push(tableIndex.Column_name);
                        break;
                    }
                }
                if (!find) {
                    const newTableIndexType = {
                        keyName: tableIndex.Key_name,
                        isUnique: tableIndex.Non_unique === 0,
                        columns: [tableIndex.Column_name]
                    };
                    tableKeyCollection.push(newTableIndexType);
                }
            }
            const tableKeys = {
                keys: tableKeyCollection,
                tableName: item.table,
                aliasName: item.as,
            };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0SGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0hlbHBlcnMvU2VsZWN0SGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN0RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBRXJFLHFEQUErQztBQU0vQyxNQUFNLFlBQVk7SUFVZCxZQUFZLFlBQW1CLEVBQUUsS0FBWSxFQUFFLFNBQTJCLEVBQUUsZUFBdUMsRUFBRSxRQUFlO1FBSHBJLGdCQUFXLEdBQVksRUFBRSxDQUFDO1FBQzFCLFlBQU8sR0FBcUIsRUFBRSxDQUFDO1FBYy9CLG1CQUFjLEdBQUcsQ0FBQyxZQUFtQixFQUFFLEVBQUU7WUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsU0FBUztpQkFDVCxZQUFZLENBQ1QsT0FBTyxZQUFZLEVBQUUsRUFDckIsSUFBSSxDQUFDLDBCQUEwQixFQUMvQixDQUFDLEtBQVMsRUFBRSxFQUFFLEdBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUMsQ0FDdEMsQ0FBQztRQUNWLENBQUMsQ0FBQTtRQUVELCtCQUEwQixHQUFHLEdBQUcsRUFBRTtZQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO1lBRXZELElBQUksQ0FBQyxTQUFTO2lCQUNULFlBQVksQ0FDVCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsRUFDM0IsQ0FBQyxJQUFRLEVBQUUsRUFBRTtnQkFDVCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNsQixJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO29CQUNqQixJQUFJLENBQUMsZUFBZTt5QkFDZixXQUFXLENBQUMsSUFBSSxtQkFBbUIsQ0FDaEMsb0JBQU8sQ0FBQyxrQ0FBa0MsRUFDMUMsR0FBRyxFQUNILElBQUksRUFDSjt3QkFDSSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7d0JBQ3ZCLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztxQkFDM0IsQ0FDSixDQUFDLENBQUM7b0JBRVAsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFBO2lCQUNwQjtZQUNMLENBQUMsRUFDRCxDQUFDLEtBQVMsRUFBRSxFQUFFLEdBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUMsQ0FDdEMsQ0FBQztRQUVWLENBQUMsQ0FBQTtRQUVELGVBQVUsR0FBRyxHQUFHLEVBQUU7WUFDZCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLFNBQVM7aUJBQ1Qsa0JBQWtCLENBQ2YsSUFBSSxDQUFDLEtBQUssRUFDVixJQUFJLENBQUMsU0FBUyxFQUNkLENBQUMsR0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUNoQyxDQUFDO1FBQ1YsQ0FBQyxDQUFBO1FBSUQsY0FBUyxHQUFHLENBQUMsR0FBTyxFQUFFLEVBQUU7WUFDcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUU7Z0JBQzFCLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3hDO1lBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQixDQUFDLENBQUE7UUFFRCwrQkFBMEIsR0FBRyxDQUFDLEdBQU8sRUFBRSxFQUFFO1lBQ3JDLElBQUksR0FBRyxDQUFDO1lBQ1IsSUFBSTtnQkFDQSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3hDO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZixPQUFPLEtBQUssQ0FBQzthQUNoQjtZQUVEOzs7Ozs7Ozs7Ozs7Ozs7OztpQkFpQks7WUFHTCxJQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFcEMsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDakIsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFtQixFQUFFLEVBQUU7b0JBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ2hELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3JDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdCLENBQUMsQ0FBQyxDQUFDO2FBQ047UUFDTCxDQUFDLENBQUE7UUFFRCxnQkFBVyxHQUFHLENBQUMsR0FBTyxFQUFFLEVBQUU7WUFDdEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDbkMsb0JBQU8sQ0FBQyx1Q0FBdUMsRUFDL0MsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDSSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLEdBQUcsRUFBRSxHQUFHO2FBQ1gsQ0FDSixDQUFDO1lBRUYsSUFBSSxDQUFDLGVBQWU7aUJBQ2YsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQTtRQUVELGdCQUFXLEdBQUcsR0FBRyxFQUFFO1lBQ2YsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDbkMsb0JBQU8sQ0FBQywrQkFBK0IsRUFDdkMsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDSSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTzthQUN4QixDQUNKLENBQUM7WUFFRixJQUFJLENBQUMsZUFBZTtpQkFDZixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFOUIsQ0FBQyxDQUFDO1FBRUYseUJBQW9CLEdBQUcsR0FBRyxFQUFFO1lBQ3hCLElBQUksR0FBRyxDQUFDO1lBQ1IsSUFBSTtnQkFDQSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3hDO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZixPQUFPLEtBQUssQ0FBQzthQUNoQjtZQUVELEdBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLEdBQUcsQ0FBQyxPQUFPLEdBQUc7Z0JBQ1Y7b0JBQ0ksSUFBSSxFQUFFO3dCQUNGLElBQUksRUFBRSxXQUFXO3dCQUNqQixJQUFJLEVBQUUsT0FBTzt3QkFDYixJQUFJLEVBQUU7NEJBQ0YsSUFBSSxFQUFFO2dDQUNGLElBQUksRUFBRSxNQUFNO2dDQUNaLEtBQUssRUFBRSxHQUFHOzZCQUNiO3lCQUNBO3dCQUNMLElBQUksRUFBRSxJQUFJO3FCQUNiO29CQUNELEVBQUUsRUFBRSxPQUFPO2lCQUNkO2FBQ0osQ0FBQztZQUNGLElBQUk7Z0JBQ0EsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUNsQztZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsT0FBTyxLQUFLLENBQUM7YUFDaEI7UUFDTCxDQUFDLENBQUE7UUFFRCx3QkFBbUIsR0FBRyxDQUFDLFNBQWdCLEVBQUUsRUFBRTtZQUN2QyxNQUFNLEdBQUcsR0FBRyx1QkFBdUIsU0FBUyxLQUFLLENBQUM7WUFFbEQsSUFBSSxDQUFDLFNBQVM7aUJBQ1QsWUFBWSxDQUNULEdBQUcsRUFDSCxDQUFDLE9BQVcsRUFBRSxFQUFFLEdBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQSxDQUFBLENBQUMsRUFDaEUsQ0FBQyxLQUFTLEVBQUUsRUFBRSxHQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQSxDQUFDLENBQ3RDLENBQUM7UUFDVixDQUFDLENBQUE7UUFFRCx5QkFBb0IsR0FBRyxDQUFDLE9BQVcsRUFBRSxTQUFnQixFQUFFLEVBQUU7WUFDckQsTUFBTSxHQUFHLEdBQUc7Ozs7OztrQ0FNYyxJQUFJLENBQUMsWUFBWTtnQ0FDbkIsU0FBUzs7U0FFaEMsQ0FBQztZQUVGLElBQUksQ0FBQyxTQUFTO2lCQUNULFlBQVksQ0FDVCxHQUFHLEVBQ0gsQ0FBQyxPQUFXLEVBQUUsRUFBRSxHQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFBLENBQUEsQ0FBQyxFQUN6RCxDQUFDLEtBQVMsRUFBRSxFQUFFLEdBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUMsQ0FDdEMsQ0FBQztRQUNWLENBQUMsQ0FBQTtRQUVELG9CQUFlLEdBQUcsQ0FBQyxPQUFXLEVBQUUsVUFBYyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxVQUFVLEdBQXNCLEVBQUUsQ0FBQztZQUV6QyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBVSxFQUFFLEVBQUU7Z0JBQzNCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxVQUFVLEdBQWM7b0JBQzFCLEtBQUssRUFBRSxFQUFDLFlBQVksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFDO29CQUM5QyxhQUFhLEVBQUUsTUFBTSxDQUFDLEtBQUssS0FBSyxnQkFBZ0I7b0JBQ2hELFlBQVksRUFBRSxNQUFNLENBQUMsT0FBTztvQkFDNUIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxLQUFLO29CQUNsQixRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksS0FBSyxLQUFLO29CQUMvQixVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLO29CQUNoQyxlQUFlLEVBQUUsU0FBUyxDQUFDLE1BQU07b0JBQ2pDLGNBQWMsRUFBRSxTQUFTLENBQUMsS0FBSztpQkFDbEMsQ0FBQTtnQkFDRCxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxDQUFDO1lBRUgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUV4QixJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQTtRQUVELGlCQUFZLEdBQUcsQ0FBQyxhQUErQixFQUFFLEVBQUU7WUFFL0MsTUFBTSxVQUFVLEdBQXNCLEVBQUUsQ0FBQztZQUV6QyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFO2dCQUNwQyxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ3BCLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtvQkFDbkMsSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRTt3QkFDbEMsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQzt3QkFDOUIsT0FBTyxHQUFHLElBQUksQ0FBQztxQkFDbEI7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRTtvQkFDVixNQUFNLFlBQVksR0FBYzt3QkFDNUIsS0FBSyxFQUFFLEVBQUMsWUFBWSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUM7d0JBQzlDLGFBQWEsRUFBRSxLQUFLO3dCQUNwQixZQUFZLEVBQUUsSUFBSTt3QkFDbEIsSUFBSSxFQUFFLFVBQVU7d0JBQ2hCLFFBQVEsRUFBRSxLQUFLO3dCQUNmLFVBQVUsRUFBRSxLQUFLO3dCQUNqQixlQUFlLEVBQUUsRUFBRTt3QkFDbkIsY0FBYyxFQUFFLEVBQUU7cUJBQ3JCLENBQUE7b0JBQ0QsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztpQkFDakM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFeEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxVQUFVLENBQUM7WUFDMUIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3ZCLENBQUMsQ0FBQTtRQUVELGtCQUFhLEdBQUcsQ0FBQyxVQUFpQixFQUFFLFVBQWMsRUFBRSxFQUFFO1lBQ2xELE1BQU0sU0FBUyxHQUFHO2dCQUNkLEtBQUssRUFBRSxFQUFFO2dCQUNULE1BQU0sRUFBRSxFQUFFO2FBQ2IsQ0FBQztZQUVGLElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRTtnQkFDbkIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ3hDLElBQUksVUFBVSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUU7d0JBQzFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDO3dCQUN0RCxTQUFTLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQzt3QkFFeEQsT0FBTyxTQUFTLENBQUM7cUJBQ3BCO2lCQUNKO2FBQ0o7WUFFRCxPQUFPLFNBQVMsQ0FBQztRQUNyQixDQUFDLENBQUE7UUFFRCxrQkFBYSxHQUFHLENBQUMsSUFBbUIsRUFBRSxFQUFFO1lBQ3BDLE1BQU0sU0FBUyxHQUFVLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDcEMsTUFBTSxHQUFHLEdBQVUscUJBQXFCLElBQUksQ0FBQyxZQUFZLFFBQVEsU0FBUyxLQUFLLENBQUM7WUFDaEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVqQixJQUFJLENBQUMsU0FBUztpQkFDVCxZQUFZLENBQ1QsR0FBRyxFQUNILENBQUMsT0FBVyxFQUFFLEVBQUUsR0FBRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFBLENBQUEsQ0FBQyxFQUMxRCxDQUFDLEtBQVMsRUFBRSxFQUFFLEdBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUMsQ0FDdEMsQ0FBQztRQUNWLENBQUMsQ0FBQTtRQUVELHdCQUFtQixHQUFHLENBQUMsT0FBNkIsRUFBRSxJQUFtQixFQUFFLEVBQUU7WUFDekUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ2pCLE9BQU87YUFDVjtZQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFckIsTUFBTSxrQkFBa0IsR0FBdUIsRUFBRSxDQUFDO1lBRWxELEtBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUNwQyxNQUFNLFVBQVUsR0FBa0IsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLElBQUksR0FBRyxLQUFLLENBQUM7Z0JBRWpCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ2hELElBQUksa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLFVBQVUsQ0FBQyxRQUFRLEVBQUU7d0JBQ3ZELElBQUksR0FBRyxJQUFJLENBQUM7d0JBQ1osa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUFDO3dCQUM3RCxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQzt3QkFDM0QsTUFBTTtxQkFDVDtpQkFDSjtnQkFFRCxJQUFJLENBQUMsSUFBSSxFQUFFO29CQUNQLE1BQU0saUJBQWlCLEdBQWdCO3dCQUNuQyxPQUFPLEVBQUUsVUFBVSxDQUFDLFFBQVE7d0JBQzVCLFFBQVEsRUFBRSxVQUFVLENBQUMsVUFBVSxLQUFLLENBQUM7d0JBQ3JDLE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUM7cUJBQ3BDLENBQUM7b0JBRUYsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7aUJBQzlDO2FBRUo7WUFDRCxNQUFNLFNBQVMsR0FBaUI7Z0JBQzVCLElBQUksRUFBRSxrQkFBa0I7Z0JBQ3hCLFNBQVMsRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDckIsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFO2FBQ3JCLENBQUE7UUFDTCxDQUFDLENBQUE7UUEvVUcsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDakMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBRzNCLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDdEMsQ0FBQztDQXVVSjtBQUVELE1BQU0sQ0FBQyxPQUFPLEdBQUcsWUFBWSxDQUFDIn0=