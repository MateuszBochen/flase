export interface IWebSocketOutMessage {
    action: string;
    code: string;
    error: string;
    data: any;
}


class WebSocketOutMessage implements IWebSocketOutMessage{
    action;
    code;
    error;
    data;


    constructor(action:string, code:string, error:string, data:any) {
        this.action = action;
        this.code = code;
        this.error = error;
        this.data = data;
    }
}

module.exports = WebSocketOutMessage;
