import {SqlSyntaxInterface} from '../../Syntax/SqlSyntax';

/** lexical rules of MySQL / MariaDB / TiDB */
export const MYSQL_SYNTAX: SqlSyntaxInterface = {
  stringQuotes: ["'", '"'],
  identifierQuotes: ['`'],
  backslashEscapes: 'all',
  hashComments: true,
  dashCommentNeedsSpace: true,
  nestedBlockComments: false,
  executableComments: true,
  dollarQuotes: false,
  delimiterCommand: true,
  caseInsensitiveNames: true,
  isSystemTable: (name) => /^dual$/i.test(name),
};
