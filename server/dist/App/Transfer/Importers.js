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
    const splitter = new StreamingSqlSplitter_1.default();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSW1wb3J0ZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9UcmFuc2Zlci9JbXBvcnRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLG1EQUE2QztBQUc3QyxrRkFBMEQ7QUFDMUQsNERBQW9DO0FBRXBDLGdIQUF3RjtBQUV4RixNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztBQUNqQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDM0IsTUFBTSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7QUFJL0IsaUZBQWlGO0FBQ2pGLE1BQU0sV0FBVztJQVFmLFlBQTZCLFVBQTRCO1FBQTVCLGVBQVUsR0FBVixVQUFVLENBQWtCO1FBUGhELFlBQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDOUIsVUFBSyxHQUFHLENBQUMsQ0FBQztRQUNWLGVBQVUsR0FBRyxDQUFDLENBQUM7UUFDZixTQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsV0FBTSxHQUF5QyxFQUFFLENBQUM7UUFDMUMsaUJBQVksR0FBRyxDQUFDLENBQUM7SUFHekIsQ0FBQztJQUVELFFBQVEsQ0FBQyxTQUFpQixFQUFFLEtBQVU7UUFDcEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxtQkFBbUIsRUFBRTtZQUM1QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLGdDQUFzQixDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBQyxDQUFDLENBQUM7U0FDdko7SUFDSCxDQUFDO0lBRUQsUUFBUSxDQUFDLFFBQWlCLEtB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