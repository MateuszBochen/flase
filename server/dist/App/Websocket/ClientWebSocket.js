"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ClientWebSocket {
    constructor(nativeWebsocketClient) {
        this.nativeWebsocketClient = nativeWebsocketClient;
    }
    send(data) {
        const json = JSON.stringify(data);
        this.nativeWebsocketClient.send(json);
    }
}
exports.default = ClientWebSocket;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2xpZW50V2ViU29ja2V0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9XZWJzb2NrZXQvQ2xpZW50V2ViU29ja2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxlQUFlO0lBRW5CLFlBQVkscUJBQWdDO1FBQzFDLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxxQkFBcUIsQ0FBQztJQUNyRCxDQUFDO0lBRUQsSUFBSSxDQUFJLElBQXlCO1FBQy9CLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4QyxDQUFDO0NBQ0Y7QUFDRCxrQkFBZSxlQUFlLENBQUMifQ==