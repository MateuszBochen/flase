"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importCsv = exports.importSql = void 0;
const string_decoder_1 = require("string_decoder");
const StreamingSqlSplitter_1 = __importDefault(require("./StreamingSqlSplitter"));
const CsvParser_1 = __importDefault(require("./CsvParser"));
const AbstractCommandHandler_1 = __importDefault(require("../Websocket/CommandHandler/AbstractCommandHandler"));
const PROGRESS_INTERVAL_MS = 300;
const CSV_BATCH_ROWS = 500;
const MAX_REPORTED_ERRORS = 20;
/** common state of import - bytes read, statements, errors, progress messages */
class ImportState {
    constructor(onProgress) {
        this.onProgress = onProgress;
        this.started = Date.now();
        this.bytes = 0;
        this.statements = 0;
        this.rows = 0;
        this.errors = [];
        this.lastProgress = 0;
    }
    addError(statement, error) {
        if (this.errors.length < MAX_REPORTED_ERRORS) {
            this.errors.push({ statement: statement.length > 300 ? `${statement.slice(0, 300)}…` : statement, error: AbstractCommandHandler_1.default.errorToString(error) });
        }
    }
    progress(force = false) {
        if (force || Date.now() - this.lastProgress >= PROGRESS_INTERVAL_MS) {
            this.lastProgress = Date.now();
            this.onProgress(this.snapshot());
        }
    }
    snapshot() {
        return { bytes: this.bytes, statements: this.statements, rows: this.rows, errors: [...this.errors] };
    }
    finished(cancelled, failed) {
        return Object.assign(Object.assign({}, this.snapshot()), { cancelled, failed, durationMs: Date.now() - this.started });
    }
}
/** text chunks of stream, multi byte characters are not broken between chunks */
function textChunks(input, state) {
    return __asyncGenerator(this, arguments, function* textChunks_1() {
        var e_1, _a;
        const decoder = new string_decoder_1.StringDecoder('utf8');
        try {
            for (var input_1 = __asyncValues(input), input_1_1; input_1_1 = yield __await(input_1.next()), !input_1_1.done;) {
                const chunk = input_1_1.value;
                state.bytes += chunk.length;
                yield yield __await(decoder.write(chunk));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (input_1_1 && !input_1_1.done && (_a = input_1.return)) yield __await(_a.call(input_1));
            }
            finally { if (e_1) throw e_1.error; }
        }
        yield yield __await(decoder.end());
    });
}
/**
 * SQL file - statements are executed one by one while the file is uploaded
 */
const importSql = async (driver, database, tabId, stopOnError, input, onProgress) => {
    var e_2, _a;
    const state = new ImportState(onProgress);
    const session = await driver.openSession(database, tabId);
    const splitter = new StreamingSqlSplitter_1.default(driver.dialect);
    let failed = false;
    const run = async (statements) => {
        for (const statement of statements) {
            if (session.isCancelled())
                return false;
            try {
                await session.execute(statement, () => undefined, () => undefined, 0);
                state.statements++;
            }
            catch (e) {
                state.addError(statement, e);
                if (session.isCancelled())
                    return false;
                if (stopOnError) {
                    failed = true;
                    return false;
                }
            }
            state.progress();
        }
        return true;
    };
    try {
        let goOn = true;
        try {
            for (var _b = __asyncValues(textChunks(input, state)), _c; _c = await _b.next(), !_c.done;) {
                const text = _c.value;
                if (!(goOn = await run(splitter.push(text))))
                    break;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        if (goOn) {
            await run(splitter.end());
        }
    }
    finally {
        session.release();
    }
    // rest of upload is not needed anymore
    input.resume();
    return state.finished(session.isCancelled(), failed);
};
exports.importSql = importSql;
/**
 * CSV file into existing table, in one transaction - error rolls back everything
 */
const importCsv = async (driver, options, tabId, input, onProgress) => {
    var e_3, _a;
    const state = new ImportState(onProgress);
    const mapped = options.columns
        .map((column, index) => ({ column, index }))
        .filter((item) => !!item.column);
    if (!mapped.length) {
        throw new Error('Select at least one target column');
    }
    const columns = mapped.map((item) => item.column);
    const parser = new CsvParser_1.default(options.delimiter || ',');
    const session = await driver.openSession(options.database, tabId);
    let failed = false;
    let csvRow = 0;
    let batch = [];
    let batchStartRow = 0;
    const toValue = (value, quoted) => {
        if (value === undefined)
            return null;
        if (quoted)
            return value;
        if (options.nullValue === 'empty' && value === '')
            return null;
        if (options.nullValue === '\\N' && value === '\\N')
            return null;
        if (options.nullValue === 'NULL' && value.toUpperCase() === 'NULL')
            return null;
        return value;
    };
    const flush = async () => {
        if (!batch.length)
            return;
        const statement = driver.buildInsertStatement(options.database, options.table, columns, batch);
        try {
            await session.execute(statement, () => undefined, () => undefined, 0);
            state.rows += batch.length;
            state.statements++;
            batch = [];
            state.progress();
        }
        catch (e) {
            state.addError(`CSV rows ${batchStartRow}-${batchStartRow + batch.length - 1}`, e);
            throw e;
        }
    };
    try {
        if (options.truncate) {
            // TRUNCATE commits by itself - it cannot be part of the transaction
            const [truncate] = await driver.buildStructureChangeStatements({ databaseName: options.database, name: options.table }, { kind: 'truncate' });
            await session.execute(truncate, () => undefined, () => undefined, 0);
        }
        await session.execute('START TRANSACTION', () => undefined, () => undefined, 0);
        const consume = async (rows) => {
            for (const row of rows) {
                csvRow++;
                if (options.header && csvRow === 1)
                    continue;
                if (session.isCancelled())
                    throw new Error('Import was cancelled');
                if (!batch.length)
                    batchStartRow = csvRow;
                batch.push(mapped.map((item) => toValue(row.values[item.index], !!row.quoted[item.index])));
                if (batch.length >= CSV_BATCH_ROWS) {
                    await flush();
                }
            }
        };
        try {
            for (var _b = __asyncValues(textChunks(input, state)), _c; _c = await _b.next(), !_c.done;) {
                const text = _c.value;
                await consume(parser.push(text));
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
            }
            finally { if (e_3) throw e_3.error; }
        }
        await consume(parser.end());
        await flush();
        await session.execute('COMMIT', () => undefined, () => undefined, 0);
    }
    catch (e) {
        failed = true;
        if (!state.errors.length) {
            state.addError(`CSV row ${csvRow}`, e);
        }
        await session.execute('ROLLBACK', () => undefined, () => undefined, 0).catch(() => undefined);
        // nothing was saved
        state.rows = 0;
        input.resume();
    }
    finally {
        session.release();
    }
    return state.finished(session.isCancelled(), failed);
};
exports.importCsv = importCsv;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSW1wb3J0ZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9UcmFuc2Zlci9JbXBvcnRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLG1EQUE2QztBQUc3QyxrRkFBMEQ7QUFDMUQsNERBQW9DO0FBRXBDLGdIQUF3RjtBQUV4RixNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztBQUNqQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDM0IsTUFBTSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7QUFJL0IsaUZBQWlGO0FBQ2pGLE1BQU0sV0FBVztJQVFmLFlBQTZCLFVBQTRCO1FBQTVCLGVBQVUsR0FBVixVQUFVLENBQWtCO1FBUGhELFlBQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDOUIsVUFBSyxHQUFHLENBQUMsQ0FBQztRQUNWLGVBQVUsR0FBRyxDQUFDLENBQUM7UUFDZixTQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsV0FBTSxHQUF5QyxFQUFFLENBQUM7UUFDMUMsaUJBQVksR0FBRyxDQUFDLENBQUM7SUFHekIsQ0FBQztJQUVELFFBQVEsQ0FBQyxTQUFpQixFQUFFLEtBQVU7UUFDcEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxtQkFBbUIsRUFBRTtZQUM1QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLGdDQUFzQixDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBQyxDQUFDLENBQUM7U0FDdko7SUFDSCxDQUFDO0lBRUQsUUFBUSxDQUFDLFFBQWlCLEtBQUs7UUFDN0IsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxZQUFZLElBQUksb0JBQW9CLEVBQUU7WUFDbkUsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztTQUNsQztJQUNILENBQUM7SUFFRCxRQUFRO1FBQ04sT0FBTyxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFDLENBQUM7SUFDckcsQ0FBQztJQUVELFFBQVEsQ0FBQyxTQUFrQixFQUFFLE1BQWU7UUFDMUMsdUNBQVcsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsT0FBTyxJQUFFO0lBQ3hGLENBQUM7Q0FDRjtBQUVELGlGQUFpRjtBQUNqRixTQUFnQixVQUFVLENBQUMsS0FBZSxFQUFFLEtBQWtCOzs7UUFDNUQsTUFBTSxPQUFPLEdBQUcsSUFBSSw4QkFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDOztZQUMxQyxLQUEwQixJQUFBLFVBQUEsY0FBQSxLQUFLLENBQUEsV0FBQTtnQkFBcEIsTUFBTSxLQUFLLGtCQUFBLENBQUE7Z0JBQ3BCLEtBQUssQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQztnQkFDNUIsb0JBQU0sT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDO2FBQzVCOzs7Ozs7Ozs7UUFDRCxvQkFBTSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUEsQ0FBQztJQUN0QixDQUFDO0NBQUE7QUFFRDs7R0FFRztBQUNJLE1BQU0sU0FBUyxHQUFHLEtBQUssRUFDNUIsTUFBdUIsRUFDdkIsUUFBdUIsRUFDdkIsS0FBYSxFQUNiLFdBQW9CLEVBQ3BCLEtBQWUsRUFDZixVQUE0QixFQUNNLEVBQUU7O0lBQ3BDLE1BQU0sS0FBSyxHQUFHLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sT0FBTyxHQUEyQixNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xGLE1BQU0sUUFBUSxHQUFHLElBQUksOEJBQW9CLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFELElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztJQUVuQixNQUFNLEdBQUcsR0FBRyxLQUFLLEVBQUUsVUFBb0IsRUFBb0IsRUFBRTtRQUMzRCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRTtZQUNsQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLEVBQUU7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDeEMsSUFBSTtnQkFDRixNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQzthQUNwQjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixJQUFJLE9BQU8sQ0FBQyxXQUFXLEVBQUU7b0JBQUUsT0FBTyxLQUFLLENBQUM7Z0JBQ3hDLElBQUksV0FBVyxFQUFFO29CQUNmLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ2QsT0FBTyxLQUFLLENBQUM7aUJBQ2Q7YUFDRjtZQUNELEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUNsQjtRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsSUFBSTtRQUNGLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQzs7WUFDaEIsS0FBeUIsSUFBQSxLQUFBLGNBQUEsVUFBVSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQSxJQUFBO2dCQUF0QyxNQUFNLElBQUksV0FBQSxDQUFBO2dCQUNuQixJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUFFLE1BQU07YUFDckQ7Ozs7Ozs7OztRQUNELElBQUksSUFBSSxFQUFFO1lBQ1IsTUFBTSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7U0FDM0I7S0FDRjtZQUFTO1FBQ1IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0tBQ25CO0lBQ0QsdUNBQXVDO0lBQ3ZDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNmLE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDdkQsQ0FBQyxDQUFDO0FBOUNXLFFBQUEsU0FBUyxhQThDcEI7QUFFRjs7R0FFRztBQUNJLE1BQU0sU0FBUyxHQUFHLEtBQUssRUFDNUIsTUFBdUIsRUFDdkIsT0FBa0MsRUFDbEMsS0FBYSxFQUNiLEtBQWUsRUFDZixVQUE0QixFQUNNLEVBQUU7O0lBQ3BDLE1BQU0sS0FBSyxHQUFHLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxPQUFPO1NBQzNCLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBQyxNQUFNLEVBQUUsS0FBSyxFQUFDLENBQUMsQ0FBQztTQUN6QyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQTJDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzVFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1FBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztLQUN0RDtJQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNsRCxNQUFNLE1BQU0sR0FBRyxJQUFJLG1CQUFTLENBQUMsT0FBTyxDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUN2RCxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDbkIsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2YsSUFBSSxLQUFLLEdBQXdCLEVBQUUsQ0FBQztJQUNwQyxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7SUFFdEIsTUFBTSxPQUFPLEdBQUcsQ0FBQyxLQUF5QixFQUFFLE1BQWUsRUFBaUIsRUFBRTtRQUM1RSxJQUFJLEtBQUssS0FBSyxTQUFTO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDckMsSUFBSSxNQUFNO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDekIsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLE9BQU8sSUFBSSxLQUFLLEtBQUssRUFBRTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQy9ELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUs7WUFBRSxPQUFPLElBQUksQ0FBQztRQUNoRSxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxNQUFNO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDaEYsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDLENBQUM7SUFFRixNQUFNLEtBQUssR0FBRyxLQUFLLElBQUksRUFBRTtRQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU07WUFBRSxPQUFPO1FBQzFCLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9GLElBQUk7WUFDRixNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEUsS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQzNCLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNuQixLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ1gsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ2xCO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksYUFBYSxJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sQ0FBQyxDQUFDO1NBQ1Q7SUFDSCxDQUFDLENBQUM7SUFFRixJQUFJO1FBQ0YsSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFO1lBQ3BCLG9FQUFvRTtZQUNwRSxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxNQUFNLENBQUMsOEJBQThCLENBQUMsRUFBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLEVBQUMsSUFBSSxFQUFFLFVBQVUsRUFBQyxDQUFDLENBQUM7WUFDMUksTUFBTSxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQ3RFO1FBQ0QsTUFBTSxPQUFPLENBQUMsT0FBTyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFaEYsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLElBQTZDLEVBQUUsRUFBRTtZQUN0RSxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRTtnQkFDdEIsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLE1BQU0sS0FBSyxDQUFDO29CQUFFLFNBQVM7Z0JBQzdDLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRTtvQkFBRSxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7Z0JBQ25FLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTTtvQkFBRSxhQUFhLEdBQUcsTUFBTSxDQUFDO2dCQUMxQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVGLElBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxjQUFjLEVBQUU7b0JBQ2xDLE1BQU0sS0FBSyxFQUFFLENBQUM7aUJBQ2Y7YUFDRjtRQUNILENBQUMsQ0FBQzs7WUFFRixLQUF5QixJQUFBLEtBQUEsY0FBQSxVQUFVLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFBLElBQUE7Z0JBQXRDLE1BQU0sSUFBSSxXQUFBLENBQUE7Z0JBQ25CLE1BQU0sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUNsQzs7Ozs7Ozs7O1FBQ0QsTUFBTSxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDNUIsTUFBTSxLQUFLLEVBQUUsQ0FBQztRQUNkLE1BQU0sT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztLQUN0RTtJQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsTUFBTSxHQUFHLElBQUksQ0FBQztRQUNkLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUN4QixLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVcsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDeEM7UUFDRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlGLG9CQUFvQjtRQUNwQixLQUFLLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUNmLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUNoQjtZQUFTO1FBQ1IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0tBQ25CO0lBQ0QsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUN2RCxDQUFDLENBQUM7QUF0RlcsUUFBQSxTQUFTLGFBc0ZwQiJ9