import {IWebSocketInMessage} from './Server/WebSocketInMessage';
const WebSocketClient = require('./WebSocketClient');
const {ACTIONS} = require("./Server/ActionEnum");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');
import DriverInterface from './Driver/DriverInterface';
import TotalCountDto from './Driver/Dto/TotalCountDto';
import Select from './Operation/Select';
import Update from './Operation/Update';

class Application {
    dataDriver: DriverInterface;
    webSocketClient: typeof WebSocketClient;


    constructor(dataDriver:DriverInterface, webSocketConnection:WebSocket) {
        // this.sqlClient = new SqlClient(dataDriver);
        this.dataDriver = dataDriver;
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
                    this.getTablesFromDataBase(message.params[0]);
                    break;
                case ACTIONS.SELECT_QUERY:
                     this.selectQuery(message.params[0], message.params[1], message.params[2]);
                    break;
                case ACTIONS.UPDATE_QUERY:
                     this.updateQuery(message.params[0], message.params[1], message.params[2]);
                    break;
                default:
                    console.log('Not implement action: ', message.action);
            }
        } catch (e) {
            console.log(e);
        }
    }

    getDataBasesList = () => {

        this.dataDriver.getListOfDatabases()
        .subscribe((database) => {
            const message = new WebSocketOutMessage(
                ACTIONS.SOCKET_DATABASE_LIST_APPEND_DATA,
                200,
                null,
                database
            );

            this.webSocketClient
                .sendMessage(message);
        });
    }

    getTablesFromDataBase = (dataBaseName: string) => {
        console.log('getTablesFromDataBase', dataBaseName);
        this.dataDriver.getListOfTablesInDatabase(dataBaseName).subscribe((table) => {
            const message = new WebSocketOutMessage(
              ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE,
              200,
              null,
              table,
            );
            this.webSocketClient
              .sendMessage(message);
        });
    }

    selectQuery = (databaseName:string, query:string, tabIndex:string) => {
        if (query.toLowerCase().startsWith('select')) {
            console.log('Operation Type Select:');
            new Select(databaseName, query, this.dataDriver, this.webSocketClient, tabIndex);
        } else if (query.toLowerCase().startsWith('show')) {
            console.log('ShowHelper');

        } else {
            console.log('ElseHelper not set');
        }
    }

    updateQuery = (databaseName:string, query:string, tabIndex:string) => {
        new Update(databaseName, query, this.dataDriver, this.webSocketClient, tabIndex);
    }
}

module.exports = Application;