
class WebSocketOutMessage {
    action;
    params = [];

    constructor(action, params) {
        this.action = action;
        this.params = params;
    }
}

export default WebSocketOutMessage;
