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
const ReadOnlyGuard_1 = __importDefault(require("../Driver/Query/ReadOnlyGuard"));
const UserCommandHandlers_1 = require("./CommandHandler/UserCommandHandlers");
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
        const refused = ReadOnlyGuard_1.default.refuseCommand(command);
        if (refused) {
            throw new Error(refused);
        }
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
            case CommandType_1.default.GET_USERS:
                new UserCommandHandlers_1.GetUsersCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.GET_USER_GRANTS:
                new UserCommandHandlers_1.GetUserGrantsCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
                return;
            case CommandType_1.default.CHANGE_USER:
                new UserCommandHandlers_1.ChangeUserCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUNoRCxxSEFBNkY7QUFDN0YsdUhBQStGO0FBQy9GLG1IQUEyRjtBQUMzRix1SEFBK0Y7QUFDL0YsbUhBQTJGO0FBQzNGLGlIQUF5RjtBQUN6Rix1SEFBK0Y7QUFDL0YsaUhBQXlGO0FBQ3pGLG9GQUEySTtBQUMzSSxnRUFBd0M7QUFDeEMsa0ZBQTBEO0FBQzFELDhFQUFtSTtBQUNuSSxxRUFBNkM7QUFHN0MsTUFBTSxnQkFBZ0I7SUFTcEIsWUFBWSxjQUErQixFQUFFLGVBQTBCO1FBSC9ELGdCQUFXLEdBQVcsRUFBRSxDQUFDO1FBQ3pCLHlCQUFvQixHQUFXLENBQUMsQ0FBQztRQUd2QyxJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztJQUN6QyxDQUFDO0lBRU0sU0FBUztRQUNkLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxHQUFHLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDekMsSUFBSSxPQUF5QixDQUFDO1lBQzlCLElBQUk7Z0JBQ0YsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBcUIsQ0FBQzthQUN0RDtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN2RCxPQUFPO2FBQ1I7WUFFRCxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNoQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsT0FBTyxDQUFD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