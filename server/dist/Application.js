"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketClient = require('./WebSocketClient');
const { ACTIONS } = require("./Server/ActionEnum");
const SqlClient = require("./SqlClient");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');
const SelectHelper = require('./Helpers/SelectHelper');
const ShowHelper_1 = __importDefault(require("./Helpers/ShowHelper"));
class Application {
    constructor(sqlConnection, webSocketConnection) {
        this.dispatchAction = (message) => {
            console.log('dispatchAction: ', message.action);
            try {
                switch (message.action) {
                    case ACTIONS.DATABASE_LIST:
                        this.getDataBasesList();
                        break;
                    case ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE:
                        this.getTablesFromDataBase(message.params[0]);
                        break;
                    case ACTIONS.SELECT_QUERY:
                        this.selectQuery(message.params[0], message.params[1], message.params[2]);
                        break;
                    default:
                        console.log('Not implement action: ', message.action);
                }
            }
            catch (e) {
                console.log(e);
            }
        };
        this.getDataBasesList = () => {
            const query = 'SHOW DATABASES';
            this.sqlClient
                .streamQueryResults(query, (row) => {
                const message = new WebSocketOutMessage(ACTIONS.SOCKET_DATABASE_LIST_APPEND_DATA, 200, null, row);
                this.webSocketClient
                    .sendMessage(message);
            }, (error) => {
                console.log(error);
            });
        };
        this.getTablesFromDataBase = (dataBaseName) => {
            console.log('getTablesFromDataBase', dataBaseName);
            this.sqlClient
                .queryResults(`USE ${dataBaseName}; SHOW TABLES;`, (row) => {
                this.sendTablesNames(row[1], dataBaseName);
            });
        };
        this.sendTablesNames = (tableNames, databaseName) => {
            tableNames.forEach((tableName) => {
                Object.entries(tableName).forEach((item) => {
                    const message = new WebSocketOutMessage(ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE, 200, null, {
                        tableName: tableName[item[0]],
                        dataBaseName: databaseName,
                    });
                    this.webSocketClient
                        .sendMessage(message);
                });
            });
        };
        this.selectQuery = (databaseName, query, tabIndex) => {
            if (!query) {
                return;
            }
            if (query.toLowerCase().startsWith('select')) {
                console.log('SelectHelper');
                new SelectHelper(databaseName, query, this.sqlClient, this.webSocketClient, tabIndex);
            }
            else if (query.toLowerCase().startsWith('show')) {
                console.log('ShowHelper');
                new ShowHelper_1.default(query, this.sqlClient, this.webSocketClient, tabIndex);
            }
            else {
                console.log('ElseHelper not set');
            }
        };
        this.sqlClient = new SqlClient(sqlConnection);
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }
}
module.exports = Application;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyRCxNQUFNLEVBQUMsT0FBTyxFQUFDLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDakQsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3pDLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFFcEUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFDdkQsc0VBQThDO0FBRTlDLE1BQU0sV0FBVztJQUtiLFlBQVksYUFBaUIsRUFBRSxtQkFBNkI7UUFPNUQsbUJBQWMsR0FBRyxDQUFDLE9BQTJCLEVBQUUsRUFBRTtZQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxJQUFJO2dCQUNBLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRTtvQkFDcEIsS0FBSyxPQUFPLENBQUMsYUFBYTt3QkFDdEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7d0JBQ3hCLE1BQUs7b0JBQ1QsS0FBSyxPQUFPLENBQUMsOEJBQThCO3dCQUV2QyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM5QyxNQUFNO29CQUNWLEtBQUssT0FBTyxDQUFDLFlBQVk7d0JBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFD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