"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
class ReloadTablesListCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = (data) => {
            this.driver.getListOfTablesInDatabase(data.name).subscribe((table) => {
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.TABLE_BASE_ITEM, table));
            });
        };
    }
}
exports.default = ReloadTablesListCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVsb2FkVGFibGVzTGlzdENvbW1hbmRIYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FwcC9XZWJzb2NrZXQvQ29tbWFuZEhhbmRsZXIvUmVsb2FkVGFibGVzTGlzdENvbW1hbmRIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsc0ZBQThEO0FBRTlELGlFQUF5QztBQUN6QyxzRUFBOEM7QUFHOUMsTUFBTSw4QkFBK0IsU0FBUSxnQ0FBeUM7SUFBdEY7O1FBRUUsV0FBTSxHQUFHLENBQUMsSUFBdUIsRUFBUSxFQUFFO1lBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO2dCQUNuRSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBNEIsSUFBSSxtQkFBUyxDQUNoRSxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQ3RDLHFCQUFXLENBQUMsZUFBZSxFQUMzQixLQUFLLENBQ04sQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFFRCxrQkFBZSw4QkFBOEIsQ0FBQyJ9