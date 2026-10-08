"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const ReadOnlyGuard_1 = __importDefault(require("../../Driver/Query/ReadOnlyGuard"));
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
                if (ReadOnlyGuard_1.default.isReadOnly(this.command)) {
                    await session.setReadOnly().catch((e) => {
                        session.release();
                        throw e;
                    });
                }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQscUZBQTZEO0FBQzdELGlFQUF5QztBQUN6QyxzRUFBOEM7QUFTOUMsMEZBQXVGO0FBR3ZGOzs7O0dBSUc7QUFDSCxNQUFNLCtCQUFnQyxTQUFRLGdDQUFpRDtJQUEvRjs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQStCLEVBQWlCLEVBQUU7WUFDaEUsSUFBSSxPQUErQixDQUFDO1lBQ3BDLElBQUk7Z0JBQ0YscURBQXFEO2dCQUNyRCxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3hFLElBQUksdUJBQWEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUMxQyxNQUFNLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTt3QkFDdEMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUNsQixNQUFNLENBQUMsQ0FBQztvQkFDVixDQUFDLENBQUMsQ0FBQztpQkFDSjthQUNGO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM5QixPQUFPO2FBQ1I7WUFFRCxJQUFJO2dCQUNGLDRFQUE0RTtnQkFDNUUsTUFBTSxjQUFjLEdBQUcsSUFBSSw4QkFBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUks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