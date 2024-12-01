"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const CommandType_1 = __importDefault(require("./Enum/CommandType"));
const ReloadDatabaseListCommandHandler_1 = __importDefault(require("./CommandHandler/ReloadDatabaseListCommandHandler"));
const ClientWebSocket_1 = __importDefault(require("./ClientWebSocket"));
class WebsocketRequest {
    constructor(databaseDriver, clientWebsocket) {
        this.databaseDriver = databaseDriver;
        this.clientWebsocket = clientWebsocket;
    }
    procedure() {
        this.clientWebsocket.onmessage = (event) => {
            const command = JSON.parse(event.data);
            this.resolveCommand(command);
        };
    }
    resolveCommand(command) {
        const clientWebsocket = new ClientWebSocket_1.default(this.clientWebsocket);
        switch (command.command) {
            case CommandType_1.default.RELOAD_DATABASE_LIST:
                new ReloadDatabaseListCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            default:
                console.log(`Command ${command.command} not supported`);
        }
    }
}
exports.default = WebsocketRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUVoRCxNQUFNLGdCQUFnQjtJQUdwQixZQUFZLGNBQStCLEVBQUUsZUFBMEI7UUFDckUsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7SUFDekMsQ0FBQztJQUVNLFNBQVM7UUFDZCxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3pDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBcUIsQ0FBQztZQUMzRCxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQTtJQUNILENBQUM7SUFFTyxjQUFjLENBQUMsT0FBd0I7UUFDN0MsTUFBTSxlQUFlLEdBQUcsSUFBSSx5QkFBZSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsRSxRQUFRLE9BQU8sQ0FBQyxPQUFPLEVBQUU7WUFDdkIsS0FBSyxxQkFBVyxDQUFDLG9CQUFvQjtnQkFDbkMsSUFBSSwwQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM1RyxPQUFPO1lBQ1Q7Z0JBQ0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLE9BQU8sQ0FBQyxPQUFPLGdCQUFnQixDQUFDLENBQUM7U0FDM0Q7SUFDSCxDQUFDO0NBQ0Y7QUFFRCxrQkFBZSxnQkFBZ0IsQ0FBQyJ9