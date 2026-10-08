"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KillProcessCommandHandler = exports.GetProcessListCommandHandler = exports.CancelQueryCommandHandler = void 0;
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/** stop query running in tab (KILL QUERY of its session) */
class CancelQueryCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            try {
                const cancelled = (data === null || data === void 0 ? void 0 : data.tabId) ? await this.driver.cancel(data.tabId) : false;
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.QUERY_CANCELLED, { tabId: data === null || data === void 0 ? void 0 : data.tabId, cancelled }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.CancelQueryCommandHandler = CancelQueryCommandHandler;
/** SHOW FULL PROCESSLIST */
class GetProcessListCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            try {
                const processes = await this.driver.getProcessList();
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.PROCESSLIST, { tabId: data === null || data === void 0 ? void 0 : data.tabId, processes }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.GetProcessListCommandHandler = GetProcessListCommandHandler;
/** KILL QUERY / KILL CONNECTION of thread */
class KillProcessCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            try {
                await this.driver.killProcess(Number(data === null || data === void 0 ? void 0 : data.id), !!(data === null || data === void 0 ? void 0 : data.connection));
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.PROCESS_KILLED, {
                    tabId: data.tabId, id: data.id, connection: !!data.connection,
                }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
}
exports.KillProcessCommandHandler = KillProcessCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvY2Vzc0NvbW1hbmRIYW5kbGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL1Byb2Nlc3NDb21tYW5kSGFuZGxlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsc0ZBQThEO0FBQzlELGlFQUF5QztBQUN6QyxzRUFBOEM7QUFHOUMsNERBQTREO0FBQzVELE1BQWEseUJBQTBCLFNBQVEsZ0NBQXdDO0lBQXZGOztRQUNFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBc0IsRUFBaUIsRUFBRTtZQUN2RCxJQUFJO2dCQUNGLE1BQU0sU0FBUyxHQUFHLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssRUFBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFDN0UsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxtQkFBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxxQkFBVyxDQUFDLGVBQWUsRUFBRSxFQUFDLEtBQUssRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxFQUFFLFNBQVMsRUFBQyxDQUFDLENBQUMsQ0FBQzthQUNoSjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxLQUFLLENBQUMsQ0FBQzthQUNoQztRQUNILENBQUMsQ0FBQTtJQUNILENBQUM7Q0FBQTtBQVRELDhEQVNDO0FBRUQsNEJBQTRCO0FBQzVCLE1BQWEsNEJBQTZCLFNBQVEsZ0NBQXdDO0lBQTFGOztRQUNFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBc0IsRUFBaUIsRUFBRTtZQUN2RCxJQUFJO2dCQUNGLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDckQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQXVCLElBQUksbUJBQVMsQ0FDM0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsVUFBVSxFQUN0QyxxQkFBVyxDQUFDLFdBQVcsRUFDdkIsRUFBQyxLQUFLLEVBQUUsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssRUFBRSxTQUFTLEVBQUMsQ0FDaEMsQ0FBQyxDQUFDO2FBQ0o7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFDLENBQUM7YUFDaEM7UUFDSCxDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFiRCxvRUFhQztBQUVELDZDQUE2QztBQUM3QyxNQUFhLHlCQUEwQixTQUFRLGdDQUF5RTtJQUF4SDs7UUFDRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQXVELEVBQWlCLEVBQUU7WUFDeEYsSUFBSTtnQkFDRixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLFVBQVUsQ0FBQSxDQUFDLENBQUM7Z0JBQ3BFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUscUJBQVcsQ0FBQyxjQUFjLEVBQUU7b0JBQzFHLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7aUJBQzlELENBQUMsQ0FBQyxDQUFDO2FBQ0w7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFDLENBQUM7YUFDaEM7UUFDSCxDQUFDLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFYRCw4REFXQyJ9