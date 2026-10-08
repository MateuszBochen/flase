"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const TotalCountDto_1 = __importDefault(require("../../../../Driver/Dto/TotalCountDto"));
const RowDto_1 = __importDefault(require("../../../../Driver/Dto/RowDto"));
const { Parser } = require('node-sql-parser');
/**
 * Single pooled mysql connection with selected database
 * @author Mateusz Bochen
 */
class MysqlSession {
    constructor(connection, parser, onRelease) {
        this.released = false;
        this.cancelled = false;
        this.connection = connection;
        this.parser = parser;
        this.onRelease = onRelease;
    }
    /** thread of the connection on database server - used by KILL QUERY */
    get threadId() {
        return this.connection.threadId;
    }
    countRecords(query) {
        return new Promise((resolve, reject) => {
            let countQuery;
            try {
                countQuery = this.getAllCountRowsQuery(query);
            }
            catch (e) {
                reject(e);
                return;
            }
            this.connection.query(countQuery, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(new TotalCountDto_1.default(+results[0].total));
            });
        });
    }
    streamSelect(query, onFields) {
        console.log(`\x1b[33m Query Stream: ${query} \x1b[0m`);
        return new rxjs_1.Observable(observer => {
            let resultFields = [];
            // values are nested by table alias, so same column names of joined tables do not overwrite each other
            this.connection.query({ sql: query, nestTables: true })
                .on('error', (error) => observer.error(error))
                .on('fields', (fields) => {
                resultFields = MysqlSession.toResultFields(fields || []);
                onFields === null || onFields === void 0 ? void 0 : onFields(resultFields);
            })
                .on('result', (row) => {
                const flatRow = {};
                resultFields.forEach((field) => { var _a; return flatRow[field.key] = MysqlSession.serializeValue((_a = row[field.table]) === null || _a === void 0 ? void 0 : _a[field.name]); });
                observer.next(new RowDto_1.default(flatRow));
            })
                // 'end' is emitted also after error - complete is then ignored by rxjs
                .on('end', () => observer.complete());
        });
    }
    updateQuery(query) {
        return new Promise((resolve, reject) => {
            this.connection.query(query, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({
                    affectedRows: +result.affectedRows,
                    message: `${result.message}): ${query}`,
                });
            });
        });
    }
    async executeInTransaction(statements) {
        let affectedRows = 0;
        await this.query('START TRANSACTION');
        try {
            for (const statement of statements) {
                const result = await this.query(statement.sql);
                // FOUND_ROWS flag is on - affectedRows means matched rows, also when value did not change
                if (statement.expectOneRow && +result.affectedRows !== 1) {
                    throw new Error(`Expected 1 row, matched ${+result.affectedRows}. Row was changed or removed meanwhile? Nothing was saved. ${statement.sql}`);
                }
                affectedRows += +result.affectedRows;
            }
            await this.query('COMMIT');
        }
        catch (e) {
            await this.query('ROLLBACK').catch(() => undefined);
            if (e === null || e === void 0 ? void 0 : e.sqlMessage) {
                e.sqlMessage = `${e.sqlMessage}. Nothing was saved. ${e.sql || ''}`;
            }
            throw e;
        }
        return affectedRows;
    }
    execute(sql, onFields, onRow, maxRows) {
        return new Promise((resolve, reject) => {
            let resultFields = null;
            let rows = 0;
            let okPacket = null;
            let failed = false;
            this.connection.query({ sql, nestTables: true })
                .on('error', (error) => {
                failed = true;
                reject(error);
            })
                .on('fields', (fields) => {
                // procedures can return more result sets - only the first one is shown
                if (!resultFields && fields) {
                    resultFields = MysqlSession.toResultFields(fields);
                    onFields(resultFields);
                }
            })
                .on('result', (row) => {
                var _a;
                if (((_a = row === null || row === void 0 ? void 0 : row.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'OkPacket') {
                    okPacket = row;
                    return;
                }
                if (!resultFields) {
                    return;
                }
                rows++;
                // rest of rows is read but not sent - result without LIMIT must not flood client
                if (rows <= maxRows) {
                    const flatRow = {};
                    resultFields.forEach((field) => { var _a; return flatRow[field.key] = MysqlSession.serializeValue((_a = row[field.table]) === null || _a === void 0 ? void 0 : _a[field.name]); });
                    onRow(flatRow);
                }
            })
                .on('end', () => {
                if (failed) {
                    return;
                }
                if (resultFields) {
                    resolve({ kind: 'rows', rows, truncated: rows > maxRows });
                }
                else {
                    resolve({
                        kind: 'ok',
                        affectedRows: Number((okPacket === null || okPacket === void 0 ? void 0 : okPacket.affectedRows) || 0),
                        changedRows: Number((okPacket === null || okPacket === void 0 ? void 0 : okPacket.changedRows) || 0),
                        insertId: Number((okPacket === null || okPacket === void 0 ? void 0 : okPacket.insertId) || 0),
                        warningCount: Number((okPacket === null || okPacket === void 0 ? void 0 : okPacket.warningCount) || 0),
                        message: String((okPacket === null || okPacket === void 0 ? void 0 : okPacket.message) || '').replace(/^\(|\)$/g, '').trim(),
                    });
                }
            });
        });
    }
    /** called by adapter before KILL QUERY */
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
        this.connection.release();
    }
    /** binary values (BLOB, BINARY) would be sent as huge array of bytes - client gets size, hex preview and text */
    static serializeValue(value) {
        if (!Buffer.isBuffer(value)) {
            return value;
        }
        const previewBytes = value.subarray(0, MysqlSession.BINARY_PREVIEW_BYTES);
        const text = value.length <= MysqlSession.BINARY_TEXT_BYTES ? value.toString('utf8') : null;
        // replacement character = not valid utf8, control characters = not text
        const isText = text !== null && !text.includes('\uFFFD') && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
        return {
            binary: true,
            size: value.length,
            hex: previewBytes.toString('hex'),
            truncated: value.length > previewBytes.length,
            text: isText ? text : null,
        };
    }
    /** key is column name, `table.name` when name repeats in result */
    static toResultFields(fields) {
        const nameCount = new Map();
        fields.forEach((field) => nameCount.set(field.name, (nameCount.get(field.name) || 0) + 1));
        const usedKeys = new Set();
        return fields.map((field, index) => {
            let key = nameCount.get(field.name) > 1 && field.table ? `${field.table}.${field.name}` : field.name;
            if (usedKeys.has(key)) {
                key = `${key}#${index}`;
            }
            usedKeys.add(key);
            return {
                key,
                name: field.name,
                orgName: field.orgName,
                table: field.table,
                orgTable: field.orgTable,
                db: field.db,
            };
        });
    }
    query(sql) {
        return new Promise((resolve, reject) => {
            this.connection.query(sql, (err, result) => err ? reject(err) : resolve(result));
        });
    }
    /**
     * Function helping change select query into count query.
     * Grouped / distinct queries are wrapped into sub select so groups are counted, not rows.
     * Other queries just replace columns with COUNT(*) - sub select would fail on duplicated
     * column names (SELECT * FROM a JOIN b).
     */
    getAllCountRowsQuery(query) {
        var _a;
        const parsed = this.parser.astify(query);
        const statements = Array.isArray(parsed) ? parsed : [parsed];
        if (statements.length !== 1 || statements[0].type !== 'select') {
            throw new Error('Only single SELECT query can be counted');
        }
        const ast = statements[0];
        ast.limit = null;
        ast.orderby = null;
        const groupBy = Array.isArray(ast.groupby) ? ast.groupby : (_a = ast.groupby) === null || _a === void 0 ? void 0 : _a.columns;
        if (ast.distinct || (groupBy === null || groupBy === void 0 ? void 0 : groupBy.length) || ast.having) {
            return `SELECT COUNT(*) AS total FROM (${this.parser.sqlify(ast)}) AS flase_count`;
        }
        ast.columns = [
            {
                expr: {
                    type: 'aggr_func',
                    name: 'COUNT',
                    args: { expr: { type: 'star', value: '*' } },
                    over: null,
                },
                as: 'total',
            },
        ];
        return this.parser.sqlify(ast);
    }
}
MysqlSession.BINARY_PREVIEW_BYTES = 4096;
MysqlSession.BINARY_TEXT_BYTES = 64 * 1024;
exports.default = MysqlSession;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbFNlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQU1uRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUM7OztHQUdHO0FBQ0gsTUFBTSxZQUFZO0lBT2hCLFlBQVksVUFBMEIsRUFBRSxNQUFxQixFQUFFLFNBQXNCO1FBSjdFLGFBQVEsR0FBRyxLQUFLLENBQUM7UUFDakIsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUl4QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUM3QixDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLElBQUksUUFBUTtRQUNWLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7SUFDbEMsQ0FBQztJQUVELFlBQVksQ0FBQyxLQUFhO1FBQ3hCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDckMsSUFBSSxVQUFrQixDQUFDO1lBQ3ZCLElBQUk7Z0JBQ0YsVUFBVSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUMvQztZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDVixPQUFPO2FBQ1I7WUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFzQixFQUFFLE9BQVksRUFBRSxFQUFFO2dCQUN6RSxJQUFJLEdBQUcsRUFB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