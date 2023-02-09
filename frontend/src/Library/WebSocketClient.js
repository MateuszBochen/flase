import store from '../store';
import WebSocketInMessage from "./DataTypes/WebSocketInMessage";
import WebSocketOutMessage from "./DataTypes/WebSocketOutMessage";
import SnackTraceStoreManager from '../Containers/SnackTrace/Store/StoreManager';
import StankTraceDto from '../Containers/SnackTrace/Dto/StankTraceDto';

class WebSocketClient {
    _nativeWebSocketClient = null;

    constructor(client) {
        this._nativeWebSocketClient = client;

        this._nativeWebSocketClient.onopen = (event) => {
            console.log('connection opened successfully');
        }

        this._nativeWebSocketClient.onclose = (e) => {
            store.dispatch({
                type: 'LOGOUT',
                data: [],
            });
        };

        this.receiveMessage();
    }

    getConnection = () => {
        return this._nativeWebSocketClient;
    }

    closeConnection = () => {
        this._nativeWebSocketClient.close();
        this._nativeWebSocketClient = null;
    }

    sendMessage = (message) => {
        this.waitForConnection(() => {
            this._nativeWebSocketClient.send(JSON.stringify(message));
        }, 10);

    };

    getTablesForDatabase = (databaseName) => {
        const message = new WebSocketOutMessage(
            'SOCKET_GET_TABLES_FOR_DATABASE',
            [databaseName]
        );

        this.sendMessage(message);
    }

    receiveMessage = () => {
        this._nativeWebSocketClient.onmessage = (event) => {
            let message;
            try {
                message = JSON.parse(event.data, );
                message = Object.assign(new WebSocketInMessage, message);
            } catch (e) {
                console.log('Fatal: ', e);
                return;
            }

            if (message.code >= 200 && message.code <= 300) {
                if (message && message.action) {
                    store.dispatch({
                        type: message.action,
                        data: message.data,
                    });
                }
            } else if (message.code >= 400 && message.code <= 500) {
                const snackTraceStoreManager = SnackTraceStoreManager.getInstance();
                snackTraceStoreManager.addItem(StankTraceDto.createWarning(message.data.error));
            }

        }
    }

    waitForConnection = (callback, interval) => {
        if (this._nativeWebSocketClient.readyState === 1) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForConnection(callback, interval);
            }, interval);
        }
    };
}

export default WebSocketClient;
