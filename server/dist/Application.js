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
                .queryResults(`USE ${dataBaseName}`, () => {
                this.sqlClient
                    .streamQueryResults('SHOW TABLES', (row) => {
                    console.log(row);
                    const tableName = Object.values(row)[0];
                    if (tableName !== 0) {
                        const message = new WebSocketOutMessage(ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE, 200, null, {
                            tableName,
                            dataBaseName,
                        });
                        this.webSocketClient
                            .sendMessage(message);
                    }
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
                console.log('ElseHelper');
            }
        };
        this.sqlClient = new SqlClient(sqlConnection);
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }
}
module.exports = Application;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyRCxNQUFNLEVBQUMsT0FBTyxFQUFDLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDakQsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3pDLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFFcEUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFDdkQsc0VBQThDO0FBRTlDLE1BQU0sV0FBVztJQUtiLFlBQVksYUFBaUIsRUFBRSxtQkFBNkI7UUFPNUQsbUJBQWMsR0FBRyxDQUFDLE9BQTJCLEVBQUUsRUFBRTtZQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxJQUFJO2dCQUNBLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRTtvQkFDcEIsS0FBSyxPQUFPLENBQUMsYUFBYTt3QkFDdEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7d0JBQ3hCLE1BQUs7b0JBQ1QsS0FBSyxPQUFPLENBQUMsOEJBQThCO3dCQUV2QyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM5QyxNQUFNO29CQUNWLEtBQUssT0FBTyxDQUFDLFlBQVk7d0JBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFD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