"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * ALTER / TRUNCATE / DROP / RENAME / COPY of table.
 * dryRun only returns sql for preview - client always shows it before execution.
 * @author Mateusz Bochen
 */
class ChangeStructureCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a, _b;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.table) === null || _a === void 0 ? void 0 : _a.databaseName) || !data.table.name || !((_b = data.change) === null || _b === void 0 ? void 0 : _b.kind)) {
                    throw new Error('Invalid structure change request');
                }
                const statements = await this.driver.buildStructureChangeStatements(data.table, data.change);
                if (!data.dryRun) {
                    await this.driver.executeStatements(statements);
                }
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, data.dryRun ? MessageType_1.default.STRUCTURE_CHANGE_PREVIEW : MessageType_1.default.STRUCTURE_CHANGE_APPLIED, { tabId: data.tabId, kind: data.change.kind, statements }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.default = ChangeStructureCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hhbmdlU3RydWN0dXJlQ29tbWFuZEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL1dlYnNvY2tldC9Db21tYW5kSGFuZGxlci9DaGFuZ2VTdHJ1Y3R1cmVDb21tYW5kSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHNGQUE4RDtBQUM5RCxpRUFBeUM7QUFDekMsc0VBQThDO0FBSTlDOzs7O0dBSUc7QUFDSCxNQUFNLDZCQUE4QixTQUFRLGdDQUF1RDtJQUFuRzs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQXFDLEVBQWlCLEVBQUU7O1lBQ3RFLElBQUk7Z0JBQ0YsSUFBSSxDQUFDLENBQUEsTUFBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSywwQ0FBRSxZQUFZLENBQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxNQUFNLDBDQUFFLElBQUksQ0FBQSxFQUFFO29CQUN4RSxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7aUJBQ3JEO2dCQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFN0YsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7b0JBQ2hCLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztpQkFDakQ7Z0JBRUQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQWlDLElBQUksbUJBQVMsQ0FDckUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxxQkFBVyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxxQkFBVyxDQUFDLHdCQUF3QixFQUN6RixFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUMsQ0FDeEQsQ0FBQyxDQUFDO2FBQ0o7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFDLENBQUM7YUFDaEM7UUFDSCxDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFFRCxrQkFBZSw2QkFBNkIsQ0FBQyJ9