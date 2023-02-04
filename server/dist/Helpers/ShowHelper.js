"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const SqlClient = require('../SqlClient');
const WebSocketClient = require('../WebSocketClient');
const ActionEnum_1 = require("../Server/ActionEnum");
class ShowHelper {
    constructor(query, sqlClient, webSocketClient, tabIndex) {
        this.columns = [];
        this.fetchData = (row) => {
            console.log("sendDataRow fetching data");
            if (!this.columns.length) {
                console.log("sendDataRow fetching columns");
                this.getColumnsFromSelectRecord(row);
            }
            // this.sendDataRow(row);
        };
        this.getColumnsFromSelectRecord = (row) => {
            const columns = Object.keys(row);
            columns.forEach((column) => {
                const columnType = {
                    autoIncrement: false,
                    defaultValue: false,
                    name: column,
                    nullable: false,
                    primaryKey: false,
                    referenceColumn: '',
                    referenceTable: '',
                };
                this.columns.push(columnType);
            });
            console.log(this.columns);
        };
        this.sendColumns = () => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS, 200, null, {
                tabIndex: this.tabIndex,
                columns: this.columns,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.sqlClient = sqlClient;
        this.webSocketClient = webSocketClient;
        this.query = query;
        this.tabIndex = tabIndex;
        this.sqlClient
            .streamQueryResults(this.query, this.fetchData, (row) => console.log(row));
    }
}
exports.default = ShowHelper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2hvd0hlbHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9IZWxwZXJzL1Nob3dIZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN0RCxxREFBK0M7QUFHL0MsTUFBTSxVQUFVO0lBT1osWUFBWSxLQUFZLEVBQUUsU0FBMkIsRUFBRSxlQUF1QyxFQUFFLFFBQWU7UUFGL0csWUFBTyxHQUFxQixFQUFFLENBQUM7UUFnQi9CLGNBQVMsR0FBRyxDQUFDLEdBQU8sRUFBRSxFQUFFO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3hDO1lBRUQseUJBQXlCO1FBQzdCLENBQUMsQ0FBQTtRQUVELCtCQUEwQixHQUFHLENBQUMsR0FBTyxFQUFFLEVBQUU7WUFFckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVqQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQ3ZCLE1BQU0sVUFBVSxHQUFlO29CQUMzQixhQUFhLEVBQUUsS0FBSztvQkFDcEIsWUFBWSxFQUFFLEtBQUs7b0JBQ25CLElBQUksRUFBRSxNQUFNO29CQUNaLFFBQVEsRUFBRSxLQUFLO29CQUNmLFVBQVUsRUFBRSxLQUFLO29CQUNqQixlQUFlLEVBQUUsRUFBRTtvQkFDbkIsY0FBYyxFQUFFLEVBQUU7aUJBQ3JCLENBQUE7Z0JBQ0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUE7UUFFRCxnQkFBVyxHQUFHLEdBQUcsRUFBRTtZQUNmLE1BQU0sT0FBTyxHQUFHLElBQUksbUJBQW1CLENBQ25DLG9CQUFPLENBQUMsK0JBQStCLEVBQ3ZDLEdBQUcsRUFDSCxJQUFJLEVBQ0o7Z0JBQ0ksUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2dCQUN2QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87YUFDeEIsQ0FDSixDQUFDO1lBRUYsSUFBSSxDQUFDLGVBQWU7aUJBQ2YsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQztRQXhERSxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUV6QixJQUFJLENBQUMsU0FBUzthQUNULGtCQUFrQixDQUNmLElBQUksQ0FBQyxLQUFLLEVBQ1YsSUFBSSxDQUFDLFNBQVMsRUFDZCxDQUFDLEdBQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FDaEMsQ0FBQztJQUNWLENBQUM7Q0ErQ0o7QUFFRCxrQkFBZSxVQUFVLENBQUMifQ==