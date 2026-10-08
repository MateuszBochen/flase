"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const TotalCountDto_1 = __importDefault(require("../../../../Driver/Dto/TotalCountDto"));
const RowDto_1 = __importDefault(require("../../../../Driver/Dto/RowDto"));
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
const BinaryValue_1 = require("../BinaryValue");
const Cursor = require('pg-cursor');
/** rows read from cursor at once */
const BATCH_ROWS = 200;
/**
 * Single pooled PostgreSQL connection with search_path set to selected schema
 * @author Mateusz Bochen
 */
class PostgresSession {
    constructor(client, analyser, resolveFields, onRelease) {
        this.client = client;
        this.analyser = analyser;
        this.resolveFields = resolveFields;
        this.onRelease = onRelease;
        this.released = false;
        this.cancelled = false;
    }
    /** backend process on server - used by pg_cancel_backend */
    get processId() {
        var _a;
        return (_a = this.client.processID) !== null && _a !== void 0 ? _a : null;
    }
    async countRecords(query) {
        const result = await this.client.query({ text: this.analyser.getCountQuery(query), types: PostgresSql_1.default.types });
        return new TotalCountDto_1.default(Number(result.rows[0].total));
    }
    streamSelect(query, onFields) {
        console.log(`\x1b[33m Query Stream: ${query} \x1b[0m`);
        return new rxjs_1.Observable(observer => {
            this.readCursor(query, async (fields) => {
                const resultFields = await this.resolveFields(fields, query);
                onFields === null || onFields === void 0 ? void 0 : onFields(resultFields);
                return resultFields;
            }, (row) => observer.next(new RowDto_1.default(row)))
                .then(() => observer.complete())
                .catch((error) => observer.error(error));
        });
    }
    updateQuery(query) {
        return this.client.query(query).then((result) => {
            var _a;
            return ({
                affectedRows: Number(result.rowCount || 0),
                message: `${result.command} ${(_a = result.rowCount) !== null && _a !== void 0 ? _a : ''}: ${query}`,
            });
        });
    }
    async executeInTransaction(statements) {
        let affectedRows = 0;
        await this.client.query('BEGIN');
        try {
            for (const statement of statements) {
                let result;
                try {
                    result = await this.client.query(statement.sql);
                }
                catch (e) {
                    e.message = `${e.message}. Nothing was saved. ${statement.sql}`;
                    throw e;
                }
                if (statement.expectOneRow && Number(result.rowCount) !== 1) {
                    throw new Error(`Expected 1 row, matched ${Number(result.rowCount)}. Row was changed or removed meanwhile? Nothing was saved. ${statement.sql}`);
                }
                affectedRows += Number(result.rowCount || 0);
            }
            await this.client.query('COMMIT');
        }
        catch (e) {
            await this.client.query('ROLLBACK').catch(() => undefined);
            throw e;
        }
        return affectedRows;
    }
    async execute(sql, onFields, onRow, maxRows) {
        var _a, _b, _c;
        // USE schema of MySQL users - the same as SET search_path
        const use = /^\s*use\s+("((?:[^"]|"")+)"|`([^`]+)`|([^\s;"`]+))\s*;?\s*$/i.exec(sql);
        if (use) {
            const schema = (_c = (_b = (_a = use[2]) === null || _a === void 0 ? void 0 : _a.replace(/""/g, '"')) !== null && _b !== void 0 ? _b : use[3]) !== null && _c !== void 0 ? _c : use[4];
            await this.setSearchPath(schema);
            return { kind: 'ok', affectedRows: 0, changedRows: 0, insertId: 0, warningCount: 0, message: `search_path set to ${schema}` };
        }
        // RAISE NOTICE / WARNING of the statement
        const notices = [];
        const onNotice = (notice) => notices.push(`${notice.severity || 'NOTICE'}: ${notice.message}`);
        this.client.on('notice', onNotice);
        try {
            let rows = 0;
            let hasFields = false;
            const result = await this.readCursor(sql, async (fields) => {
                if (!fields.length)
                    return [];
                hasFields = true;
                const resultFields = await this.resolveFields(fields, sql);
                onFields(resultFields);
                return resultFields;
            }, (row) => {
                rows++;
                // rest of rows is read but not sent - result without LIMIT must not flood client
                if (rows <= maxRows)
                    onRow(row);
            });
            if (hasFields) {
                return { kind: 'rows', rows, truncated: rows > maxRows };
            }
            return {
                kind: 'ok',
                affectedRows: Number(result.rowCount || 0),
                changedRows: 0,
                insertId: 0,
                warningCount: notices.length,
                message: [result.command, ...notices].filter(Boolean).join('\n'),
            };
        }
        finally {
            this.client.removeListener('notice', onNotice);
        }
    }
    /** search_path of session, public stays for functions of extensions */
    async setSearchPath(schema) {
        const path = schema === 'public' ? PostgresSql_1.default.identifier(schema) : `${PostgresSql_1.default.identifier(schema)}, public`;
        await this.client.query(`SET search_path TO ${path}`);
    }
    /** called by adapter before pg_cancel_backend */
    markCancelled() {
        this.cancelled = true;
    }
    isCancelled() {
        return this.cancelled;
    }
    release() {
        var _a;
        if (this.released) {
            return;
        }
        this.released = true;
        (_a = this.onRelease) === null || _a === void 0 ? void 0 : _a.call(this);
        this.client.release();
    }
    /**
     * Reads all rows of statement by cursor - only one batch is in memory.
     * onFields is called before first row (also for statements without result), resolves with command and row count.
     */
    async readCursor(sql, onFields, onRow) {
        const cursor = this.client.query(new Cursor(sql, [], { types: PostgresSql_1.default.types, rowMode: 'array' }));
        const read = () => new Promise((resolve, reject) => {
            cursor.read(BATCH_ROWS, (err, rows, result) => err ? reject(err) : resolve({ rows, result }));
        });
        try {
            let resultFields = null;
            for (;;) {
                const { rows, result } = await read();
                if (!resultFields) {
                    resultFields = await onFields(result.fields || []);
                }
                rows.forEach((values) => {
                    const row = {};
                    resultFields.forEach((field, index) => row[field.key] = BinaryValue_1.serializeBinaryValue(values[index]));
                    onRow(row);
                });
                if (rows.length < BATCH_ROWS) {
                    return { command: result.command, rowCount: result.rowCount };
                }
            }
        }
        finally {
            await new Promise((resolve) => cursor.close(() => resolve()));
        }
    }
}
exports.default = PostgresSession;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1Nlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQU9uRCxnRUFBd0M7QUFDeEMsZ0RBQW9EO0FBQ3BELE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUVwQyxvQ0FBb0M7QUFDcEMsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDO0FBWXZCOzs7R0FHRztBQUNILE1BQU0sZUFBZTtJQUluQixZQUNtQixNQUFrQixFQUNsQixRQUF3QixFQUN4QixhQUFpQyxFQUNqQyxTQUFzQjtRQUh0QixXQUFNLEdBQU4sTUFBTSxDQUFZO1FBQ2xCLGFBQVEsR0FBUixRQUFRLENBQWdCO1FBQ3hCLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUNqQyxjQUFTLEdBQVQsU0FBUyxDQUFhO1FBUGpDLGFBQVEsR0FBRyxLQUFLLENBQUM7UUFDakIsY0FBUyxHQUFHLEtBQUssQ0FBQztJQVExQixDQUFDO0lBRUQsNERBQTREO0lBQzVELElBQUksU0FBUzs7UUFDWCxPQUFPLE1BQUMsSUFBSSxDQUFDLE1BQWMsQ0FBQyxTQUFTLG1DQUFJLElBQUksQ0FBQztJQUNoRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFhO1FBQzlCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxFQUFFLHFCQUFXLENBQUMsS0FBSyxFQUFDLENBQUMsQ0FBQztRQUM3RyxPQUFPLElBQUksdUJBQWEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCxZQUFZLENBQUMsS0FBYSxFQUFFLFFBQW1EO1FBQzdFLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEtBQUssVUFBVSxDQUFDLENBQUM7UUFFdkQsT0FBTyxJQUFJLGlCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUN0QyxNQUFNLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUM3RCxRQUFRLGFBQVIsUUFBUSx1QkFBUixRQUFRLENBQUcsWUFBWSxDQUFDLENBQUM7Z0JBQ3pCLE9BQU8sWUFBWSxDQUFDO1lBQ3RCLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLGdCQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztpQkFDeEMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztpQkFDL0IsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsV0FBVyxDQUFDLEtBQWE7UUFDdkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTs7WUFBQyxPQUFBLENBQUM7Z0JBQ2hELFlBQVksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7Z0JBQzFDLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxPQUFPLElBQUksTUFBQSxNQUFNLENBQUMsUUFBUSxtQ0FBSSxFQUFFLEtBQUssS0FBSyxFQUFFO2FBQ2hFLENBQUMsQ0FBQTtTQUFBLENBQUMsQ0FBQztJQUNOLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsVUFBeUM7UUFDbEUsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFakMsSUFBSTtZQUNGLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFO2dCQUNsQyxJQUFJLE1BQU0sQ0FBQztnQkFDWCxJQUFJO29CQUNGLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDakQ7Z0JBQUMsT0FBTyxDQUFNLEVBQUU7b0JBQ2YsQ0FBQyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxPQUFPLHdCQUF3QixTQUFTLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQ2hFLE1BQU0sQ0FBQyxDQUFDO2lCQUNUO2dCQUNELElBQUksU0FBUyxDQUFDLFlBQVksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDM0QsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsOERBQThELFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO2lCQUNsSjtnQkFDRCxZQUFZLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDOUM7WUFDRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQ25DO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsQ0FBQztTQUNUO1FBRUQsT0FBTyxZQUFZLENBQUM7SUFDdEIsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQ1gsR0FBVyxFQUNYLFFBQWtELEVBQ2xELEtBQWdDLEVBQ2hDLE9BQWU7O1FBRWYsMERBQTBEO1FBQzFELE1BQU0sR0FBRyxHQUFHLDhEQUE4RCxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNyRixJQUFJLEdBQUcsRUFBRTtZQUNQLE1BQU0sTUFBTSxHQUFHLE1BQUEsTUFBQSxNQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsbUNBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxtQ0FBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0QsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pDLE9BQU8sRUFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLHNCQUFzQixNQUFNLEVBQUUsRUFBQyxDQUFDO1NBQzdIO1FBRUQsMENBQTBDO1FBQzFDLE1BQU0sT0FBTyxHQUFhLEVBQUUsQ0FBQztRQUM3QixNQUFNLFFBQVEsR0FBRyxDQUFDLE1BQVcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxRQUFRLElBQUksUUFBUSxLQUFLLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUVuQyxJQUFJO1lBQ0YsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQ2IsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUN6RCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU07b0JBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQzlCLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBQ2pCLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzNELFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDdkIsT0FBTyxZQUFZLENBQUM7WUFDdEIsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUU7Z0JBQ1QsSUFBSSxFQUFFLENBQUM7Z0JBQ1AsaUZBQWlGO2dCQUNqRixJQUFJLElBQUksSUFBSSxPQUFPO29CQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksU0FBUyxFQUFFO2dCQUNiLE9BQU8sRUFBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxHQUFHLE9BQU8sRUFBQyxDQUFDO2FBQ3hEO1lBQ0QsT0FBTztnQkFDTCxJQUFJLEVBQUUsSUFBSTtnQkFDVixZQUFZLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDO2dCQUMxQyxXQUFXLEVBQUUsQ0FBQztnQkFDZCxRQUFRLEVBQUUsQ0FBQztnQkFDWCxZQUFZLEVBQUUsT0FBTyxDQUFDLE1BQU07Z0JBQzVCLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzthQUNqRSxDQUFDO1NBQ0g7Z0JBQVM7WUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDaEQ7SUFDSCxDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBYztRQUNoQyxNQUFNLElBQUksR0FBRyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxxQkFBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxxQkFBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ2hILE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLElBQUksRUFBRSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELGlEQUFpRDtJQUNqRCxhQUFhO1FBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7SUFDeEIsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVELE9BQU87O1FBQ0wsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2pCLE9BQU87U0FDUjtRQUNELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLE1BQUEsSUFBSSxDQUFDLFNBQVMsK0NBQWQsSUFBSSxDQUFjLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssS0FBSyxDQUFDLFVBQVUsQ0FDdEIsR0FBVyxFQUNYLFFBQXlFLEVBQ3pFLEtBQWdDO1FBRWhDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBQyxLQUFLLEVBQUUscUJBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBQyxDQUFDLENBQUMsQ0FBQztRQUNwRyxNQUFNLElBQUksR0FBRyxHQUEwQyxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDeEYsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQWEsRUFBRSxNQUFXLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBQyxJQUFJLEVBQUUsTUFBTSxFQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSTtZQUNGLElBQUksWUFBWSxHQUFrQyxJQUFJLENBQUM7WUFDdkQsU0FBUztnQkFDUCxNQUFNLEVBQUMsSUFBSSxFQUFFLE1BQU0sRUFBQyxHQUFHLE1BQU0sSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxZQUFZLEVBQUU7b0JBQ2pCLFlBQVksR0FBRyxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2lCQUNwRDtnQkFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7b0JBQ3RCLE1BQU0sR0FBRyxHQUFlLEVBQUUsQ0FBQztvQkFDM0IsWUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsa0NBQW9CLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUYsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNiLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLEVBQUU7b0JBQzVCLE9BQU8sRUFBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBQyxDQUFDO2lCQUM3RDthQUNGO1NBQ0Y7Z0JBQVM7WUFDUixNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNyRTtJQUNILENBQUM7Q0FDRjtBQUVELGtCQUFlLGVBQWUsQ0FBQyJ9