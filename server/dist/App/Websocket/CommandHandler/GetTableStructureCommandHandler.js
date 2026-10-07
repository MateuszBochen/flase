"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * structure of table for "Structure" view
 * @author Mateusz Bochen
 */
class GetTableStructureCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.table) === null || _a === void 0 ? void 0 : _a.databaseName) || !data.table.name) {
                    throw new Error('Invalid table structure request');
                }
                const structure = await this.driver.getTableStructure(data.table);
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.TABLE_STRUCTURE, Object.assign(Object.assign({}, structure), { tabId: data.tabId })));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.default = GetTableStructureCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2V0VGFibGVTdHJ1Y3R1cmVDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0dldFRhYmxlU3RydWN0dXJlQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQUk5Qzs7O0dBR0c7QUFDSCxNQUFNLCtCQUFnQyxTQUFRLGdDQUFzRDtJQUFwRzs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQW9DLEVBQWlCLEVBQUU7O1lBQ3JFLElBQUk7Z0JBQ0YsSUFBSSxDQUFDLENBQUEsTUFBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSywwQ0FBRSxZQUFZLENBQUEsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO29CQUNsRCxNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7aUJBQ3BEO2dCQUNELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2xFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUEwQixJQUFJLG1CQUFTLENBQzlELElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFDdEMscUJBQVcsQ0FBQyxlQUFlLGtDQUN2QixTQUFTLEtBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLElBQ2pDLENBQUMsQ0FBQzthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQyxDQUFDO2FBQ2hDO1FBQ0gsQ0FBQyxDQUFBO0lBQ0gsQ0FBQztDQUFBO0FBRUQsa0JBQWUsK0JBQStCLENBQUMifQ==