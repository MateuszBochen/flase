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
    constructor(databaseDriver, clientWebsocket, forceReadOnly = false) {
        this.lastCommand = '';
        this.lastCommandTimeStamp = 0;
        this.databaseDriver = databaseDriver;
        this.clientWebsocket = clientWebsocket;
        this.forceReadOnly = forceReadOnly;
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
            if (this.forceReadOnly) {
                // guard and read only database sessions read the flag from command
                command.connectionData = command.connectionData || {};
                command.connectionData.connection = Object.assign(Object.assign({}, (command.connectionData.connection || {})), { readOnly: true });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2Vic29ja2V0UmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L1dlYnNvY2tldFJlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxxRUFBNkM7QUFDN0MseUhBQWlHO0FBQ2pHLHdFQUFnRDtBQUNoRCxxSEFBNkY7QUFDN0YsdUhBQStGO0FBQy9GLG1IQUEyRjtBQUMzRix1SEFBK0Y7QUFDL0YsbUhBQTJGO0FBQzNGLGlIQUF5RjtBQUN6Rix1SEFBK0Y7QUFDL0YsaUhBQXlGO0FBQ3pGLG9GQUEySTtBQUMzSSxnRUFBd0M7QUFDeEMsa0ZBQTBEO0FBQzFELDhFQUFtSTtBQUNuSSxxRUFBNkM7QUFHN0MsTUFBTSxnQkFBZ0I7SUFZcEIsWUFBWSxjQUErQixFQUFFLGVBQTBCLEVBQUUsZ0JBQXlCLEtBQUs7UUFOL0YsZ0JBQVcsR0FBVyxFQUFFLENBQUM7UUFDekIseUJBQW9CLEdBQVcsQ0FBQyxDQUFDO1FBTXZDLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO0lBQ3JDLENBQUM7SUFFTSxTQUFTO1FBQ2QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN6QyxJQUFJLE9BQXlCLENBQUM7WUFDOUIsSUFBSTtnQkFDRixPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFxQixDQUFDO2FBQ3REO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZELE9BQU87YUFDUjtZQUVELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRTtnQkFDdEIsbUVBQW1F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