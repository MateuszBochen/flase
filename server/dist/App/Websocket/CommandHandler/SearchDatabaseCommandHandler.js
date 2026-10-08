"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * search of value in all tables of database, results are sent table by table
 * @author Mateusz Bochen
 */
class SearchDatabaseCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.database) === null || _a === void 0 ? void 0 : _a.name) || typeof data.term !== 'string' || !data.term.length) {
                    throw new Error('Database and search term are required');
                }
                let tablesWithMatches = 0;
                const summary = await this.driver.searchDatabase(data.database.name, data.term, data.mode === 'exact' ? 'exact' : 'contains', (result) => {
                    tablesWithMatches++;
                    this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.DATABASE_SEARCH_RESULT, Object.assign(Object.assign({}, result), { tabId: data.tabId })));
                });
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.DATABASE_SEARCH_FINISHED, { tabId: data.tabId, tables: summary.tables, tablesWithMatches, warnings: summary.warnings }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.default = SearchDatabaseCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VhcmNoRGF0YWJhc2VDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL1NlYXJjaERhdGFiYXNlQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQU85Qzs7O0dBR0c7QUFDSCxNQUFNLDRCQUE2QixTQUFRLGdDQUFzRDtJQUFqRzs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQW9DLEVBQWlCLEVBQUU7O1lBQ3JFLElBQUk7Z0JBQ0YsSUFBSSxDQUFDLENBQUEsTUFBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsUUFBUSwwQ0FBRSxJQUFJLENBQUEsSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7b0JBQy9FLE1BQU0sSUFBSSxLQUFLLENBQUMsdUNBQXVDLENBQUMsQ0FBQztpQkFDMUQ7Z0JBQ0QsSUFBSSxpQkFBaUIsR0FBRyxDQUFDLENBQUM7Z0JBQzFCLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtvQkFDdkksaUJBQWlCLEVBQUUsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQWdDLElBQUksbUJBQVMsQ0FDcEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxxQkFBVyxDQUFDLHNCQUFzQixrQ0FDOUIsTUFBTSxLQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxJQUM5QixDQUFDLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQWtDLElBQUksbUJBQVMsQ0FDdEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxxQkFBVyxDQUFDLHdCQUF3QixFQUNwQyxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFDLENBQzNGLENBQUMsQ0FBQzthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQyxDQUFDO2FBQ2hDO1FBQ0gsQ0FBQyxDQUFBO0lBQ0gsQ0FBQztDQUFBO0FBRUQsa0JBQWUsNEJBQTRCLENBQUMifQ==