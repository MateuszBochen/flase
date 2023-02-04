import {IWebSocketInMessage} from './Server/WebSocketInMessage';

const WebSocketClient = require('./WebSocketClient');
const {ACTIONS} = require("./Server/ActionEnum");
const SqlClient = require("./SqlClient");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');

const SelectHelper = require('./Helpers/SelectHelper');
import ShowHelper from './Helpers/ShowHelper';

class Application {
    sqlClient: typeof SqlClient;
    webSocketClient: typeof WebSocketClient;


    constructor(sqlConnection:any, webSocketConnection:WebSocket) {
        this.sqlClient = new SqlClient(sqlConnection);
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }


    dispatchAction = (message:IWebSocketInMessage) => {
        console.log('dispatchAction: ', message.action);
        try {
            switch (message.action) {
                case ACTIONS.DATABASE_LIST:
                    this.getDataBasesList();
                    break
                case ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE:
                    type ss = [string];
                    this.getTablesFromDataBase(message.params[0]);
                    break;
                case ACTIONS.SELECT_QUERY:
                     this.selectQuery(message.params[0], message.params[1], message.params[2]);
                    break;
                default:
                    console.log('Not implement action: ', message.action);
            }
        } catch (e) {
            console.log(e);
        }
    }

    getDataBasesList = () => {
        const query = 'SHOW DATABASES';

        this.sqlClient
            .streamQueryResults(
                query,
                (row:any) => {
                    const message = new WebSocketOutMessage(
                        ACTIONS.SOCKET_DATABASE_LIST_APPEND_DATA,
                        200,
                        null,
                        row
                    );

                    this.webSocketClient
                        .sendMessage(message);
                },
                (error:any) => {
                    console.log(error);
                }
            );

    }

    getTablesFromDataBase = (dataBaseName: string) => {
        console.log('getTablesFromDataBase', dataBaseName)
        this.sqlClient
            .queryResults(
                `USE ${dataBaseName}; SHOW TABLES;`,
                (row:any) => {
                    this.sendTablesNames(row[1], dataBaseName);
                }
            );
    }

    sendTablesNames = (tableNames: any[], databaseName:string) => {
        tableNames.forEach((tableName) => {
            Object.entries(tableName).forEach((item) => {
                const message = new WebSocketOutMessage(
                  ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE,
                  200,
                  null,
                  {
                    tableName: tableName[item[0]],
                    dataBaseName: databaseName,
                  }
                );
                this.webSocketClient
                  .sendMessage(message);

            });
        });
    }


    selectQuery = (databaseName:string, query:string, tabIndex:string) => {
        if (!query) {
            return;
        }

        if (query.toLowerCase().startsWith('select')) {
            console.log('SelectHelper');
            new SelectHelper(databaseName, query, this.sqlClient, this.webSocketClient, tabIndex);
        } else if (query.toLowerCase().startsWith('show')) {
            console.log('ShowHelper');
            new ShowHelper(query, this.sqlClient, this.webSocketClient, tabIndex);
        } else {
            console.log('ElseHelper not set');
        }
    }

}

module.exports = Application;