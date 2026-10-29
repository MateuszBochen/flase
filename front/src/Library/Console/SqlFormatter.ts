import SqlDialectType from '../Database/Driver/SqlDialectType';
import {SqlTokenType, tokenizeSql} from './SqlTokenizer';

/**
 * Line breaks and indentation of SELECT - only whitespace between tokens is changed, strings, names
 * and comments stay as written. MySQL / MariaDB keep definition of view in one line (SHOW CREATE VIEW).
 */

const INDENT = '  ';
/** clauses on own line, their content on next lines */
const CLAUSES = new Set(['SELECT', 'FROM', 'WHERE', 'HAVING', 'WINDOW']);
/** clauses of two words - GROUP BY, ORDER BY */
const TWO_WORD_CLAUSES = new Set(['GROUP', 'ORDER']);
/** clauses on own line with content in the same line */
const INLINE_CLAUSES = new Set(['LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT', 'FETCH']);
const JOIN_START = new Set(['JOIN', 'LEFT', 'RIGHT', 'INNER', 'CROSS', 'NATURAL', 'FULL', 'STRAIGHT_JOIN']);
const JOIN_MODIFIERS = new Set(['LEFT', 'RIGHT', 'INNER', 'CROSS', 'NATURAL', 'FULL', 'OUTER']);

const upper = (token: SqlTokenType | undefined): string => token?.type === 'word' ? token.value.toUpperCase() : '';
const is = (token: SqlTokenType | undefined, value: string): boolean => !!token && token.type === 'symbol' && token.value === value;

type LevelType = {
  /** SELECT of query or subquery - its clauses are broken */
  query: boolean;
  /** (a JOIN b) after FROM / JOIN */
  tables: boolean;
  /** indentation of clauses of this level */
  indent: number;
  /** indentation of line with opening parenthesis - closing one is there */
  outer: number;
  /** ( after WHERE / HAVING / ON - AND / OR inside are broken */
  conditions: boolean;
  clause: string;
};

export const formatSql = (sql: string, dialect: SqlDialectType): string => {
  const tokens = tokenizeSql(sql, dialect);
  if (!tokens.length) return sql;
  const levels: LevelType[] = [{query: true, tables: false, indent: 0, outer: 0, conditions: false, clause: ''}];
  /** indentation of the current line */
  let line = 0;
  const breaks = new Map<number, number>();
  const breakAt = (index: number, indent: number) => {
    if (index > 0 && index < tokens.length) breaks.set(index, indent);
  };
  const lineOf = (index: number) => breaks.has(index) ? breaks.get(index)! : line;

  tokens.forEach((token, index) => {
    const top = levels[levels.length - 1];
    const keyword = upper(token);
    const previous = tokens[index - 1];
    line = lineOf(index);
    const inFrom = top.query && top.clause === 'FROM';

    if (is(token, '(')) {
      const next = upper(tokens[index + 1]);
      if (next === 'SELECT' || next === 'WITH') {
        levels.push({query: true, tables: false, indent: line + 1, outer: line, conditions: false, clause: ''});
      } else if ((inFrom || top.tables) && (is(previous, ',') || is(previous, '(') || /^(FROM|JOIN|STRAIGHT_JOIN)$/.test(upper(previous)))) {
        levels.push({query: false, tables: true, indent: line + 1, outer: line, conditions: false, clause: ''});
        breakAt(index + 1, line + 1);
      } else {
        const conditions = /^(WHERE|HAVING|ON)$/.test(upper(previous)) || (top.conditions && is(previous, '('));
        levels.push({query: false, tables: false, indent: line, outer: line, conditions, clause: ''});
      }
      return;
    }
    if (is(token, ')')) {
      const closed = levels.length > 1 ? levels.pop()! : top;
      if (closed.query || closed.tables) breakAt(index, closed.outer);
      return;
    }

    if (top.query && (CLAUSES.has(keyword) || (TWO_WORD_CLAUSES.has(keyword) && upper(tokens[index + 1]) === 'BY'))) {
      breakAt(index, top.indent);
      top.clause = keyword;
      // content after SELECT DISTINCT, GROUP BY
      let last = index;
      if (TWO_WORD_CLAUSES.has(keyword)) last++;
      while (/^(DISTINCT|ALL|DISTINCTROW|SQL_CALC_FOUND_ROWS|STRAIGHT_JOIN)$/.test(upper(tokens[last + 1])) && keyword === 'SELECT') last++;
      breakAt(last + 1, top.indent + 1);
      return;
    }
    if (top.query && INLINE_CLAUSES.has(keyword)) {
      breakAt(index, top.indent);
      top.clause = keyword;
      return;
    }
    // JOIN - first word of LEFT OUTER JOIN
    if ((inFrom || top.tables) && JOIN_START.has(keyword) && !(keyword === 'JOIN' && JOIN_MODIFIERS.has(upper(previous)))
      && !(keyword === 'STRAIGHT_JOIN' && upper(previous) === 'SELECT')) {
      breakAt(index, top.tables ? top.indent : top.indent + 1);
      return;
    }
    if ((keyword === 'AND' || keyword === 'OR') && (top.conditions || (top.query && /^(WHERE|HAVING)$/.test(top.clause)))) {
      breakAt(index, top.query ? top.indent + 1 : line);
      return;
    }
    if (is(token, ',') && top.query && /^(SELECT|FROM|GROUP|ORDER)$/.test(top.clause)) {
      breakAt(index + 1, top.indent + 1);
    }
  });

  let result = sql.slice(0, tokens[0].start);
  tokens.forEach((token, index) => {
    if (index > 0) {
      const gap = sql.slice(tokens[index - 1].end, token.start);
      if (breaks.has(index)) {
        // comment between tokens is kept
        const kept = gap.trim() ? gap.replace(/\s+$/, '') : '';
        result += `${kept.replace(/^\s+/, kept ? ' ' : '')}\n${INDENT.repeat(breaks.get(index)!)}`;
      } else {
        result += gap;
      }
    }
    result += sql.slice(token.start, token.end);
  });
  return result + sql.slice(tokens[tokens.length - 1].end);
};

/** CREATE VIEW in one line is formatted, other DDL is returned as it is */
export const formatViewDdl = (ddl: string, dialect: SqlDialectType): string => {
  if (/\n/.test(ddl.trim()) || !/^\s*CREATE\b[\s\S]*?\bVIEW\b/i.test(ddl)) return ddl;
  return formatSql(ddl, dialect);
};
