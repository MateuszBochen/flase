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
            this.connection.query(query)
                .on('error', (error) => observer.error(error))
                .on('fields', (fields) => {
                if (onFields && fields) {
                    onFields(fields.map((field) => field.name));
                }
            })
                .on('result', (row) => observer.next(new RowDto_1.default(row)))
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
    release() {
        if (this.released) {
            return;
        }
        this.released = true;
        this.connection.release();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbFNlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwrQkFBZ0M7QUFHaEMseUZBQWlFO0FBQ2pFLDJFQUFtRDtBQUduRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUM7OztHQUdHO0FBQ0gsTUFBTSxZQUFZO0lBS2hCLFlBQVksVUFBMEIsRUFBRSxNQUFxQjtRQUZyRCxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBR3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxZQUFZLENBQUMsS0FBYTtRQUN4QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3JDLElBQUksVUFBa0IsQ0FBQztZQUN2QixJQUFJO2dCQUNGLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDL0M7WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDVixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsT0FBTzthQUNSO1lBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBc0IsRUFBRSxPQUFZLEVBQUUsRUFBRTtnQkFDekUsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNaLE9BQU87aUJBQ1I7Z0JBQ0QsT0FBTyxDQUFDLElBQUksdUJBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2hELENBQUMsQ0FBQyxDQUFD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