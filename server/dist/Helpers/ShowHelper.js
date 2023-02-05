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
                    table: { databaseName: '', name: '', alias: '' },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2hvd0hlbHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9IZWxwZXJzL1Nob3dIZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN0RCxxREFBK0M7QUFHL0MsTUFBTSxVQUFVO0lBT1osWUFBWSxLQUFZLEVBQUUsU0FBMkIsRUFBRSxlQUF1QyxFQUFFLFFBQWU7UUFGL0csWUFBTyxHQUFxQixFQUFFLENBQUM7UUFnQi9CLGNBQVMsR0FBRyxDQUFDLEdBQU8sRUFBRSxFQUFFO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3hDO1lBRUQseUJBQXlCO1FBQzdCLENBQUMsQ0FBQTtRQUVELCtCQUEwQixHQUFHLENBQUMsR0FBTyxFQUFFLEVBQUU7WUFFckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVqQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQ3ZCLE1BQU0sVUFBVSxHQUFlO29CQUMzQixLQUFLLEVBQUUsRUFBQyxZQUFZLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBQztvQkFDOUMsYUFBYSxFQUFFLEtBQUs7b0JBQ3BCLFlBQVksRUFBRSxLQUFLO29CQUNuQixJQUFJLEVBQUUsTUFBTTtvQkFDWixRQUFRLEVBQUUsS0FBSztvQkFDZixVQUFVLEVBQUUsS0FBSztvQkFDakIsZUFBZSxFQUFFLEVBQUU7b0JBQ25CLGNBQWMsRUFBRSxFQUFFO2lCQUNyQixDQUFBO2dCQUNELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxDQUFDO1lBRUgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFBO1FBRUQsZ0JBQVcsR0FBRyxHQUFHLEVBQUU7WUFDZixNQUFNLE9BQU8sR0FBRyxJQUFJLG1CQUFtQixDQUNuQyxvQkFBTyxDQUFDLCtCQUErQixFQUN2QyxHQUFHLEVBQ0gsSUFBSSxFQUNKO2dCQUNJLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtnQkFDdkIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2FBQ3hCLENBQ0osQ0FBQztZQUVGLElBQUksQ0FBQyxlQUFlO2lCQUNmLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUM7UUF6REUsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFFekIsSUFBSSxDQUFDLFNBQVM7YUFDVCxrQkFBa0IsQ0FDZixJQUFJLENBQUMsS0FBSyxFQUNWLElBQUksQ0FBQyxTQUFTLEVBQ2QsQ0FBQyxHQUFPLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQ2hDLENBQUM7SUFDVixDQUFDO0NBZ0RKO0FBRUQsa0JBQWUsVUFBVSxDQUFDIn0=