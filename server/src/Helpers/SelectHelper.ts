import { ACTIONS } from '../Server/ActionEnum';
import ColumnType from "../Type/ColumnType";

const { Parser } = require('node-sql-parser');

const SqlClient = require('../SqlClient');
const WebSocketClient = require('../SqlClient');
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');


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
            console.log('columns ok 1');
            ast.from.forEach((item:any) => {
                console.log('columns ok 2');
                this.getColumnsFromTable(item.table);
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
        console.log('columns ok 3');
        const sql = `SHOW COLUMNS FROM \`${tableName}\`;`;
        console.log(sql);
        this.sqlClient
            .queryResults(
                sql,
                (results:any) => {this.getReferencesColumns(results, tableName)},
                (error:any) => {console.log(error)}
            );
    }

    getReferencesColumns = (columns:any, tableName:string) => {
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
            .queryResults(
                sql,
                (results:any) => {this.sendFullColumns(columns, results)},
                (error:any) => {console.log(error)}
            );
    }

    sendFullColumns = (columns:any, references:any) => {
        console.log('columns ok 5');
        const newColumns: Array<ColumnType> = [];

        columns.forEach((column:any) => {
            const reference = this.findReference(column.Field, references);
            const columnType:ColumnType = {
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
        // this.columns = newColumns;
        this.matchColumns(newColumns);
    }

    matchColumns = (columnObjects:Array<ColumnType>) => {
        console.log('columns ok 6');
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
    }
}

module.exports = SelectHelper;
