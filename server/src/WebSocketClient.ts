import {IWebSocketOutMessage} from "./Server/WebSocketOutMessage";

const WebSocketInMessage = require("./Server/WebSocketInMessage");

class WebSocketClient {
    static ON_INCOMING_MESSAGE = 'message';

    websocketConnection:any;
    incomingMessageCallback: (arg:any) => void;

    constructor(websocketConnection:any) {
        this.websocketConnection = websocketConnection;
        this.incomingMessageCallback = (arg:any) => console.log('call back for on message is not implement');

        this.websocketConnection.on(WebSocketClient.ON_INCOMING_MESSAGE, (messageJson:string) => {
            console.log('message In: ', messageJson);
            try {
                const message = Object.assign(new WebSocketInMessage(), JSON.parse(messageJson));
                if (this.incomingMessageCallback) {
                    this.incomingMessageCallback(message);
                }
            } catch (e) {
                console.log(e);
            }
        });
    }

    onIncomingMessage = (callback: (arg:any) => void) => {
        this.incomingMessageCallback = callback;
    }

    sendMessage = (message: IWebSocketOutMessage) => {
        console.log('message Out: ', message);
        this.websocketConnection.send(JSON.stringify(message));
    }
















}

module.exports = WebSocketClient;
