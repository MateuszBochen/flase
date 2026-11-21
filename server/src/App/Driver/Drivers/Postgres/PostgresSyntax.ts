import {SqlSyntaxInterface} from '../../Query/SqlSyntax';

/** lexical rules of PostgreSQL / CockroachDB / YugabyteDB */
export const POSTGRES_SYNTAX: SqlSyntaxInterface = {
  stringQuotes: ["'"],
  identifierQuotes: ['"'],
  backslashEscapes: 'escape-strings',
  hashComments: false,
  dashCommentNeedsSpace: false,
  nestedBlockComments: true,
  executableComments: false,
  dollarQuotes: true,
  delimiterCommand: false,
  parserDatabase: 'postgresql',
  quoteIdentifier: (name) => `"${name.replace(/"/g, '""')}"`,
};
