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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2hvd0hlbHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9IZWxwZXJzL1Nob3dIZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN0RCxxREFBK0M7QUFHL0MsTUFBTSxVQUFVO0lBT1osWUFBWSxLQUFZLEVBQUUsU0FBMkIsRUFBRSxlQUF1QyxFQUFFLFFBQWU7UUFGL0csWUFBTyxHQUEwQixFQUFFLENBQUM7UUFnQnBDLGNBQVMsR0FBRyxDQUFDLEdBQU8sRUFBRSxFQUFFO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3hDO1lBRUQseUJBQXlCO1FBQzdCLENBQUMsQ0FBQTtRQUVELCtCQUEwQixHQUFHLENBQUMsR0FBTyxFQUFFLEVBQUU7WUFFckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVqQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQ3ZCLE1BQU0sVUFBVSxHQUFvQjtvQkFDaEMsS0FBSyxFQUFFLEVBQUMsWUFBWSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUM7b0JBQzlDLGFBQWEsRUFBRSxLQUFLO29CQUNwQixZQUFZLEVBQUUsS0FBSztvQkFDbkIsSUFBSSxFQUFFLE1BQU07b0JBQ1osUUFBUSxFQUFFLEtBQUs7b0JBQ2YsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLGVBQWUsRUFBRSxFQUFFO29CQUNuQixjQUFjLEVBQUUsRUFBRTtpQkFDckIsQ0FBQTtnQkFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsQ0FBQztZQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQTtRQUVELGdCQUFXLEdBQUcsR0FBRyxFQUFFO1lBQ2YsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDbkMsb0JBQU8sQ0FBQywrQkFBK0IsRUFDdkMsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDSSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTzthQUN4QixDQUNKLENBQUM7WUFFRixJQUFJLENBQUMsZUFBZTtpQkFDZixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDO1FBekRFLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBRXpCLElBQUksQ0FBQyxTQUFTO2FBQ1Qsa0JBQWtCLENBQ2YsSUFBSSxDQUFDLEtBQUssRUFDVixJQUFJLENBQUMsU0FBUyxFQUNkLENBQUMsR0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUNoQyxDQUFDO0lBQ1YsQ0FBQztDQWdESjtBQUVELGtCQUFlLFVBQVUsQ0FBQyJ9