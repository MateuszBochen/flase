
export interface IWebSocketInMessage {
    action: string;
    params: any;
}


class WebSocketInMessage implements IWebSocketInMessage {
    action;
    params = [];

    constructor(action:string, params:any) {
        this.action = action;
        this.params = params;
    }
}

module.exports = WebSocketInMessage;


