import QueryInterface from '../../../Interface/QueryInterface';
import {AST, Parser, Select, Update} from 'node-sql-parser';
import toast from 'react-hot-toast';
import ColumnInterface from '../../../../Table/Interface/ColumnInterface';
import {DirectionOrder} from '../../../../../Component/Table/Enum/DirectionOrder';
import SortTableItemInterface from '../../../../../Component/Table/Interface/SortTableItemInterface';


class QueryModel implements QueryInterface {

  public parsed: AST[] | AST;
  public query: string;
  private readonly parser: Parser;
  /** dialect of parser - mysql or postgresql */
  private readonly options: {database: string};

  constructor(defaultQuery: string, parser: Parser, options: {database: string} = {database: 'mysql'}) {
      this.query = defaultQuery;
      this.options = options;
      this.parsed = parser.astify(defaultQuery, options);
      this.parser = parser;
  }

  changeQuery(newQuery: string): QueryInterface {
    try {
      return new QueryModel(newQuery, this.parser, this.options);
    } catch (e) {
      toast.error('SQL syntax error');
      console.log(e);
      return this;
    }
  }

  getOnlyColumnsAsString(): string {
    try {
      const localParsed: Select | Select[] = {...this.parsed} as Select | Select[];
      const selectAst = Array.isArray(localParsed) ? localParsed[0] : localParsed;

      if (!selectAst || selectAst.type !== 'select') {
        throw new Error('Not a SELECT query');
      }

      const columns = selectAst.columns.map(col => col.expr.column);
      return columns.join(',');
    } catch (error) {
      console.error('Error parsing SQL:', error);
      return '';
    }
  }

  getRecordsLimits(): {offset: number, limit: number} {
    if (Array.isArray(this.parsed)) {
      return {offset: 0, limit: 100};
    }
    const localParsed: AST  = {...this.parsed} as Select;

    if (!localParsed.limit?.seperator) {
      return {offset: 0, limit: 100};
    }

    if (localParsed.limit.seperator === ',') {
      return {offset: localParsed.limit?.value[0].value || 0, limit: localParsed.limit?.value[1].value || 100};
    }

    return {offset: localParsed.limit?.value[1].value || 0, limit: localParsed.limit?.value[0].value || 100};
  }

  changeOffset(offset: number): QueryInterface
  {
    const localParsed: AST  = {...this.parsed} as Select;

    if (!localParsed.limit?.seperator) {
      return this;
    }

    if (localParsed.limit.seperator === ',') {
      localParsed.limit.value[0].value = offset;
    } else {
      localParsed.limit.value[1].value = offset;
    }

    return this.changeQuery(this.parser.sqlify(localParsed, this.options));
  }

  changeOrder(sortOrder: SortTableItemInterface[]): QueryInterface {
    const localParsed: AST  = {...this.parsed} as Select;
    localParsed.orderby = sortOrder.map((sortTableOrder) => {
      const column = sortTableOrder.column;
      // name repeated in result (JOIN) must be qualified by table alias
      const table = column.key !== column.name && column.alias ? column.alias : null;
      return { expr: { type: "column_ref", table, column: column.name }, type: sortTableOrder.direction }
    });

    return this.changeQuery(this.parser.sqlify(localParsed, this.options));
  }

  getWhere(): string {
    const select = this.singleSelect();
    if (!select?.where) {
      return '';
    }
    const where = this.parser.exprToSQL(select.where as any, this.options);
    // default query of table uses WHERE 1 (MySQL)
    return where === '1' || /^true$/i.test(where) ? '' : where;
  }

  changeWhere(where: string): QueryInterface {
    const select = this.singleSelect();
    if (!select) {
      throw new Error('Filter works only for single SELECT query');
    }
    // parsed AST is shared with history, work on a copy
    const ast = JSON.parse(JSON.stringify(select));
    const condition = where.trim();
    ast.where = condition ? (this.parser.astify(`SELECT 1 FROM t WHERE ${condition}`, this.options) as Select).where : null;

    if (ast.limit?.seperator === ',') {
      ast.limit.value[0].value = 0;
    } else if (ast.limit?.seperator === 'offset') {
      ast.limit.value[1].value = 0;
    }

    return new QueryModel(this.parser.sqlify(ast, this.options), this.parser, this.options);
  }

  withoutLimit(): QueryInterface {
    const select = this.singleSelect();
    if (!select?.limit) {
      return this;
    }
    const ast = JSON.parse(JSON.stringify(select));
    ast.limit = null;
    return new QueryModel(this.parser.sqlify(ast, this.options), this.parser, this.options);
  }

  private singleSelect(): Select | null {
    const statement = Array.isArray(this.parsed) ? (this.parsed.length === 1 ? this.parsed[0] : null) : this.parsed;
    return statement && statement.type === 'select' ? statement as Select : null;
  }
}

export default QueryModel;
