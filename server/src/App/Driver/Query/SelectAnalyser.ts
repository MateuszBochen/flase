import SelectFromType from '../../../Driver/Type/Data/SelectFromType';
import {SqlSyntaxInterface} from './SqlSyntax';
const { Parser } = require('node-sql-parser');

/**
 * Analysis of SELECT query shared by drivers - which table can be edited, how to count rows.
 * @author Mateusz Bochen
 */
class SelectAnalyser {
  private readonly options: {database: string};

  constructor(private readonly parser: typeof Parser, syntax: SqlSyntaxInterface) {
    this.options = {database: syntax.parserDatabase};
  }

  /** tables used in FROM */
  getFrom(query: string): SelectFromType[] {
    const ast = this.parser.astify(query, this.options);
    const statement = Array.isArray(ast) ? ast[0] : ast;
    return statement?.from || [];
  }

  /** table which rows can be edited in result of query, or reason why result is read only */
  getEditableTable(query: string): {table: SelectFromType | null, reason?: string} {
    let parsed;
    try {
      parsed = this.parser.astify(query, this.options);
    } catch (e) {
      return {table: null, reason: 'Query could not be analysed'};
    }

    const statements = Array.isArray(parsed) ? parsed : [parsed];
    const ast = statements[0];
    if (statements.length !== 1 || ast?.type !== 'select') {
      return {table: null, reason: 'Only single SELECT result can be edited'};
    }
    if (ast._next || ast.union) {
      return {table: null, reason: 'Result of UNION cannot be edited'};
    }
    if (ast.with) {
      return {table: null, reason: 'Result of WITH query cannot be edited'};
    }
    if (!ast.from?.length) {
      return {table: null, reason: 'Result does not come from a table'};
    }
    if (ast.from.length > 1) {
      return {table: null, reason: 'Result comes from more tables (JOIN)'};
    }
    if (!ast.from[0].table || ast.from[0].expr) {
      return {table: null, reason: 'Result comes from sub query'};
    }
    if (SelectAnalyser.isGrouped(ast)) {
      return {table: null, reason: 'Grouped or DISTINCT result cannot be edited'};
    }
    const columns = Array.isArray(ast.columns) ? ast.columns : [];
    if (columns.some((column: any) => column?.expr?.type === 'aggr_func')) {
      return {table: null, reason: 'Aggregated result cannot be edited'};
    }

    return {table: ast.from[0]};
  }

  /**
   * Select query changed into count query.
   * Grouped / distinct / UNION queries are wrapped into sub select so rows of result are counted, not rows of table.
   * Aggregates without GROUP BY (SELECT MAX(id) FROM t) have always one row.
   * Other queries just replace columns with COUNT(*) - sub select would fail on duplicated
   * column names (SELECT * FROM a JOIN b).
   */
  getCountQuery(query: string): string {
    return this.getCountPlan(query).countQuery;
  }

  /** count query and query whose plan estimates the rows (both without LIMIT and ORDER BY) */
  getCountPlan(query: string): {countQuery: string, rowsQuery: string} {
    const parsed = this.parser.astify(query, this.options);
    const statements = Array.isArray(parsed) ? parsed : [parsed];

    if (statements.length !== 1 || statements[0].type !== 'select') {
      throw new Error('Only single SELECT query can be counted');
    }

    const ast = statements[0];
    ast.limit = null;
    ast.orderby = null;
    const rowsQuery = this.parser.sqlify(ast, this.options);

    if (SelectAnalyser.isGrouped(ast) || ast._next || ast.union) {
      return {countQuery: `SELECT COUNT(*) AS total FROM (${rowsQuery}) AS flase_count`, rowsQuery};
    }
    const columns = Array.isArray(ast.columns) ? ast.columns : [];
    // window functions (COUNT(*) OVER ()) keep all rows
    if (columns.some((column: any) => column?.expr?.type === 'aggr_func' && !column.expr.over)) {
      return {countQuery: 'SELECT 1 AS total', rowsQuery};
    }

    ast.columns = [
      {
        expr: {
          type: 'aggr_func',
          name: 'COUNT',
          args: {expr: {type: 'star', value: '*'}},
          over: null,
        },
        as: 'total',
      },
    ];

    return {countQuery: this.parser.sqlify(ast, this.options), rowsQuery};
  }

  /** DISTINCT, GROUP BY or HAVING - rows of result are not rows of table. PostgreSQL AST has distinct {type: null} without DISTINCT */
  private static isGrouped(ast: any): boolean {
    const distinct = typeof ast.distinct === 'object' && ast.distinct !== null ? ast.distinct.type : ast.distinct;
    const groupBy = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby?.columns;
    return !!distinct || !!groupBy?.length || !!ast.having;
  }
}

export default SelectAnalyser;
