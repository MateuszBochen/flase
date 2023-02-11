"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ActionEnum_1 = require("../Server/ActionEnum");
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const WebSocketClient = require('../WebSocketClient');
class Update {
    constructor(databaseName, query, driver, webSocketClient, tabIndex) {
        this.sendOk = (updateResult) => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_UPDATE_QUERY, 200, null, {
                tabIndex: this.tabIndex,
                message: updateResult.message,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.sendNotOk = (error) => {
            const message = new WebSocketOutMessage(ActionEnum_1.ACTIONS.SOCKET_UPDATE_QUERY, 506, null, {
                tabIndex: this.tabIndex,
                error: error,
            });
            this.webSocketClient
                .sendMessage(message);
        };
        this.tabIndex = tabIndex;
        this.webSocketClient = webSocketClient;
        driver.selectDatabase(databaseName)
            .then(() => {
            driver.updateQuery(query).then((message) => {
                this.sendOk(message);
            })
                .catch((error) => {
                this.sendNotOk(error);
            });
        })
            .catch((error) => {
            this.sendNotOk(error);
        });
    }
}
exports.default = Update;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXBkYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL09wZXJhdGlvbi9VcGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxREFBNkM7QUFDN0MsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsK0JBQStCLENBQUMsQ0FBQztBQUNyRSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUt0RCxNQUFNLE1BQU07SUFJVixZQUFZLFlBQW1CLEVBQUUsS0FBWSxFQUFFLE1BQXVCLEVBQUUsZUFBdUMsRUFBRSxRQUFlO1FBa0J4SCxXQUFNLEdBQUcsQ0FBQyxZQUE4QixFQUFFLEVBQUU7WUFDbEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxtQkFBbUIsQ0FDckMsb0JBQU8sQ0FBQyxtQkFBbUIsRUFDM0IsR0FBRyxFQUNILElBQUksRUFDSjtnQkFDRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLE9BQU8sRUFBRSxZQUFZLENBQUMsT0FBTzthQUM5QixDQUNGLENBQUM7WUFFRixJQUFJLENBQUMsZUFBZTtpQkFDakIsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzFCLENBQUMsQ0FBQTtRQUVPLGNBQVMsR0FBRyxDQUFDLEtBQVMsRUFBRSxFQUFFO1lBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQUksbUJBQW1CLENBQ3JDLG9CQUFPLENBQUMsbUJBQW1CLEVBQzNCLEdBQUcsRUFDSCxJQUFJLEVBQ0o7Z0JBQ0UsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2dCQUN2QixLQUFLLEVBQUUsS0FBSzthQUNiLENBQ0YsQ0FBQztZQUVGLElBQUksQ0FBQyxlQUFlO2lCQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUIsQ0FBQyxDQUFBO1FBN0NDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDO2FBQ2hDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO2dCQUN6QyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZCLENBQUMsQ0FBQztpQkFDQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDakIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQzthQUNELEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FnQ0Y7QUFFRCxrQkFBZSxNQUFNLENBQUMifQ==