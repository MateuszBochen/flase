import WebSocketClientFactory from '../Library/WebSocketClientFactory';
import WebSocketOutMessage from '../Library/DataTypes/WebSocketOutMessage';

class SqlRequest {

    static instance = undefined;

    static getInstance() {
        if (!SqlRequest.instance) {
            SqlRequest.instance = new SqlRequest();
        }

        return SqlRequest.instance;
    }

    query = (databaseName, query, tabIndex) => {
        const message =  new WebSocketOutMessage('SELECT_QUERY', [databaseName, query, tabIndex]);
        const websocketClient = WebSocketClientFactory.getClient();
        websocketClient.sendMessage(message);
    }

    update = (databaseName, query, tabIndex) => {
        const message =  new WebSocketOutMessage('UPDATE_QUERY', [databaseName, query, tabIndex]);
        const websocketClient = WebSocketClientFactory.getClient();
        websocketClient.sendMessage(message);
    }
}

export default SqlRequest;
