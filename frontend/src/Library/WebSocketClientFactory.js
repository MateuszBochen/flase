import BaseRequest from '../API/BaseRequest';
import WebSocketClient from "./WebSocketClient";

class WebSocketClientFactory {
    static _client = null;


    static createNewClient = (token) => {
        const url = `${BaseRequest.WS_URL}/ws/${token}`;
        if (!WebSocketClientFactory._client) {
            WebSocketClientFactory._client = new WebSocketClient(new WebSocket(url));
        }
    }

    static getClient = () => {
        return WebSocketClientFactory._client;
    }

    static closeConnection = () => {
        if (WebSocketClientFactory._client) {
            WebSocketClientFactory._client.closeConnection();
            WebSocketClientFactory._client = null;
        }
    }
}

export default WebSocketClientFactory;
