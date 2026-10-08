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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXhlY3V0ZVN0YXRlbWVudHNDb21tYW5kSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0V4ZWN1dGVTdGF0ZW1lbnRzQ29tbWFuZEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFDOUQscUZBQTZEO0FBQzdELGlFQUF5QztBQUN6QyxzRUFBOEM7QUFROUMsMEZBQWtFO0FBR2xFLHNFQUFxRTtBQUdyRSxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQztBQUM5QixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUM7QUFFOUI7Ozs7R0FJRztBQUNILE1BQU0sK0JBQWdDLFNBQVEsZ0NBQXlEO0lBQXZHOztRQUVFLFdBQU0sR0FBRyxLQUFLLEVBQUUsSUFBdUMsRUFBaUIsRUFBRTs7WUFDeEUsSUFBSSxDQUFDLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssQ0FBQSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRTtnQkFDOUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxLQUFLLENBQUMsQ0FBQztnQkFDN0QsT0FBTzthQUNSO1lBQ0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFFaEcsSUFBSSxPQUErQixDQUFDO1lBQ3BDLElBQUk7Z0JBQ0YsT0FBTyxHQUFHLE1BQU0sSUFBSSxD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