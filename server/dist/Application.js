"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketClient = require('./WebSocketClient');
const { ACTIONS } = require("./Server/ActionEnum");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');
const Select_1 = __importDefault(require("./Operation/Select"));
const Update_1 = __importDefault(require("./Operation/Update"));
class Application {
    constructor(dataDriver, webSocketConnection) {
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
                    case ACTIONS.UPDATE_QUERY:
                        this.updateQuery(message.params[0], message.params[1], message.params[2]);
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
            this.dataDriver.getListOfDatabases()
                .subscribe((database) => {
                const message = new WebSocketOutMessage(ACTIONS.SOCKET_DATABASE_LIST_APPEND_DATA, 200, null, database);
                this.webSocketClient
                    .sendMessage(message);
            });
        };
        this.getTablesFromDataBase = (dataBaseName) => {
            console.log('getTablesFromDataBase', dataBaseName);
            this.dataDriver.getListOfTablesInDatabase(dataBaseName).subscribe((table) => {
                const message = new WebSocketOutMessage(ACTIONS.SOCKET_GET_TABLES_FOR_DATABASE, 200, null, table);
                this.webSocketClient
                    .sendMessage(message);
            });
        };
        this.selectQuery = (databaseName, query, tabIndex) => {
            if (query.toLowerCase().startsWith('select')) {
                console.log('Operation Type Select:');
                new Select_1.default(databaseName, query, this.dataDriver, this.webSocketClient, tabIndex);
            }
            else if (query.toLowerCase().startsWith('show')) {
                console.log('ShowHelper');
            }
            else {
                console.log('ElseHelper not set');
            }
        };
        this.updateQuery = (databaseName, query, tabIndex) => {
            new Update_1.default(databaseName, query, this.dataDriver, this.webSocketClient, tabIndex);
        };
        // this.sqlClient = new SqlClient(dataDriver);
        this.dataDriver = dataDriver;
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }
}
module.exports = Application;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyRCxNQUFNLEVBQUMsT0FBTyxFQUFDLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDakQsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsOEJBQThCLENBQUMsQ0FBQztBQUdwRSxnRUFBd0M7QUFDeEMsZ0VBQXdDO0FBRXhDLE1BQU0sV0FBVztJQUtiLFlBQVksVUFBMEIsRUFBRSxtQkFBNkI7UUFPckUsbUJBQWMsR0FBRyxDQUFDLE9BQTJCLEVBQUUsRUFBRTtZQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxJQUFJO2dCQUNBLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRTtvQkFDcEIsS0FBSyxPQUFPLENBQUMsYUFBYTt3QkFDdEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7d0JBQ3hCLE1BQUs7b0JBQ1QsS0FBSyxPQUFPLENBQUMsOEJBQThCO3dCQUN2QyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM5QyxNQUFNO29CQUNWLEtBQUssT0FBTyxDQUFDLFlBQVk7d0JBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDM0UsTUFBTTtvQkFDVixLQUFLLE9BQU8sQ0FBQyxZQUFZO3dCQUNwQixJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8s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