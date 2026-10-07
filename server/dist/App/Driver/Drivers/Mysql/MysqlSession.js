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
    constructor(connection, parser) {
        this.released = false;
        this.connection = connection;
        this.parser = parser;
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
                resultFields.forEach((field) => { var _a; return flatRow[field.key] = (_a = row[field.table]) === null || _a === void 0 ? void 0 : _a[field.name]; });
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
    release() {
        if (this.released) {
            return;
        }
        this.released = true;
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
exports.default = MysqlSession;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbFNlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQUtuRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUM7OztHQUdHO0FBQ0gsTUFBTSxZQUFZO0lBS2hCLFlBQVksVUFBMEIsRUFBRSxNQUFxQjtRQUZyRCxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBR3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxZQUFZLENBQUMsS0FBYTtRQUN4QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3JDLElBQUksVUFBa0IsQ0FBQztZQUN2QixJQUFJO2dCQUNGLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDL0M7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsT0FBTzthQUNSO1lBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBc0IsRUFBRSxPQUFZLEVBQUUsRUFBRTtnQkFDekUsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNaLE9BQU87aUJBQ1I7Z0JBQ0QsT0FBTyxDQUFDLElBQUksdUJBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2hELENBQUMsQ0FBQyxDQUFD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