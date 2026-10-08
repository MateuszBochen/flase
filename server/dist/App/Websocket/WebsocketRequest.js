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
const ApplyRowChangesCommandHandler_1 = __importDefault(require("./CommandHandler/ApplyRowChangesCommandHandler"));
const GetTableStructureCommandHandler_1 = __importDefault(require("./CommandHandler/GetTableStructureCommandHandler"));
const ChangeStructureCommandHandler_1 = __importDefault(require("./CommandHandler/ChangeStructureCommandHandler"));
const SearchDatabaseCommandHandler_1 = __importDefault(require("./CommandHandler/SearchDatabaseCommandHandler"));
const ExecuteStatementsCommandHandler_1 = __importDefault(require("./CommandHandler/ExecuteStatementsCommandHandler"));
const CreateTransferCommandHandler_1 = __importDefault(require("./CommandHandler/CreateTransferCommandHandler"));
const ProcessCommandHandlers_1 = require("./CommandHandler/ProcessCommandHandlers");
const WsMessage_1 = __importDefault(require("./Dto/WsMessage"));
const MessageType_1 = __importDefault(require("./Enum/MessageType"));
class WebsocketRequest {
    constructor(databaseDriver, clientWebsocket) {
        this.lastCommand = '';
        this.lastCommandTimeStamp = 0;
        this.databaseDriver = databaseDriver;
        this.clientWebsocket = clientWebsocket;
    }
    procedure() {
        this.clientWebsocket.onmessage = (event) => {
            let command;
            try {
                command = JSON.parse(event.data);
            }
            catch (e) {
                console.error('Invalid websocket message', event.data);
                return;
            }
            if (this.isDuplicate(event.data)) {
                console.log(`Command ${command.command} skipped - duplicate`);
                return;
            }
            try {
                this.resolveCommand(command);
            }
            catch (e) {
                this.sendError(command, e);
            }
        };
    }
    isDuplicate(rawCommand) {
        const now = Date.now();
        const isDuplicate = rawCommand === this.lastCommand
            && now - this.lastCommandTimeStamp < WebsocketRequest.DUPLICATE_COMMAND_WINDOW_MS;
        this.lastCommand = rawCommand;
        this.lastCommandTimeStamp = now;
        return isDuplicate;
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
            case CommandType_1.default.APPLY_ROW_CHANGES:
                new ApplyRowChangesCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.GET_TABLE_STRUCTURE:
                new GetTableStructureCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.CHANGE_STRUCTURE:
                new ChangeStructureCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.SEARCH_DATABASE:
                new SearchDatabaseCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.EXECUTE_STATEMENTS:
                new ExecuteStatementsCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.CANCEL_QUERY:
                new ProcessCommandHandlers_1.CancelQueryCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.GET_PROCESSLIST:
                new ProcessCommandHandlers_1.GetProcessListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.KILL_PROCESS:
                new ProcessCommandHandlers_1.KillProcessCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.CREATE_TRANSFER:
                new CreateTransferCommandHandler_1.default(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            default:
                throw new Error(`Command ${command.command} not supported`);
        }
    }
    sendError(command, error) {
        var _a, _b;
        console.error(error);
        new ClientWebSocket_1.default(this.clientWebsocket).send(new WsMessage_1.default((_a = command.connectionData) === null || _a === void 0 ? void 0 : _a.connection, MessageType_1.default.QUERY_ERROR, {
            command: command.command,
            error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
            tabId: (_b = command.payload) === null || _b === void 0 ? void 0 : _b.tabId,
        }));
    }
}
/** same command sent again in this time is skipped (react strict mode runs effects twice) */
WebsocketRequest.DUPLICATE_COMMAND_WINDOW_MS = 500;
exports.default = WebsocketRequest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUNoRCxxSEFBNkY7QUFDN0YsdUhBQStGO0FBQy9GLG1IQUEyRjtBQUMzRix1SEFBK0Y7QUFDL0YsbUhBQTJGO0FBQzNGLGlIQUF5RjtBQUN6Rix1SEFBK0Y7QUFDL0YsaUhBQXlGO0FBQ3pGLG9GQUEySTtBQUMzSSxnRUFBd0M7QUFDeEMscUVBQTZDO0FBRzdDLE1BQU0sZ0JBQWdCO0lBU3BCLFlBQVksY0FBK0IsRUFBRSxlQUEwQjtRQUgvRCxnQkFBVyxHQUFXLEVBQUUsQ0FBQztRQUN6Qix5QkFBb0IsR0FBVyxDQUFDLENBQUM7UUFHdkMsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7SUFDekMsQ0FBQztJQUVNLFNBQVM7UUFDZCxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3pDLElBQUksT0FBeUIsQ0FBQztZQUM5QixJQUFJO2dCQUNGLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQXFCLENBQUM7YUFDdEQ7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkQsT0FBTzthQUNSO1lBRUQsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDaEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLE9BQU8sQ0FBQyxPQUFPLHNCQUFzQixDQUFDLENBQUM7Z0JBQzlELE9BQU87YUFDUjtZQUVELElBQUk7Z0JBQ0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUM5QjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2FBQzVCO1FBQ0gsQ0FBQyxDQUFBO0lBQ0gsQ0FBQztJQUVPLFdBQVcsQ0FBQyxVQUFrQjtRQUNwQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdkIsTUFBTSxXQUFXLEdBQUcsVUFBVSxLQUFLLElBQUksQ0FBQyxXQUFXO2VBQzlDLEdBQUcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsZ0JBQWdCLENBQUMsMkJBQTJCLENBQUM7UUFFcEYsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7UUFDOUIsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztRQUNoQyxPQUFPLFdBQVcsQ0FBQztJQUNyQixDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQXdCO1FBQzdDLE1BQU0sZUFBZSxHQUFHLElBQUkseUJBQWUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEUsUUFBUSxPQUFPLENBQUMsT0FBTyxFQUFFO1lBQ3ZCLEtBQUsscUJBQVcsQ0FBQyxvQkFBb0I7Z0JBQ25DLElBQUksMENBQWdDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDNUcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxrQkFBa0I7Z0JBQ2pDLElBQUksd0NBQThCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxpQkFBaUI7Z0JBQ2hDLElBQUkseUNBQStCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDM0csT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxpQkFBaUI7Z0JBQ2hDLElBQUksdUNBQTZCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDekcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxtQkFBbUI7Z0JBQ2xDLElBQUkseUNBQStCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDM0csT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxnQkFBZ0I7Z0JBQy9CLElBQUksdUNBQTZCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDekcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxlQUFlO2dCQUM5QixJQUFJLHNDQUE0QixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3hHLE9BQU87WUFDVCxLQUFLLHFCQUFXLENBQUMsa0JBQWtCO2dCQUNqQyxJQUFJLHlDQUErQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzNHLE9BQU87WUFDVCxLQUFLLHFCQUFXLENBQUMsWUFBWTtnQkFDM0IsSUFBSSxrREFBeUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRyxPQUFPO1lBQ1QsS0FBSyxxQkFBVyxDQUFDLGVBQWU7Z0JBQzlCLElBQUkscURBQTRCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDeEcsT0FBTztZQUNULEtBQUsscUJBQVcsQ0FBQyxZQUFZO2dCQUMzQixJQUFJLGtEQUF5QixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3JHLE9BQU87WUFDVCxLQUFLLHFCQUFXLENBQUMsZUFBZTtnQkFDOUIsSUFBSSxzQ0FBNEIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4RyxPQUFPO1lBQ1Q7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLE9BQU8sQ0FBQyxPQUFPLGdCQUFnQixDQUFDLENBQUM7U0FDL0Q7SUFDSCxDQUFDO0lBRU8sU0FBUyxDQUFDLE9BQXlCLEVBQUUsS0FBVTs7UUFDckQsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixJQUFJLHlCQUFlLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBc0IsSUFBSSxtQkFBUyxDQUMvRSxNQUFBLE9BQU8sQ0FBQyxjQUFjLDBDQUFFLFVBQVUsRUFDbEMscUJBQVcsQ0FBQyxXQUFXLEVBQ3ZCO1lBQ0UsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPO1lBQ3hCLEtBQUssRUFBRSxDQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLEtBQUksTUFBTSxDQUFDLEtBQUssQ0FBQztZQUN0QyxLQUFLLEVBQUUsTUFBQSxPQUFPLENBQUMsT0FBTywwQ0FBRSxLQUFLO1NBQzlCLENBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUFyR0QsNkZBQTZGO0FBQ3JFLDRDQUEyQixHQUFHLEdBQUcsQ0FBQztBQXVHNUQsa0JBQWUsZ0JBQWdCLENBQUMifQ==