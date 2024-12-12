"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const CommandType_1 = __importDefault(require("./Enum/CommandType"));
const ReloadDatabaseListCommandHandler_1 = __importDefault(require("./CommandHandler/ReloadDatabaseListCommandHandler"));
const ClientWebSocket_1 = __importDefault(require("./ClientWebSocket"));
const ReloadTablesListCommandHandler_1 = __importDefault(require("./CommandHandler/ReloadTablesListCommandHandler"));
const HandleSelectQueryRequestHandler_1 = __importDefault(require("./CommandHandler/HandleSelectQueryRequestHandler"));
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
            case CommandType_1.default.SEND_SELECT_QUERY:
                new HandleSelectQueryRequestHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            default:
                console.log(`Command ${command.command} not supported`);
        }
    }
}
exports.default = WebsocketRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUNoRCxxSEFBNkY7QUFDN0YsdUhBQStGO0FBRS9GLE1BQU0sZ0JBQWdCO0lBR3BCLFlBQVksY0FBK0IsRUFBRSxlQUEwQjtRQUNyRSxJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztJQUN6QyxDQUFDO0lBRU0sU0FBUztRQUNkLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxHQUFHLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDekMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFxQixDQUFDO1lBQzNELElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0IsQ0FBQyxDQUFBO0lBQ0gsQ0FBQztJQUVPLGNBQWMsQ0FBQyxPQUF3QjtRQUM3QyxNQUFNLGVBQWUsR0FBRyxJQUFJLHlCQUFlLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLFFBQVEsT0FBTyxDQUFDLE9BQU8sRUFBRTtZQUN2QixLQUFLLHFCQUFXLENBQUMsb0JBQW9CO2dCQUNuQyxJQUFJLDBDQUFnQyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzVHLE9BQU87WUFDVCxLQUFLLHFCQUFXLENBQUMsa0JBQWtCO2dCQUNqQyxJQUFJLHdDQUE4QixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzFHLE9BQU87WUFDVCxLQUFLLHFCQUFXLENBQUMsaUJBQWlCO2dCQUNoQyxJQUFJLHlDQUErQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzNHLE9BQU87WUFDVDtnQkFDRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsT0FBTyxDQUFDLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztTQUMzRDtJQUNILENBQUM7Q0FDRjtBQUVELGtCQUFlLGdCQUFnQixDQUFDIn0=