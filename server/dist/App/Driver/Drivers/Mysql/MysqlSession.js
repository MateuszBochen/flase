"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const TotalCountDto_1 = __importDefault(require("../../../../Driver/Dto/TotalCountDto"));
const RowDto_1 = __importDefault(require("../../../../Driver/Dto/RowDto"));
const BinaryValue_1 = require("../BinaryValue");
/**
 * Single pooled mysql connection with selected database
 * @author Mateusz Bochen
 */
class MysqlSession {
    constructor(connection, analyser, onRelease) {
        this.released = false;
        this.cancelled = false;
        this.connection = connection;
        this.analyser = analyser;
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
                countQuery = this.analyser.getCountQuery(query);
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
                resultFields.forEach((field) => { var _a; return flatRow[field.key] = BinaryValue_1.serializeBinaryValue((_a = row[field.table]) === null || _a === void 0 ? void 0 : _a[field.name]); });
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
                    resultFields.forEach((field) => { var _a; return flatRow[field.key] = BinaryValue_1.serializeBinaryValue((_a = row[field.table]) === null || _a === void 0 ? void 0 : _a[field.name]); });
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
    async setReadOnly() {
        await this.query('SET SESSION TRANSACTION READ ONLY');
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
}
exports.default = MysqlSession;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbFNlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQU9uRCxnREFBb0Q7QUFFcEQ7OztHQUdHO0FBQ0gsTUFBTSxZQUFZO0lBT2hCLFlBQVksVUFBMEIsRUFBRSxRQUF3QixFQUFFLFNBQXNCO1FBSmhGLGFBQVEsR0FBRyxLQUFLLENBQUM7UUFDakIsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUl4QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUM3QixDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLElBQUksUUFBUTtRQUNWLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7SUFDbEMsQ0FBQztJQUVELFlBQVksQ0FBQyxLQUFhO1FBQ3hCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDckMsSUFBSSxVQUFrQixDQUFDO1lBQ3ZCLElBQUk7Z0JBQ0YsVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ2pEO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1YsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNWLE9BQU87YUFDUjtZQUVELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQXNCLEVBQUUsT0FBWSxFQUFFLEVBQUU7Z0JBQ3pFLElBQUksR0FBRyxFQUFFO29CQUNQLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFD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