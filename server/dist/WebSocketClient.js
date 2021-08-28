"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocketInMessage = require("./Server/WebSocketInMessage");
class WebSocketClient {
    constructor(websocketConnection) {
        this.onIncomingMessage = (callback) => {
            this.incomingMessageCallback = callback;
        };
        this.sendMessage = (message) => {
            console.log('message Out: ', message);
            this.websocketConnection.send(JSON.stringify(message));
        };
        this.websocketConnection = websocketConnection;
        this.incomingMessageCallback = (arg) => console.log('call back for on message is not implement');
        this.websocketConnection.on(WebSocketClient.ON_INCOMING_MESSAGE, (messageJson) => {
            console.log('message In: ', messageJson);
            try {
                const message = Object.assign(new WebSocketInMessage(), JSON.parse(messageJson));
                if (this.incomingMessageCallback) {
                    this.incomingMessageCallback(message);
                }
            }
            catch (e) {
                console.log(e);
            }
        });
    }
}
WebSocketClient.ON_INCOMING_MESSAGE = 'message';
module.exports = WebSocketClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2ViU29ja2V0Q2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1dlYlNvY2tldENsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sa0JBQWtCLEdBQUcsT0FBTyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFFbEUsTUFBTSxlQUFlO0lBTWpCLFlBQVksbUJBQXVCO1FBaUJuQyxzQkFBaUIsR0FBRyxDQUFDLFFBQTJCLEVBQUUsRUFBRTtZQUNoRCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsUUFBUSxDQUFDO1FBQzVDLENBQUMsQ0FBQTtRQUVELGdCQUFXLEdBQUcsQ0FBQyxPQUE2QixFQUFFLEVBQUU7WUFDNUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFBO1FBdkJHLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxtQkFBbUIsQ0FBQztRQUMvQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsQ0FBQyxHQUFPLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkNBQTJDLENBQUMsQ0FBQztRQUVyRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLFdBQWtCLEVBQUUsRUFBRTtZQUNwRixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN6QyxJQUFJO2dCQUNBLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDakYsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUU7b0JBQzlCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztpQkFDekM7YUFDSjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDbEI7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7O0FBcEJNLG1DQUFtQixHQUFHLFNBQVMsQ0FBQztBQWdEM0MsTUFBTSxDQUFDLE9BQU8sR0FBRyxlQUFlLENBQUMifQ==