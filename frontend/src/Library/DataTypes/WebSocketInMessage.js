
class WebSocketInMessage {
    action;
    code;
    error;
    data;


    constructor(action, code, error, data) {
        this.action = action;
        this.code = code;
        this.error = error;
        this.data = data;
    }
}

export default WebSocketInMessage;
