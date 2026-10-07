"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * command handler for select query request
 * Message order for client: columns -> total count -> records -> finished (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            let session;
            try {
                session = await this.driver.openSession(data.database.name);
            }
            catch (e) {
                this.sendError(e, data.tabId);
                return;
            }
            try {
                // columns from table metadata (primary keys, references), if query is simple enough to know tables
                const columnsWereSent = await this.sendColumnsFromSelect(data);
                // count is queued on the same connection before select, so it does not slow down rows
                const counting = this.countRecords(session, data);
                const rows = await this.streamQueries(session, data, columnsWereSent);
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
        this.streamQueries = (session, data, columnsWereSent) => {
            let rows = 0;
            // fallback when columns are not known from table metadata, e.g. SELECT 1, SHOW ..., functions
            const onFields = columnsWereSent ? undefined : (fieldNames) => {
                this.sendColumns(data, fieldNames.map((name) => HandleSelectQueryRequestHandler.simpleColumn(name)));
            };
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
        /** resolves true when columns were sent */
        this.sendColumnsFromSelect = async (data) => {
            try {
                const selectFromTypes = this.driver.getSelectFromTypeFromQuery(data.query);
                if (!selectFromTypes.length) {
                    return false;
                }
                const columnsOfTables = await Promise.all(selectFromTypes.map((selectFromType) => {
                    return this.driver.getColumnsOfTable(selectFromType.db || data.database.name, selectFromType);
                }));
                this.sendColumns(data, columnsOfTables.flat());
                return true;
            }
            catch (e) {
                // not parsable by sql parser or derived table - columns will be taken from result fields
                console.warn(HandleSelectQueryRequestHandler.name, 'sendColumnsFromSelect', AbstractCommandHandler_1.default.errorToString(e));
                return false;
            }
        };
    }
    sendColumns(data, columns) {
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_COLUMN, {
            tabId: data.tabId,
            columns,
        }));
    }
    static simpleColumn(name) {
        return {
            table: { databaseName: '', name: '', alias: '' },
            autoIncrement: false,
            defaultValue: null,
            name,
            nullable: true,
            primaryKey: false,
        };
    }
}
exports.default = HandleSelectQueryRequestHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVU5Qzs7OztHQUlHO0FBQ0gsTUFBTSwrQkFBZ0MsU0FBUSxnQ0FBaUQ7SUFBL0Y7O1FBRUUsV0FBTSxHQUFHLEtBQUssRUFBRSxJQUErQixFQUFpQixFQUFFO1lBQ2hFLElBQUksT0FBK0IsQ0FBQztZQUNwQyxJQUFJO2dCQUNGLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDN0Q7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzlCLE9BQU87YUFDUjtZQUVELElBQUk7Z0JBQ0YsbUdBQW1HO2dCQUNuRyxNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFL0Qsc0ZBQXNGO2dCQUN0RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7Z0JBQ3RFLE1BQU0sUUFBUSxDQUFDO2dCQUVmLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUF5QixJQUFJLG1CQUFTLENBQzdELElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxD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