import {AST} from 'node-sql-parser';


interface QueryInterface {
  query: string;
  parsed: AST[] | AST;

  changeQuery: (newQuery: string) => QueryInterface;

  getOnlyColumnsAsString: () => string;
}

export default QueryInterface;
