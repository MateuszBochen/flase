"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketClient = require('./WebSocketClient');
const { ACTIONS } = require("./Server/ActionEnum");
const SqlClient = require("./SqlClient");
const WebSocketOutMessage = require('./Server/WebSocketOutMessage');
const SelectHelper = require('./Helpers/SelectHelper');
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
            new SelectHelper(databaseName, query, this.sqlClient, this.webSocketClient, tabIndex);
        };
        this.sqlClient = new SqlClient(sqlConnection);
        this.webSocketClient = new WebSocketClient(webSocketConnection);
        this.webSocketClient.onIncomingMessage(this.dispatchAction);
    }
}
module.exports = Application;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXBwbGljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUNyRCxNQUFNLEVBQUMsT0FBTyxFQUFDLEdBQUcsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDakQsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3pDLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFFcEUsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFFdkQsTUFBTSxXQUFXO0lBS2IsWUFBWSxhQUFpQixFQUFFLG1CQUE2QjtRQU81RCxtQkFBYyxHQUFHLENBQUMsT0FBMkIsRUFBRSxFQUFFO1lBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELElBQUk7Z0JBQ0EsUUFBUSxPQUFPLENBQUMsTUFBTSxFQUFFO29CQUNwQixLQUFLLE9BQU8sQ0FBQyxhQUFhO3dCQUN0QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDeEIsTUFBSztvQkFDVCxLQUFLLE9BQU8sQ0FBQyw4QkFBOEI7d0JBRXZDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLE1BQU07b0JBQ1YsS0FBSyxPQUFPLENBQUMsWUFBWTt3QkFDcEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMzRSxNQUFNO29CQUNWO3dCQUNJLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2lCQUM3RDthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNsQjtRQUNMLENBQUMsQ0FBQTtRQUVELHFCQUFnQixHQUFHLEdBQUcsRUFBRTtZQUNwQixNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQztZQUUvQixJQUFJLENBQUMsU0FBUztpQkFDVCxrQkFBa0IsQ0FDZixLQUFLLEVBQ0wsQ0FBQyxHQUFPLEVBQUUsRUFBRTtnQkFDUixNQUFNLE9BQU8sR0FBRyxJQUFJLG1CQUFtQixDQUNuQyxPQUFPLENBQUMsZ0NBQWdDLEVBQ3hDLEdBQUcsRUFDSCxJQUFJLEVBQ0osR0FBRyxDQUNOLENBQUM7Z0JBRUYsSUFBSSxDQUFDLGVBQWU7cUJBQ2YsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzlCLENBQUMsRUFDRCxDQUFDLEtBQVMsRUFBRSxFQUFFO2dCQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkIsQ0FBQyxDQUNKLENBQUM7UUFFVixDQUFDLENBQUE7UUFFRCwwQkFBcUIsR0FBRyxDQUFDLFlBQW9CLEVBQUUsRUFBRTtZQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLFlBQVksQ0FBQyxDQUFBO1lBQ2xELElBQUksQ0FBQyxTQUFTO2lCQUNULFlBQVksQ0FDVCxPQUFPLFlBQVksRUFBRSxFQUNyQixHQUFHLEVBQUU7Z0JBQ0QsSUFBSSxDQUFDLFNBQVM7cUJBQ1Qsa0JBQWtCLENBQ2YsYUFBYSxFQUNiLENBQUMsR0FBTyxFQUFFLEVBQUU7b0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxTQUFTLEtBQUssQ0FBQyxFQUFFO3dCQUNqQixNQUFNLE9BQU8sR0FBRyxJQUFJLG1CQUFtQixDQUNuQyxPQUFPLENBQUMsOEJBQThCLEVBQ3RDLEdBQUcsRUFDSCxJQUFJLEVBQ0o7NEJBQ0ksU0FBUzs0QkFDVCxZQUFZO3lCQUNmLENBQ0osQ0FBQzt3QkFDRixJQUFJLENBQUMsZUFBZTs2QkFDZixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7cUJBQzdCO2dCQUNMLENBQUMsQ0FDSixDQUFDO1lBQ1YsQ0FBQyxDQUNKLENBQUM7UUFDVixDQUFDLENBQUE7UUFFRCxnQkFBVyxHQUFHLENBQUMsWUFBbUIsRUFBRSxLQUFZLEVBQUUsUUFBZSxFQUFFLEVBQUU7WUFDakUsSUFBSSxDQUFDLEtBQUssRUFBRTtnQkFDUixPQUFPO2FBQ1Y7WUFFRCxJQUFJLFlBQVksQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMxRixDQUFDLENBQUE7UUF6RkcsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDaEUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDaEUsQ0FBQztDQXdGSjtBQUVELE1BQU0sQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDIn0=