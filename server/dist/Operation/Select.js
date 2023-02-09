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
        this.sendError = (e) => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW, 406, null, {
                tabIndex: this.tabIndex,
                error: e,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.webSocketClient = webSocketClient;
        this.tabIndex = tabIndex;
        driver.selectDatabase(databaseName)
            .then(() => {
            try {
                driver.countRecords(query)
                    .then((totalCountDto) => {
                    this.sendTotalCount(totalCountDto);
                }).catch((e) => {
                    this.sendError(e.message);
                });
            }
            catch (e) {
                this.sendError(e.message);
                return;
            }
            let selectFromTypes = [];
            try {
                selectFromTypes = driver.getSelectFromTypeFromQuery(query);
            }
            catch (e) {
                this.sendError(e.message);
                return;
            }
            selectFromTypes.forEach((selectFromType) => {
                driver.getColumnsOfTable(databaseName, selectFromType).then((listOfColumnTypes) => {
                    this.sendColumns(listOfColumnTypes);
                });
            });
            driver.streamSelect(query).subscribe((subscriber) => {
                this.sendDataRow(subscriber);
            });
        })
            .catch((e) => {
            console.log(222222222222222222);
            this.sendError(e.message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL09wZXJhdGlvbi9TZWxlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3JFLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBR3RELHFEQUE2QztBQUk3QyxNQUFNLE1BQU07SUFJVixZQUFZLFlBQW1CLEVBQUUsS0FBWSxFQUFFLE1BQXVCLEVBQUUsZUFBdUMsRUFBRSxRQUFlO1FBeUVoSSxnQkFBVyxHQUFHLENBQUMsR0FBVSxFQUFFLEVBQUU7WUFDM0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsb0JBQU8sQ0FBQyx1Q0FBdUMsRUFDL0MsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRzthQUNiLENBQ0YsQ0FBQztZQUVGLElBQUksQ0FBQyxlQUFlO2lCQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUIsQ0FBQyxDQUFBO1FBRUQsY0FBUyxHQUFHLENBQUMsQ0FBSyxFQUFFLEVBQUU7WUFDcEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsb0JBQU8sQ0FBQyx1Q0FBdUMsRUFDL0MsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLEtBQUssRUFBRSxDQUFDO2FBQ1QsQ0FDRixDQUFDO1lBRUYsSUFBSSxDQUFDLGVBQWU7aUJBQ2pCLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMxQixDQUFDLENBQUE7UUFuR0MsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFFekIs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