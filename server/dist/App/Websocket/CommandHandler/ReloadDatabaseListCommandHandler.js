"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
class ReloadDatabaseListCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = (data) => {
            this.driver.getListOfDatabases().subscribe((databaseItem) => {
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.DATA_BASE_ITEM, databaseItem));
            });
            console.log('handled');
        };
    }
}
exports.default = ReloadDatabaseListCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVsb2FkRGF0YWJhc2VMaXN0Q29tbWFuZEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL1dlYnNvY2tldC9Db21tYW5kSGFuZGxlci9SZWxvYWREYXRhYmFzZUxpc3RDb21tYW5kSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHNGQUE4RDtBQUU5RCxpRUFBeUM7QUFDekMsc0VBQThDO0FBRzlDLE1BQU0sZ0NBQWlDLFNBQVEsZ0NBQTRCO0lBQTNFOztRQUNFLFdBQU0sR0FBRyxDQUFDLElBQVUsRUFBUSxFQUFFO1lBQzVCLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxZQUFzQixFQUFFLEVBQUU7Z0JBQ3BFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFXLElBQUksbUJBQVMsQ0FDL0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxxQkFBVyxDQUFDLGNBQWMsRUFDMUIsWUFBWSxDQUNiLENBQUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFFRCxrQkFBZSxnQ0FBZ0MsQ0FBQyJ9