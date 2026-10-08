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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbFNlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQU1uRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUM7OztHQUdHO0FBQ0gsTUFBTSxZQUFZO0lBTWhCLFlBQVksVUFBMEIsRUFBRSxNQUFxQixFQUFFLFNBQXNCO1FBSDdFLGFBQVEsR0FBRyxLQUFLLENBQUM7UUFJdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDN0IsQ0FBQztJQUVELHVFQUF1RTtJQUN2RSxJQUFJLFFBQVE7UUFDVixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxZQUFZLENBQUMsS0FBYTtRQUN4QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3JDLElBQUksVUFBa0IsQ0FBQztZQUN2QixJQUFJO2dCQUNGLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDL0M7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsT0FBTzthQUNSO1lBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBc0IsRUFBRSxPQUFZLEVBQUUsRUFBRTtnQkFDekUsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsTUFBTSxDQUFDLEdBQUcsQ0FB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