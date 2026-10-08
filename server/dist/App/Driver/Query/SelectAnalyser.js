"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Parser } = require('node-sql-parser');
/**
 * Analysis of SELECT query shared by drivers - which table can be edited, how to count rows.
 * @author Mateusz Bochen
 */
class SelectAnalyser {
    constructor(parser, dialect) {
        this.parser = parser;
        this.options = { database: dialect === 'postgresql' ? 'postgresql' : 'mysql' };
    }
    /** tables used in FROM */
    getFrom(query) {
        const ast = this.parser.astify(query, this.options);
        const statement = Array.isArray(ast) ? ast[0] : ast;
        return (statement === null || statement === void 0 ? void 0 : statement.from) || [];
    }
    /** table which rows can be edited in result of query, or reason why result is read only */
    getEditableTable(query) {
        var _a;
        let parsed;
        try {
            parsed = this.parser.astify(query, this.options);
        }
        catch (e) {
            return { table: null, reason: 'Query could not be analysed' };
        }
        const statements = Array.isArray(parsed) ? parsed : [parsed];
        const ast = statements[0];
        if (statements.length !== 1 || (ast === null || ast === void 0 ? void 0 : ast.type) !== 'select') {
            return { table: null, reason: 'Only single SELECT result can be edited' };
        }
        if (ast._next || ast.union) {
            return { table: null, reason: 'Result of UNION cannot be edited' };
        }
        if (ast.with) {
            return { table: null, reason: 'Result of WITH query cannot be edited' };
        }
        if (!((_a = ast.from) === null || _a === void 0 ? void 0 : _a.length)) {
            return { table: null, reason: 'Result does not come from a table' };
        }
        if (ast.from.length > 1) {
            return { table: null, reason: 'Result comes from more tables (JOIN)' };
        }
        if (!ast.from[0].table || ast.from[0].expr) {
            return { table: null, reason: 'Result comes from sub query' };
        }
        if (SelectAnalyser.isGrouped(ast)) {
            return { table: null, reason: 'Grouped or DISTINCT result cannot be edited' };
        }
        const columns = Array.isArray(ast.columns) ? ast.columns : [];
        if (columns.some((column) => { var _a; return ((_a = column === null || column === void 0 ? void 0 : column.expr) === null || _a === void 0 ? void 0 : _a.type) === 'aggr_func'; })) {
            return { table: null, reason: 'Aggregated result cannot be edited' };
        }
        return { table: ast.from[0] };
    }
    /**
     * Select query changed into count query.
     * Grouped / distinct queries are wrapped into sub select so groups are counted, not rows.
     * Other queries just replace columns with COUNT(*) - sub select would fail on duplicated
     * column names (SELECT * FROM a JOIN b).
     */
    getCountQuery(query) {
        const parsed = this.parser.astify(query, this.options);
        const statements = Array.isArray(parsed) ? parsed : [parsed];
        if (statements.length !== 1 || statements[0].type !== 'select') {
            throw new Error('Only single SELECT query can be counted');
        }
        const ast = statements[0];
        ast.limit = null;
        ast.orderby = null;
        if (SelectAnalyser.isGrouped(ast)) {
            return `SELECT COUNT(*) AS total FROM (${this.parser.sqlify(ast, this.options)}) AS flase_count`;
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
        return this.parser.sqlify(ast, this.options);
    }
    /** DISTINCT, GROUP BY or HAVING - rows of result are not rows of table. PostgreSQL AST has distinct {type: null} without DISTINCT */
    static isGrouped(ast) {
        var _a;
        const distinct = typeof ast.distinct === 'object' && ast.distinct !== null ? ast.distinct.type : ast.distinct;
        const groupBy = Array.isArray(ast.groupby) ? ast.groupby : (_a = ast.groupby) === null || _a === void 0 ? void 0 : _a.columns;
        return !!distinct || !!(groupBy === null || groupBy === void 0 ? void 0 : groupBy.length) || !!ast.having;
    }
}
exports.default = SelectAnalyser;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VsZWN0QW5hbHlzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9RdWVyeS9TZWxlY3RBbmFseXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU5Qzs7O0dBR0c7QUFDSCxNQUFNLGNBQWM7SUFHbEIsWUFBNkIsTUFBcUIsRUFBRSxPQUF1QjtRQUE5QyxXQUFNLEdBQU4sTUFBTSxDQUFlO1FBQ2hELElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBQyxRQUFRLEVBQUUsT0FBTyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUMsQ0FBQztJQUMvRSxDQUFDO0lBRUQsMEJBQTBCO0lBQzFCLE9BQU8sQ0FBQyxLQUFhO1FBQ25CLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7UUFDcEQsT0FBTyxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxJQUFJLEtBQUksRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFRCwyRkFBMkY7SUFDM0YsZ0JBQWdCLENBQUMsS0FBYTs7UUFDNUIsSUFBSSxNQUFNLENBQUM7UUFDWCxJQUFJO1lBQ0YsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDbEQ7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLE9BQU8sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBQyxDQUFDO1NBQzdEO1FBRUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdELE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixJQUFJLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLElBQUksTUFBSyxRQUFRLEVBQUU7WUFDckQsT0FBTyxFQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLHlDQUF5QyxFQUFDLENBQUM7U0FDekU7UUFDRCxJQUFJLEdBQUcsQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtZQUMxQixPQUFPLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsa0NBQWtDLEVBQUMsQ0FBQztTQUNsRTtRQUNELElBQUksR0FBRyxDQUFDLElBQUksRUFBRTtZQUNaLE9BQU8sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSx1Q0FBdUMsRUFBQyxDQUFDO1NBQ3ZFO1FBQ0QsSUFBSSxDQUFDLENBQUEsTUFBQSxHQUFHLENBQUMsSUFBSSwwQ0FBRSxNQUFNLENBQUEsRUFBRTtZQUNyQixPQUFPLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsbUNBQW1DLEVBQUMsQ0FBQztTQUNuRTtRQUNELElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQ3ZCLE9BQU8sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxzQ0FBc0MsRUFBQyxDQUFDO1NBQ3RFO1FBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO1lBQzFDLE9BQU8sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBQyxDQUFDO1NBQzdEO1FBQ0QsSUFBSSxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSw2Q0FBNkMsRUFBQyxDQUFDO1NBQzdFO1FBQ0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUM5RCxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFXLEVBQUUsRUFBRSxXQUFDLE9BQUEsQ0FBQSxNQUFBLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxJQUFJLDBDQUFFLElBQUksTUFBSyxXQUFXLENBQUEsRUFBQSxDQUFDLEVBQUU7WUFDckUsT0FBTyxFQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLG9DQUFvQyxFQUFDLENBQUM7U0FDcEU7UUFFRCxPQUFPLEVBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxhQUFhLENBQUMsS0FBYTtRQUN6QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU3RCxJQUFJLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO1lBQzlELE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztTQUM1RDtRQUVELE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixHQUFHLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNqQixHQUFHLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUVuQixJQUFJLGNBQWMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDakMsT0FBTyxrQ0FBa0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUM7U0FDbEc7UUFFRCxHQUFHLENBQUMsT0FBTyxHQUFHO1lBQ1o7Z0JBQ0UsSUFBSSxFQUFFO29CQUNKLElBQUksRUFBRSxXQUFXO29CQUNqQixJQUFJLEVBQUUsT0FBTztvQkFDYixJQUFJLEVBQUUsRUFBQyxJQUFJLEVBQUUsRUFBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUMsRUFBQztvQkFDeEMsSUFBSSxFQUFFLElBQUk7aUJBQ1g7Z0JBQ0QsRUFBRSxFQUFFLE9BQU87YUFDWjtTQUNGLENBQUM7UUFFRixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELHFJQUFxSTtJQUM3SCxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQVE7O1FBQy9CLE1BQU0sUUFBUSxHQUFHLE9BQU8sR0FBRyxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksR0FBRyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQzlHLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFBLEdBQUcsQ0FBQyxPQUFPLDBDQUFFLE9BQU8sQ0FBQztRQUNoRixPQUFPLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLE1BQU0sQ0FBQSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO0lBQ3pELENBQUM7Q0FDRjtBQUVELGtCQUFlLGNBQWMsQ0FBQyJ9