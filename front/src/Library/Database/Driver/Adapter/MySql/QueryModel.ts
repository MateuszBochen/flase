import QueryInterface from '../../../Interface/QueryInterface';
import {AST, Parser, Select} from 'node-sql-parser';
import toast from 'react-hot-toast';


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
}

export default QueryModel;
