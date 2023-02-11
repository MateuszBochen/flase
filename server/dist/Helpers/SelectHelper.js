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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0SGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0hlbHBlcnMvU2VsZWN0SGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN0RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBRXJFLHFEQUErQztBQU0vQyxNQUFNLFlBQVk7SUFVZCxZQUFZLFlBQW1CLEVBQUUsS0FBWSxFQUFFLFNBQTJCLEVBQUUsZUFBdUMsRUFBRSxRQUFlO1FBSHBJLGdCQUFXLEdBQVksRUFBRSxDQUFDO1FBQzFCLFlBQU8sR0FBcUIsRUFBRSxDQUFDO1FBYy9CLG1CQUFjLEdBQUcsQ0FBQyxZQUFtQixFQUFFLEVBQUU7WUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsU0FBUztpQkFDVCxZQUFZLENBQ1QsT0FBTyxZQUFZLEVBQUUsRUFDckIsSUFBSSxDQUFDLDBCQUEwQixFQUMvQixDQUFDLEtBQVMsRUFBRSxFQUFFLEdBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFBLENBQUMsQ0FDdEMsQ0FBQztRQUNWLENBQUMsQ0FBQTtRQUVELCtCQUEwQixHQUFHLEdBQUcsRUFBRTtZQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO1lBRXZELElBQUksQ0FBQyxTQUFTO2lCQUNULFlBQVksQ0FDVCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsRUFDM0IsQ0FBQyxJQUFRLEVBQUUs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