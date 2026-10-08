"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
class AbstractCommandHandler {
    constructor(driver, clientWebsocket, command) {
        this.driver = driver;
        this.clientWebsocket = clientWebsocket;
        this.command = command;
    }
    /** inform client that command failed */
    sendError(error, tabId) {
        console.error(this.constructor.name, error);
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.QUERY_ERROR, {
            command: this.command.command,
            error: AbstractCommandHandler.errorToString(error),
            tabId,
        }));
    }
    /** mysql errors have sqlMessage, postgres errors detail and hint, parser errors message, rejects may be plain strings */
    static errorToString(error) {
        if (!error) {
            return 'Unknown error';
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error.sqlMessage) {
            return error.sqlMessage;
        }
        const message = error.message || String(error);
        return [message, error.detail, error.hint && `Hint: ${error.hint}`].filter(Boolean).join('. ');
    }
}
exports.default = AbstractCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQWJzdHJhY3RDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0Fic3RyYWN0Q29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHQSxpRUFBeUM7QUFDekMsc0VBQThDO0FBRzlDLE1BQWUsc0JBQXNCO0lBS25DLFlBQVksTUFBdUIsRUFBRSxlQUFnQyxFQUFFLE9BQXlCO1FBQzlGLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3pCLENBQUM7SUFJRCx3Q0FBd0M7SUFDOUIsU0FBUyxDQUFDLEtBQVUsRUFBRSxLQUFjO1FBQzVDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQXNCLElBQUksbUJBQVMsQ0FDMUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxxQkFBVyxDQUFDLFdBQVcsRUFDdkI7WUFDRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO1lBQzdCLEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDO1lBQ2xELEtBQUs7U0FDTixDQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCx5SEFBeUg7SUFDbEgsTUFBTSxDQUFDLGFBQWEsQ0FBQyxLQUFVO1FBQ3BDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDVixPQUFPLGVBQWUsQ0FBQztTQUN4QjtRQUNELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFO1lBQzdCLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7UUFDRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUU7WUFDcEIsT0FBTyxLQUFLLENBQUMsVUFBVSxDQUFDO1NBQ3pCO1FBQ0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksU0FBUyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pHLENBQUM7Q0FDRjtBQUVELGtCQUFlLHNCQUFzQixDQUFDIn0=