"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
const ResultColumnsBuilder_1 = __importDefault(require("../Result/ResultColumnsBuilder"));
/**
 * command handler for select query request
 * Message order for client: total count -> columns -> records -> finished (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            let session;
            try {
                // registered by tab - running query can be cancelled
                session = await this.driver.openSession(data.database.name, data.tabId);
            }
            catch (e) {
                this.sendError(e, data.tabId);
                return;
            }
            try {
                // table structure (types, primary keys, references) of tables used in query
                const columnsBuilder = new ResultColumnsBuilder_1.default(this.driver, data.database.name, data.query);
                await columnsBuilder.loadMetadata();
                // count is queued on the same connection before select, so it does not slow down rows
                const counting = this.countRecords(session, data);
                const rows = await this.streamQueries(session, data, columnsBuilder);
                await counting;
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.QUERY_FINISHED, { tabId: data.tabId, rows }));
            }
            catch (e) {
                this.sendError(e, data.tabId);
            }
            finally {
                session.release();
            }
        };
        /** count failure is not fatal - the select itself reports the sql error */
        this.countRecords = (session, data) => {
            return session.countRecords(data.query).then((totalCountDto) => {
                this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SELECT_TOTAL_COUNT, {
                    tabId: data.tabId,
                    totalCount: totalCountDto.totalCount,
                }));
            }).catch((e) => {
                console.warn(HandleSelectQueryRequestHandler.name, 'countRecords', AbstractCommandHandler_1.default.errorToString(e));
            });
        };
        /** resolves with number of sent rows */
        this.streamQueries = (session, data, columnsBuilder) => {
            let rows = 0;
            // columns are sent when the result description arrives, so they match the result exactly
            const onFields = (fields) => this.sendColumns(data, columnsBuilder.build(fields));
            return new Promise((resolve, reject) => {
                session.streamSelect(data.query, onFields).subscribe({
                    next: (rowItem) => {
                        rows++;
                        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_RECORD, {
                            tabId: data.tabId,
                            rowDataValue: rowItem.row,
                        }));
                    },
                    error: reject,
                    complete: () => resolve(rows),
                });
            });
        };
    }
    sendColumns(data, result) {
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_COLUMN, Object.assign({ tabId: data.tabId }, result)));
    }
}
exports.default = HandleSelectQueryRequestHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVM5QywwRkFBdUY7QUFHdkY7Ozs7R0FJRztBQUNILE1BQU0sK0JBQWdDLFNBQVEsZ0NBQWlEO0lBQS9GOztRQUVFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBK0IsRUFBaUIsRUFBRTtZQUNoRSxJQUFJLE9BQStCLENBQUM7WUFDcEMsSUFBSTtnQkFDRixxREFBcUQ7Z0JBQ3JELE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN6RTtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUIsT0FBTzthQUNSO1lBRUQsSUFBSTtnQkFDRiw0RUFBNEU7Z0JBQzVFLE1BQU0sY0FBYyxHQUFHLElBQUksOEJBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzdGLE1BQU0sY0FBYyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUVwQyxzRkFBc0Y7Z0JBQ3RGLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNsRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsT0FB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