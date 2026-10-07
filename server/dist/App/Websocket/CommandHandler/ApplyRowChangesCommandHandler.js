"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * Builds sql for edited / inserted / deleted rows.
 * dryRun only returns sql for preview, otherwise all statements are executed in one transaction.
 * @author Mateusz Bochen
 */
class ApplyRowChangesCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a, _b;
            let statements;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.table) === null || _a === void 0 ? void 0 : _a.name) || !data.table.databaseName || !Array.isArray(data.changes) || !data.changes.length) {
                    throw new Error('Invalid row changes request');
                }
                statements = this.driver.buildRowChangeStatements(data.table, data.changes);
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
                return;
            }
            if (data.dryRun) {
                this.sendResult(MessageType_1.default.ROW_CHANGES_PREVIEW, data, statements, 0);
                return;
            }
            let session = null;
            try {
                session = await this.driver.openSession(((_b = data.database) === null || _b === void 0 ? void 0 : _b.name) || data.table.databaseName);
                const affectedRows = await session.executeInTransaction(statements);
                this.sendResult(MessageType_1.default.ROW_CHANGES_APPLIED, data, statements, affectedRows);
            }
            catch (e) {
                this.sendError(e, data.tabId);
            }
            finally {
                session === null || session === void 0 ? void 0 : session.release();
            }
        };
    }
    sendResult(message, data, statements, affectedRows) {
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, message, {
            tabId: data.tabId,
            statements: statements.map((statement) => statement.sql),
            affectedRows,
        }));
    }
}
exports.default = ApplyRowChangesCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwbHlSb3dDaGFuZ2VzQ29tbWFuZEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL1dlYnNvY2tldC9Db21tYW5kSGFuZGxlci9BcHBseVJvd0NoYW5nZXNDb21tYW5kSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHNGQUE4RDtBQUM5RCxpRUFBeUM7QUFDekMsc0VBQThDO0FBTTlDOzs7O0dBSUc7QUFDSCxNQUFNLDZCQUE4QixTQUFRLGdDQUF1RDtJQUFuRzs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQXFDLEVBQWlCLEVBQUU7O1lBQ3RFLElBQUksVUFBeUMsQ0FBQztZQUM5QyxJQUFJO2dCQUNGLElBQUksQ0FBQyxDQUFBLE1BQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssMENBQUUsSUFBSSxDQUFBLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7b0JBQzFHLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztpQkFDaEQ7Z0JBQ0QsVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDN0U7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQy9CLE9BQU87YUFDUjtZQUVELElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDZixJQUFJLENBQUMsVUFBVSxDQUFDLHFCQUFXLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDdEUsT0FBTzthQUNSO1lBRUQsSUFBSSxPQUFPLEdBQWtDLElBQUksQ0FBQztZQUNsRCxJQUFJO2dCQUNGLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxJQUFJLEtBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDeEYsTUFBTSxZQUFZLEdBQUcsTUFBTSxPQUFPLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3BFLElBQUksQ0FBQyxVQUFVLENBQUMscUJBQVcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO2FBQ2xGO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQy9CO29CQUFTO2dCQUNSLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxPQUFPLEVBQUUsQ0FBQzthQUNwQjtRQUNILENBQUMsQ0FBQTtJQWtCSCxDQUFDO0lBaEJTLFVBQVUsQ0FDaEIsT0FBb0IsRUFDcEIsSUFBcUMsRUFDckMsVUFBeUMsRUFDekMsWUFBb0I7UUFFcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQTRCLElBQUksbUJBQVMsQ0FDaEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxPQUFPLEVBQ1A7WUFDRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsVUFBVSxFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7WUFDeEQsWUFBWTtTQUNiLENBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBRUQsa0JBQWUsNkJBQTZCLENBQUMifQ==