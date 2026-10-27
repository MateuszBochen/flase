import SqlDialectType from '../Database/Driver/SqlDialectType';
import {tokenizeSql} from './SqlTokenizer';

/** names of :parameters in statements, each once, in order of first use */
export const parametersOf = (statements: string[], dialect: SqlDialectType): string[] => {
  const names: string[] = [];
  statements.forEach((sql) => tokenizeSql(sql, dialect).forEach((token) => {
    if (token.type === 'param' && !names.includes(token.value)) {
      names.push(token.value);
    }
  }));
  return names;
};

/** :parameters replaced with SQL of their values (literals, already escaped) */
export const bindParameters = (sql: string, dialect: SqlDialectType, values: {[name: string]: string}): string => {
  let result = sql;
  tokenizeSql(sql, dialect)
    .filter((token) => token.type === 'param' && values[token.value] !== undefined)
    .reverse()
    .forEach((token) => {
      result = result.slice(0, token.start) + values[token.value] + result.slice(token.end);
    });
  return result;
};
