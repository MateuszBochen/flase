"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
const ResultColumnsBuilder_1 = __importDefault(require("../Result/ResultColumnsBuilder"));
const DatabaseSwitch_1 = require("../../Driver/Query/DatabaseSwitch");
const DEFAULT_MAX_ROWS = 1000;
const LIMIT_MAX_ROWS = 100000;
/**
 * SQL console - statements are executed one by one in one session (USE, variables and transactions are kept).
 * Rows of result N are sent with tabId `${tabId}:${N}` as for data grid, so the same grid can show them.
 * @author Mateusz Bochen
 */
class ExecuteStatementsCommandHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = async (data) => {
            var _a;
            if (!(data === null || data === void 0 ? void 0 : data.tabId) || !Array.isArray(data.statements) || !data.statements.length) {
                this.sendError(new Error('Nothing to execute'), data === null || data === void 0 ? void 0 : data.tabId);
                return;
            }
            const maxRows = Math.min(Math.max(1, Number(data.maxRows) || DEFAULT_MAX_ROWS), LIMIT_MAX_ROWS);
            let session;
            try {
                session = await this.driver.openSession(data.database || null, data.tabId);
            }
            catch (e) {
                this.sendError(e, data.tabId);
                return;
            }
            let executed = 0;
            let failed = 0;
            let database = data.database || null;
            try {
                for (let index = 0; index < data.statements.length; index++) {
                    const sql = data.statements[index];
                    const resultTabId = `${data.tabId}:${index}`;
                    this.send(MessageType_1.default.STATEMENT_STARTED, { tabId: data.tabId, index, sql });
                    const started = Date.now();
                    try {
                        const columnsBuilder = new ResultColumnsBuilder_1.default(this.driver, database, sql);
                        await columnsBuilder.loadMetadata();
                        const result = await session.execute(sql, (fields) => this.send(MessageType_1.default.SINGLE_SELECT_COLUMN, Object.assign({ tabId: resultTabId }, columnsBuilder.build(fields, false))), (row) => this.send(MessageType_1.default.SINGLE_SELECT_RECORD, { tabId: resultTabId, rowDataValue: row }), maxRows);
                        executed++;
                        if (result.kind === 'rows') {
                            this.send(MessageType_1.default.QUERY_FINISHED, { tabId: resultTabId, rows: Math.min(result.rows, maxRows) });
                        }
                        // following statements use database selected by USE (schema by SET search_path)
                        database = (_a = DatabaseSwitch_1.selectedDatabaseOf(sql)) !== null && _a !== void 0 ? _a : database;
                        this.send(MessageType_1.default.STATEMENT_FINISHED, {
                            tabId: data.tabId, index, sql, durationMs: Date.now() - started, result,
                        });
                    }
                    catch (e) {
                        failed++;
                        this.send(MessageType_1.default.STATEMENT_FINISHED, {
                            tabId: data.tabId, index, sql, durationMs: Date.now() - started, error: AbstractCommandHandler_1.default.errorToString(e),
                        });
                        if (data.stopOnError !== false) {
                            break;
                        }
                    }
                }
            }
            finally {
                session.release();
            }
            this.send(MessageType_1.default.EXECUTION_FINISHED, {
                tabId: data.tabId,
                executed,
                failed,
                skipped: data.statements.length - executed - failed,
            });
        };
    }
    send(message, payload) {
        this.clientWebsocket.send(new WsMessage_1.default(this.command.connectionData.connection, message, payload));
    }
}
exports.default = ExecuteStatementsCommandHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXhlY3V0ZVN0YXRlbWVudHNDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0V4ZWN1dGVTdGF0ZW1lbnRzQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVE5QywwRkFBa0U7QUFHbEUsc0VBQXFFO0FBR3JFLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO0FBQzlCLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQztBQUU5Qjs7OztHQUlHO0FBQ0gsTUFBTSwrQkFBZ0MsU0FBUSxnQ0FBeUQ7SUFBdkc7O1FBRUUsV0FBTSxHQUFHLEtBQUssRUFBRSxJQUF1QyxFQUFpQixFQUFFOztZQUN4RSxJQUFJLENBQUMsQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxDQUFBLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFO2dCQUM5RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUM3RCxPQUFPO2FBQ1I7WUFDRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksZ0JBQWdCLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUVoRyxJQUFJLE9BQStCLENBQUM7WUFDcEMsSUFBSTtnQkFDRixPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFD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