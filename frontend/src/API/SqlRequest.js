import WebSocketClientFactory from "../Library/WebSocketClientFactory";
import WebSocketOutMessage from "../Library/DataTypes/WebSocketOutMessage";

class SqlRequest {
    query = (databaseName, query, tabIndex) => {
        const message =  new WebSocketOutMessage('SELECT_QUERY', [databaseName, query, tabIndex]);
        const websocketClient = WebSocketClientFactory.getClient();
        websocketClient.sendMessage(message);
    }
}

export default SqlRequest;
