"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
const TransferRegistry_1 = __importDefault(require("../../Transfer/TransferRegistry"));
const isName = (value) => typeof value === 'string' && value.trim().length > 0;
/**
 * one time ticket for dump download / import upload over HTTP
 * @author Mateusz Bochen
 */
class CreateTransferCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = (data) => {
            try {
                const transfer = data === null || data === void 0 ? void 0 : data.transfer;
                if (!(data === null || data === void 0 ? void 0 : data.tabId)) {
                    throw new Error('Transfer needs tab');
                }
                CreateTransferCommandHandler.validate(transfer);
                const ticket = TransferRegistry_1.default.create({
                    request: transfer,
                    driver: this.driver,
                    tabId: data.tabId,
                    notify: (message, payload) => this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, message, Object.assign(Object.assign({}, payload), { tabId: data.tabId }))),
                });
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.TRANSFER_TICKET, { tabId: data.tabId, ticket }));
            }
            catch (e) {
                this.sendError(e, data === null || data === void 0 ? void 0 : data.tabId);
            }
        };
    }
    static validate(transfer) {
        var _a;
        switch (transfer === null || transfer === void 0 ? void 0 : transfer.kind) {
            case 'dump':
                if (!isName((_a = transfer.options) === null || _a === void 0 ? void 0 : _a.database) || !Array.isArray(transfer.options.tables))
                    throw new Error('Database is required');
                if (!transfer.options.structure && !transfer.options.data)
                    throw new Error('Select structure or data');
                return;
            case 'import-sql':
                return;
            case 'import-csv': {
                const options = transfer.options;
                if (!isName(options === null || options === void 0 ? void 0 : options.database) || !isName(options.table))
                    throw new Error('Database and table are required');
                if (!Array.isArray(options.columns) || !options.columns.some((column) => isName(column)))
                    throw new Error('Select at least one target column');
                if (typeof options.delimiter !== 'string' || options.delimiter.length !== 1)
                    throw new Error('Delimiter must be one character');
                return;
            }
            default:
                throw new Error('Unknown transfer');
        }
    }
}
exports.default = CreateTransferCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ3JlYXRlVHJhbnNmZXJDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0NyZWF0ZVRyYW5zZmVyQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQUU5Qyx1RkFBK0Q7QUFJL0QsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFVLEVBQUUsRUFBRSxDQUFDLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztBQUVwRjs7O0dBR0c7QUFDSCxNQUFNLDRCQUE2QixTQUFRLGdDQUEwQztJQUFyRjs7UUFFRSxXQUFNLEdBQUcsQ0FBQyxJQUF3QixFQUFRLEVBQUU7WUFDMUMsSUFBSTtnQkFDRixNQUFNLFFBQVEsR0FBRyxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsUUFBUSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFBLEVBQUU7b0JBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztpQkFDdkM7Z0JBQ0QsNEJBQTRCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUVoRCxNQUFNLE1BQU0sR0FBRywwQkFBZ0IsQ0FBQyxNQUFNLENBQUM7b0JBQ3JDLE9BQU8sRUFBRSxRQUFRO29CQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07b0JBQ25CLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztvQkFDakIsTUFBTSxFQUFFLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxtQkFBUyxD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