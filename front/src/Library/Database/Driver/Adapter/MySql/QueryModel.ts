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

  constructor(defaultQuery: string, parser: Parser) {
      this.query = defaultQuery;
      this.parsed = parser.astify(defaultQuery);
      this.parser = parser;
  }

  changeQuery(newQuery: string): QueryInterface {
    try {
      return new QueryModel(newQuery, this.parser);
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

    return this.changeQuery(this.parser.sqlify(localParsed));
  }

  changeOrder(sortOrder: SortTableItemInterface[]): QueryInterface {
    const localParsed: AST  = {...this.parsed} as Select;
    localParsed.orderby = sortOrder.map((sortTableOrder) => {
      return { expr: { type: "column_ref", column: sortTableOrder.column.name }, type: sortTableOrder.direction }
    });

    return this.changeQuery(this.parser.sqlify(localParsed));
  }
}

export default QueryModel;
