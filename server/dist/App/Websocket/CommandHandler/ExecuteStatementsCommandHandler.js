"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
const ResultColumnsBuilder_1 = __importDefault(require("../Result/ResultColumnsBuilder"));
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
                        // following statements use database selected by USE
                        const use = /^\s*use\s+`?([^`;\s]+)`?/i.exec(sql);
                        if (use) {
                            database = use[1];
                        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXhlY3V0ZVN0YXRlbWVudHNDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0V4ZWN1dGVTdGF0ZW1lbnRzQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVE5QywwRkFBa0U7QUFLbEUsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDO0FBRTlCOzs7O0dBSUc7QUFDSCxNQUFNLCtCQUFnQyxTQUFRLGdDQUF5RDtJQUF2Rzs7UUFFRSxXQUFNLEdBQUcsS0FBSyxFQUFFLElBQXVDLEVBQWlCLEVBQUU7WUFDeEUsSUFBSSxDQUFDLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRTtnQkFDOUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxLQUFLLENBQUMsQ0FBQztnQkFDN0QsT0FBTzthQUNSO1lBQ0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFFaEcsSUFBSSxPQUErQixDQUFDO1lBQ3BDLElBQUk7Z0JBQ0YsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFB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