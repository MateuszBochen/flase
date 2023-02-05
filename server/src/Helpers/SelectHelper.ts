const { Parser } = require('node-sql-parser');
import TableIndexType from '../Type/TableIndexType';
const SqlClient = require('../SqlClient');
const WebSocketClient = require('../WebSocketClient');
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
import SelectFromType from '../Driver/Type/Data/SelectFromType';
import { ACTIONS } from '../Server/ActionEnum';
import ColumnType from '../Driver/Type/Data/ColumnType';
import TableKeyType from '../Type/TableKeyType';
import TableKeysType from '../Type/TableKeysType';


class SelectHelper {
    parser;
    databaseName;
    query;
    sqlClient;
    webSocketClient;
    tabIndex;
    tempColumns:string[] = [];
    columns:Array<ColumnType> = [];

    constructor(databaseName:string, query:string, sqlClient: typeof SqlClient, webSocketClient: typeof WebSocketClient, tabIndex:string) {
        this.sqlClient = sqlClient;
        this.webSocketClient = webSocketClient;
        this.databaseName = databaseName;
        this.query = query;
        this.tabIndex = tabIndex;
        this.parser = new Parser();


        this.changeDatabase(databaseName);
    }

    changeDatabase = (databaseName:string) => {
        console.log("use database");
        this.sqlClient
            .queryResults(
                `USE ${databaseName}`,
                this.countRecordsOfCurrentQuery,
                (error:any) => {console.log(error)}
            );
    }

    countRecordsOfCurrentQuery = () => {
        console.log('counting: ', this.getAllCountRowsQuery());

        this.sqlClient
            .queryResults(
                this.getAllCountRowsQuery(),
                (rows:any) => {
                    console.log(rows);
                    if (rows.length > 0) {
                        this.webSocketClient
                            .sendMessage(new WebSocketOutMessage(
                                ACTIONS.SOCKET_SET_SELECT_QUERY_TOTAL_ROWS,
                                200,
                                null,
                                {
                                    tabIndex: this.tabIndex,
                                    totalRows: rows[0].total,
                                }
                            ));

                        this.selectData()
                    }
                },
                (error:any) => {console.log(error)}
            );

    }

    selectData = () => {
        console.log("selecting data");
        this.sqlClient
            .streamQueryResults(
                this.query,
                this.fetchData,
                (row:any) => console.log(row),
            );
    }



    fetchData = (row:any) => {
        console.log("fetching data");
        if (!this.tempColumns.length) {
            console.log("fetching columns");
            this.getColumnsFromSelectRecord(row);
        }

        this.sendDataRow(row);
    }

    getColumnsFromSelectRecord = (row:any) => {
        let ast;
        try {
            ast = this.parser.astify(this.query);
        } catch (e) {
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
            ast.from.forEach((item:SelectFromType) => {
                console.log('getColumnsFromSelectRecord', item);
                this.getColumnsFromTable(item.table);
                this.getTableIndex(item);
            });
        }
    }

    sendDataRow = (row:any) => {
        const message = new WebSocketOutMessage(
            ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW,
            200,
            null,
            {
                tabIndex: this.tabIndex,
                row: row,
            }
        );

        this.webSocketClient
            .sendMessage(message);
    }

    sendColumns = () => {
        const message = new WebSocketOutMessage(
            ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS,
            200,
            null,
            {
                tabIndex: this.tabIndex,
                columns: this.columns,
            }
        );

        this.webSocketClient
            .sendMessage(message);

    };

    getAllCountRowsQuery = () => {
        let ast;
        try {
            ast = this.parser.astify(this.query);
        } catch (e) {
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
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    getColumnsFromTable = (tableName:string) => {
        const sql = `SHOW COLUMNS FROM \`${tableName}\`;`;

        this.sqlClient
            .queryResults(
                sql,
                (results:any) => {this.getReferencesColumns(results, tableName)},
                (error:any) => {console.log(error)}
            );
    }

    getReferencesColumns = (columns:any, tableName:string) => {
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
            .queryResults(
                sql,
                (results:any) => {this.sendFullColumns(columns, results)},
                (error:any) => {console.log(error)}
            );
    }

    sendFullColumns = (columns:any, references:any) => {
        const newColumns: Array<ColumnType> = [];

        columns.forEach((column:any) => {
            const reference = this.findReference(column.Field, references);
            const columnType:ColumnType = {
                table: {databaseName: '', name: '', alias: ''},
                autoIncrement: column.Extra === 'auto_increment',
                defaultValue: column.Default,
                name: column.Field,
                nullable: column.Null === 'YES',
                primaryKey: column.Key === 'PRI',
                referenceColumn: reference.column,
                referenceTable: reference.table,
            }
            newColumns.push(columnType);
        });

        console.log(newColumns);

        this.matchColumns(newColumns);
    }

    matchColumns = (columnObjects:Array<ColumnType>) => {

        const newColumns: Array<ColumnType> = [];

        this.tempColumns.forEach((columnName) => {
            let isFound = false;
            columnObjects.forEach((columnObject) => {
                if (columnObject.name === columnName) {
                    newColumns.push(columnObject);
                    isFound = true;
                }
            });

            if (!isFound) {
                const simpleColumn:ColumnType = {
                    table: {databaseName: '', name: '', alias: ''},
                    autoIncrement: false,
                    defaultValue: null,
                    name: columnName,
                    nullable: false,
                    primaryKey: false,
                    referenceColumn: '',
                    referenceTable: '',
                }
                newColumns.push(simpleColumn);
            }
        });

        console.log(newColumns);

        this.columns = newColumns;
        this.sendColumns();
    }

    findReference = (columnName:string, references:any) => {
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
    }

    getTableIndex = (item:SelectFromType) => {
        const tableName:string = item.table;
        const sql:string = `SHOW INDEX FROM \`${this.databaseName}\`.\`${tableName}\`;`;
        console.log(sql);

        this.sqlClient
            .queryResults(
                sql,
                (results:any) => {this.prepareTableIndexes(results, item)},
                (error:any) => {console.log(error)}
            );
    }

    prepareTableIndexes = (results:Array<TableIndexType>, item:SelectFromType) => {
        if (!results.length) {
            return;
        }

        console.log(results);

        const tableKeyCollection:Array<TableKeyType> = [];

        for(let i = 0; i < results.length; i++) {
            const tableIndex:TableIndexType = results[i];
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
                const newTableIndexType:TableKeyType = {
                    keyName: tableIndex.Key_name,
                    isUnique: tableIndex.Non_unique === 0,
                    columns: [tableIndex.Column_name]
                };

                tableKeyCollection.push(newTableIndexType);
            }

        }
        const tableKeys:TableKeysType = {
            keys: tableKeyCollection,
            tableName: item.table,
            aliasName: item.as,
        }
    }
}

module.exports = SelectHelper;
