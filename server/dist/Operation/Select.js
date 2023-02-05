"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const WebSocketClient = require('../WebSocketClient');
const ActionEnum_1 = require("../Server/ActionEnum");
class Select {
    constructor(databaseName, query, driver, webSocketClient, tabIndex) {
        this.sendDataRow = (row) => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW, 200, null, {
                tabIndex: this.tabIndex,
                row: row.row,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.webSocketClient = webSocketClient;
        this.tabIndex = tabIndex;
        driver.selectDatabase(databaseName)
            .then(() => {
            driver.countRecords(query).then((totalCountDto) => {
                this.sendTotalCount(totalCountDto);
            });
            const selectFromTypes = driver.getSelectFromTypeFromQuery(query);
            selectFromTypes.forEach((selectFromType) => {
                driver.getColumnsOfTable(databaseName, selectFromType).then((listOfColumnTypes) => {
                    this.sendColumns(listOfColumnTypes);
                });
            });
            driver.streamSelect(query).subscribe((subscriber) => {
                this.sendDataRow(subscriber);
            });
        });
    }
    sendTotalCount(totalCount) {
        this.webSocketClient
            .sendMessage(new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_TOTAL_ROWS, 200, null, {
            tabIndex: this.tabIndex,
            totalRows: totalCount.totalCount,
        }));
    }
    sendColumns(columns) {
        const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS, 200, null, {
            tabIndex: this.tabIndex,
            columns: columns,
        });
        this.webSocketClient
            .sendMessage(message);
    }
}
exports.default = Select;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL09wZXJhdGlvbi9TZWxlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBR3RELHFEQUE2QztBQUc3QyxNQUFNLE1BQU07SUFJVixZQUFZLFlBQW1CLEVBQUUsS0FBWSxFQUFFLE1BQXVCLEVBQUUsZUFBdUMsRUFBRSxRQUFlO1FBc0RoSSxnQkFBVyxHQUFHLENBQUMsR0FBVSxFQUFFLEVBQUU7WUFDM0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsb0JBQU8sQ0FBQyx1Q0FBdUMsRUFDL0MsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRzthQUNiLENBQ0YsQ0FBQztZQUVGLElBQUksQ0FBQyxlQUFlO2lCQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUIsQ0FBQyxDQUFBO1FBakVDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBRXpCLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDO2FBQ2hDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVCxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFO2dCQUNoRCxJQUFJLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3JDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsTUFBTSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRWpFLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxjQUFjLEVBQUUsRUFBRTtnQkFDekMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFO29CQUNoRixJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQ3RDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFO2dCQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQy9CLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sY0FBYyxDQUFDLFVBQXlCO1FBQzlDLElBQUksQ0FBQyxlQUFlO2FBQ2pCLFdBQVcsQ0FBQyxJQUFJLG1CQUFtQixDQUNsQyxvQkFBTyxDQUFDLGtDQUFrQyxFQUMxQyxHQUFHLEVBQ0gsSUFBSSxFQUNKO1lBQ0UsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLFNBQVMsRUFBRSxVQUFVLENBQUMsVUFBVTtTQUNqQyxDQUNGLENBQ0YsQ0FBQztJQUNKLENBQUM7SUFFTyxXQUFXLENBQUMsT0FBcUI7UUFDdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsb0JBQU8sQ0FBQywrQkFBK0IsRUFDdkMsR0FBRyxFQUNILElBQUksRUFDSjtZQUNFLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixPQUFPLEVBQUUsT0FBTztTQUNqQixDQUNGLENBQUM7UUFFRixJQUFJLENBQUMsZUFBZTthQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUIsQ0FBQztDQWdCRjtBQUVELGtCQUFlLE1BQU0sQ0FBQyJ9