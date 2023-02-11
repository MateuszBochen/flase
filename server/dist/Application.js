"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketClient = require('./WebSocketClient');
const { ACTIONS } = require("./Server/ActionEnum");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');
const Select_1 = __importDefault(require("./Operation/Select"));
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
            /*this.dataDriver.streamSelect(databaseName, query).subscribe((subscriber) => {
                console.log('subscriber', subscriber);
    
                switch (subscriber.constructor) {
                    case TotalCountDto:
                        this.webSocketClient
                          .sendMessage(new WebSocketOutMessage(
                            ACTIONS.SOCKET_SET_SELECT_QUERY_TOTAL_ROWS,
                            200,
                            null,
                            {
                                tabIndex: tabIndex,
                                totalRows: subscriber.totalCount,
                            }
                          ));
                        break;
    
    
                }
            });*/
            /*if (!query) {
                return;
            }
    
            */
        };
        // this.sqlClient = new SqlClient(dataDriver);
        this.dataDriver = dataDriver;
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }
}
module.exports = Application;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyRCxNQUFNLEVBQUMsT0FBTyxFQUFDLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDakQsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsOEJBQThCLENBQUMsQ0FBQztBQUdwRSxnRUFBd0M7QUFFeEMsTUFBTSxXQUFXO0lBS2IsWUFBWSxVQUEwQixFQUFFLG1CQUE2QjtRQU9yRSxtQkFBYyxHQUFHLENBQUMsT0FBMkIsRUFBRSxFQUFFO1lBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELElBQUk7Z0JBQ0EsUUFBUSxPQUFPLENBQUMsTUFBTSxFQUFFO29CQUNwQixLQUFLLE9BQU8sQ0FBQyxhQUFhO3dCQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDeEIsTUFBSztvQkFDVCxLQUFLLE9BQU8sQ0FBQyw4QkFBOEI7d0JBQ3ZDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLE1BQU07b0JBQ1YsS0FBSyxPQUFPLENBQUMsWUFBWTt3QkFDcEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMzRSxNQUFNO29CQUNWO3dCQUNJLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2lCQUM3RDthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNsQjtRQUNMLENBQUMsQ0FBQTtRQUVELHFCQUFnQixHQUFHLEdBQUcsRUFBRTtZQUVwQixJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQixFQUFFO2lCQUNuQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtnQkFDcEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDbkMsT0FBTyxDQUFDLGdDQUFnQyxFQUN4QyxHQUFHLEVBQ0gsSUFBSSxFQUNKLFFBQVEsQ0FDWCxDQUFDO2dCQUVGLElBQUksQ0FBQyxlQUFlO3FCQUNmLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM5QixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQTtRQUVELDBCQUFxQixHQUFHLENBQUMsWUFBb0IsRUFBRSxFQUFFO1lBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDeEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsT0FBTyxDQUFDLDhCQUE4QixFQUN0QyxHQUFHLEVBQ0gsSUFBSSxFQUNKLEtBQUssQ0FDTixDQUFDO2dCQUNGLElBQUksQ0FBQyxlQUFlO3FCQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDNUIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUE7UUFFRCxnQkFBVyxHQUFHLENBQUMsWUFBbUIsRUFBRSxLQUFZLEVBQUUsUUFBZSxFQUFFLEVBQUU7WUFDakUsSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7Z0JBQ3RDLElBQUksZ0JBQU0sQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQzthQUNwRjtpQkFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7YUFFN0I7aUJBQU07Z0JBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2FBQ3JDO1lBR0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7aUJBbUJLO1lBRUw7Ozs7Y0FJRTtRQUNOLENBQUMsQ0FBQTtRQS9GRyw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7Q0E2Rko7QUFFRCxNQUFNLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQyJ9