"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeUserCommandHandler = exports.GetUserGrantsCommandHandler = exports.GetUsersCommandHandler = void 0;
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/** list of accounts with privilege levels which can be granted */
class GetUsersCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            try {
                const users = this.driver.users();
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.USERS, {
                    tabId: data === null || data === void 0 ? void 0 : data.tabId,
                    users: await users.getUsers(),
                    privilegeLevels: users.getPrivilegeLevels(),
                }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.GetUsersCommandHandler = GetUsersCommandHandler;
/** GRANT statements of one account */
class GetUserGrantsCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.name)) {
                    throw new Error('User is required');
                }
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.USER_GRANTS, {
                    tabId: data.tabId,
                    user: data.user,
                    grants: await this.driver.users().getGrants(data.user),
                }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.GetUserGrantsCommandHandler = GetUserGrantsCommandHandler;
/**
 * CREATE / DROP / password / GRANT / REVOKE.
 * dryRun returns sql for preview (passwords are hidden) - client always shows it before execution.
 */
class ChangeUserCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a;
            try {
                if (!((_a = data === null || data === void 0 ? void 0 : data.change) === null || _a === void 0 ? void 0 : _a.kind)) {
                    throw new Error('Invalid user change request');
                }
                const statements = await this.driver.users().buildChange(data.user, data.change);
                if (!data.dryRun) {
                    await this.driver.executeStatements(statements.map((statement) => statement.sql));
                }
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, data.dryRun ? MessageType_1.default.USER_CHANGE_PREVIEW : MessageType_1.default.USER_CHANGE_APPLIED, { tabId: data.tabId, kind: data.change.kind, statements: statements.map((statement) => statement.display) }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.ChangeUserCommandHandler = ChangeUserCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXNlckNvbW1hbmRIYW5kbGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL1VzZXJDb21tYW5kSGFuZGxlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsc0ZBQThEO0FBQzlELGlFQUF5QztBQUN6QyxzRUFBOEM7QUFHOUMsa0VBQWtFO0FBQ2xFLE1BQWEsc0JBQXVCLFNBQVEsZ0NBQTZDO0lBQXpGOztRQUNFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBMkIsRUFBaUIsRUFBRTtZQUM1RCxJQUFJO2dCQUNGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUscUJBQVcsQ0FBQyxLQUFLLEVBQUU7b0JBQ2pHLEtBQUssRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSztvQkFDbEIsS0FBSyxFQUFFLE1BQU0sS0FBSyxDQUFDLFFBQVEsRUFBRTtvQkFDN0IsZUFBZSxFQUFFLEtBQUssQ0FBQyxrQkFBa0IsRUFBRTtpQkFDNUMsQ0FBQyxDQUFDLENBQUM7YUFDTDtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxLQUFLLENBQUMsQ0FBQzthQUNoQztRQUNILENBQUMsQ0FBQTtJQUNILENBQUM7Q0FBQTtBQWJELHdEQWFDO0FBRUQsc0NBQXNDO0FBQ3RDLE1BQWEsMkJBQTRCLFNBQVEsZ0NBQWtEO0lBQW5HOztRQUNFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBZ0MsRUFBaUIsRUFBRTs7WUFDakUsSUFBSTtnQkFDRixJQUFJLENBQUMsQ0FBQSxNQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLDBDQUFFLElBQUksQ0FBQSxFQUFFO29CQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7aUJBQ3JDO2dCQUNELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUscUJBQVcsQ0FBQyxXQUFXLEVBQUU7b0JBQ3ZHLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztvQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7aUJBQ3ZELENBQUMsQ0FBQyxDQUFDO2FBQ0w7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFDLENBQUM7YUFDaEM7UUFDSCxDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFmRCxrRUFlQztBQUVEOzs7R0FHRztBQUNILE1BQWEsd0JBQXlCLFNBQVEsZ0NBQWtEO0lBQWhHOztRQUNFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBZ0MsRUFBaUIsRUFBRTs7WUFDakUsSUFBSTtnQkFDRixJQUFJLENBQUMsQ0FBQSxNQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxNQUFNLDBDQUFFLElBQUksQ0FBQSxFQUFFO29CQUN2QixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7aUJBQ2hEO2dCQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2pGLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFO29CQUNoQixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7aUJBQ25GO2dCQUNELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQVMsQ0FDckMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxxQkFBVyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxxQkFBVyxDQUFDLG1CQUFtQixFQUMvRSxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFDLENBQzFHLENBQUMsQ0FBQzthQUNKO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQyxDQUFDO2FBQ2hDO1FBQ0gsQ0FBQyxDQUFBO0lBQ0gsQ0FBQztDQUFBO0FBbkJELDREQW1CQyJ9