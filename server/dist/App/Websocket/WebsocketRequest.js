"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const CommandType_1 = __importDefault(require("./Enum/CommandType"));
const ReloadDatabaseListCommandHandler_1 = __importDefault(require("./CommandHandler/ReloadDatabaseListCommandHandler"));
const ClientWebSocket_1 = __importDefault(require("./ClientWebSocket"));
const ReloadTablesListCommandHandler_1 = __importDefault(require("./CommandHandler/ReloadTablesListCommandHandler"));
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
            case CommandType_1.default.RELOAD_TABLES_LIST:
                new ReloadTablesListCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            default:
                console.log(`Command ${command.command} not supported`);
        }
    }
}
exports.default = WebsocketRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUNoRCxxSEFBNkY7QUFHN0YsTUFBTSxnQkFBZ0I7SUFHcEIsWUFBWSxjQUErQixFQUFFLGVBQTBCO1FBQ3JFLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO0lBQ3pDLENBQUM7SUFFTSxTQUFTO1FBQ2QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN6QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQXFCLENBQUM7WUFDM0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUE7SUFDSCxDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQXdCO1FBQzdDLE1BQU0sZUFBZSxHQUFHLElBQUkseUJBQWUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEUsUUFBUSxPQUFPLENBQUMsT0FBTyxFQUFFO1lBQ3ZCLEtBQUsscUJBQVcsQ0FBQyxvQkFBb0I7Z0JBQ25DLElBQUksMENBQWdDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDNUcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxrQkFBa0I7Z0JBQ2pDLElBQUksd0NBQThCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUcsT0FBTztZQUVUO2dCQUNFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxPQUFPLENBQUMsT0FBTyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQzNEO0lBQ0gsQ0FBQztDQUNGO0FBRUQsa0JBQWUsZ0JBQWdCLENBQUMifQ==