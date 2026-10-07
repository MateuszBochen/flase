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
 * Message order for client: total count -> columns -> records -> finished (or error at any point)
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
                // table structure (types, primary keys, references) of tables used in query
                const metadata = await this.loadTablesMetadata(data);
                // count is queued on the same connection before select, so it does not slow down rows
                const counting = this.countRecords(session, data);
                const rows = await this.streamQueries(session, data, metadata);
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
        this.streamQueries = (session, data, metadata) => {
            let rows = 0;
            // columns are sent when the result description arrives, so they match the result exactly
            const onFields = (fields) => this.sendColumns(data, fields, metadata);
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
        /** metadata of tables used in FROM, missing when query is not parsable or table does not exist */
        this.loadTablesMetadata = async (data) => {
            const metadata = new Map();
            let selectFromTypes;
            try {
                selectFromTypes = this.driver.getSelectFromTypeFromQuery(data.query).filter((selectFromType) => !!selectFromType.table);
            }
            catch (e) {
                console.warn(HandleSelectQueryRequestHandler.name, 'loadTablesMetadata', AbstractCommandHandler_1.default.errorToString(e));
                return metadata;
            }
            await Promise.all(selectFromTypes.map((selectFromType) => {
                const databaseName = selectFromType.db || data.database.name;
                return this.driver.getColumnsOfTable(databaseName, selectFromType)
                    .then((columns) => metadata.set(`${databaseName}.${selectFromType.table}`, columns))
                    // query itself will report missing table
                    .catch(() => undefined);
            }));
            return metadata;
        };
    }
    sendColumns(data, fields, metadata) {
        const columns = fields.map((field) => {
            var _a;
            const tableColumn = field.orgTable
                ? (_a = metadata.get(`${field.db}.${field.orgTable}`)) === null || _a === void 0 ? void 0 : _a.find((column) => column.name === field.orgName)
                : undefined;
            if (!tableColumn) {
                return HandleSelectQueryRequestHandler.expressionColumn(field);
            }
            return Object.assign(Object.assign({}, tableColumn), { name: field.name, key: field.key, orgName: field.orgName, alias: field.table });
        });
        const { editable, readOnlyReason } = this.resolveEditable(data, columns, metadata);
        if (!editable) {
            columns.forEach((column) => column.editable = false);
        }
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_COLUMN, {
            tabId: data.tabId,
            columns,
            editable,
            readOnlyReason,
        }));
    }
    /** rows are editable when they come from single table and the row can be identified */
    resolveEditable(data, columns, metadata) {
        const analysis = this.driver.getEditableTableOfQuery(data.query);
        if (!analysis.table) {
            return { editable: null, readOnlyReason: analysis.reason };
        }
        const databaseName = analysis.table.db || data.database.name;
        const tableColumns = metadata.get(`${databaseName}.${analysis.table.table}`);
        if (!tableColumns) {
            return { editable: null, readOnlyReason: 'Table structure is unknown' };
        }
        const primaryKey = tableColumns.filter((column) => column.primaryKey);
        const primaryKeyInResult = primaryKey.map((keyColumn) => {
            var _a;
            return (_a = columns.find((column) => column.orgName === keyColumn.name && column.table.name === analysis.table.table)) === null || _a === void 0 ? void 0 : _a.key;
        });
        if (primaryKeyInResult.some((name) => name === undefined)) {
            return {
                editable: null,
                readOnlyReason: `Select primary key column (${primaryKey.map((column) => column.name).join(', ')}) to edit rows`,
            };
        }
        return {
            editable: {
                table: { databaseName, name: analysis.table.table },
                primaryKey: primaryKeyInResult,
            },
        };
    }
    /** column which is not a table column - expression, function, alias of sub query */
    static expressionColumn(field) {
        return {
            table: { databaseName: field.db, name: field.orgTable, alias: field.table },
            alias: field.table,
            autoIncrement: false,
            defaultValue: null,
            name: field.name,
            key: field.key,
            orgName: field.orgName,
            editable: false,
            nullable: true,
            primaryKey: false,
        };
    }
}
exports.default = HandleSelectQueryRequestHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQWU5Qzs7OztHQUlHO0FBQ0gsTUFBTSwrQkFBZ0MsU0FBUSxnQ0FBaUQ7SUFBL0Y7O1FBRUUsV0FBTSxHQUFHLEtBQUssRUFBRSxJQUErQixFQUFpQixFQUFFO1lBQ2hFLElBQUksT0FBK0IsQ0FBQztZQUNwQyxJQUFJO2dCQUNGLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDN0Q7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzlCLE9BQU87YUFDUjtZQUVELElBQUk7Z0JBQ0YsNEVBQTRFO2dCQUM1RSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFckQsc0ZBQXNGO2dCQUN0RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQy9ELE1BQU0sUUFBUSxDQUFDO2dCQUVmLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUF5QixJQUFJLG1CQUFTLENBQzdELElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxD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