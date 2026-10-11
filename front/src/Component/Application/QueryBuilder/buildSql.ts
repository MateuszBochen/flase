/** model of query builder and SQL generated from it */

export type JoinKindType = 'INNER' | 'LEFT' | 'RIGHT';

export interface QbTableInterface {
  /** alias in query, unique */
  alias: string;
  table: string;
  x: number;
  y: number;
}

export interface QbJoinInterface {
  id: string;
  /** left side is the table which was in query first */
  left: {alias: string, column: string};
  right: {alias: string, column: string};
  kind: JoinKindType;
}

export type AggregateType = '' | 'COUNT' | 'COUNT DISTINCT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
export type OperatorType = '' | '=' | '<>' | '<' | '<=' | '>' | '>=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';

export interface QbColumnInterface {
  id: string;
  alias: string;
  /** column of table, * for all columns */
  column: string;
  /** name in result (AS) */
  as: string;
  show: boolean;
  aggregate: AggregateType;
  sort: '' | 'ASC' | 'DESC';
  operator: OperatorType;
  value: string;
}

export interface QbStateInterface {
  tables: QbTableInterface[];
  joins: QbJoinInterface[];
  columns: QbColumnInterface[];
  distinct: boolean;
  limit: string;
}

export const OPERATORS: OperatorType[] = ['=', '<>', '<', '<=', '>', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];
export const AGGREGATES: AggregateType[] = ['COUNT', 'COUNT DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'];

interface SqlQuotingInterface {
  identifier: (name: string) => string;
  value: (value: string) => string;
}

/** alias.column or alias.* */
const reference = (sql: SqlQuotingInterface, column: QbColumnInterface): string => column.column === '*'
  ? `${sql.identifier(column.alias)}.*`
  : `${sql.identifier(column.alias)}.${sql.identifier(column.column)}`;

const expression = (sql: SqlQuotingInterface, column: QbColumnInterface): string => {
  const name = reference(sql, column);
  switch (column.aggregate) {
    case '': return name;
    case 'COUNT DISTINCT': return `COUNT(DISTINCT ${name})`;
    // COUNT(alias.*) is not valid
    case 'COUNT': return column.column === '*' ? 'COUNT(*)' : `COUNT(${name})`;
    default: return `${column.aggregate}(${name})`;
  }
};

const condition = (sql: SqlQuotingInterface, column: QbColumnInterface): string | null => {
  if (!column.operator || column.column === '*' && !column.aggregate) return null;
  const left = expression(sql, column);
  switch (column.operator) {
    case 'IS NULL':
    case 'IS NOT NULL':
      return `${left} ${column.operator}`;
    case 'IN':
    case 'NOT IN': {
      const values = column.value.split(',').map((item) => item.trim()).filter((item) => item !== '');
      return values.length ? `${left} ${column.operator} (${values.map((item) => sql.value(item)).join(', ')})` : null;
    }
    default:
      return `${left} ${column.operator} ${sql.value(column.value)}`;
  }
};

/** order of joining - every next table is joined to tables already in query, tables without join are CROSS JOIN */
const joinPlan = (state: QbStateInterface): {alias: string, kind: string, conditions: QbJoinInterface[]}[] => {
  if (!state.tables.length) return [];
  const included = new Set<string>([state.tables[0].alias]);
  const plan: {alias: string, kind: string, conditions: QbJoinInterface[]}[] = [{alias: state.tables[0].alias, kind: '', conditions: []}];
  const waiting = state.tables.slice(1).map((table) => table.alias);
  while (waiting.length) {
    const index = waiting.findIndex((alias) => state.joins.some((join) => (join.left.alias === alias && included.has(join.right.alias))
      || (join.right.alias === alias && included.has(join.left.alias))));
    if (index < 0) {
      const alias = waiting.shift()!;
      plan.push({alias, kind: 'CROSS JOIN', conditions: []});
      included.add(alias);
      continue;
    }
    const alias = waiting.splice(index, 1)[0];
    const conditions = state.joins.filter((join) => (join.left.alias === alias && included.has(join.right.alias))
      || (join.right.alias === alias && included.has(join.left.alias)));
    // kind is written from side of the table already in query
    const first = conditions[0];
    const kind = first.right.alias === alias ? first.kind : first.kind === 'LEFT' ? 'RIGHT' : first.kind === 'RIGHT' ? 'LEFT' : first.kind;
    plan.push({alias, kind: `${kind} JOIN`, conditions});
    included.add(alias);
  }
  return plan;
};

/** SELECT of builder - tables are in the current database */
const buildSql = (state: QbStateInterface, sql: SqlQuotingInterface): string => {
  if (!state.tables.length) return '';
  const tableOf = new Map(state.tables.map((table) => [table.alias, table.table]));
  const source = (alias: string) => {
    const table = tableOf.get(alias)!;
    return table === alias ? sql.identifier(table) : `${sql.identifier(table)} AS ${sql.identifier(alias)}`;
  };
  // columns of removed tables are left out
  const columns = state.columns.filter((column) => tableOf.has(column.alias) && column.column);
  const shown = columns.filter((column) => column.show);
  const grouped = shown.some((column) => column.aggregate);

  const select = shown.length
    ? shown.map((column) => `${expression(sql, column)}${column.as.trim() ? ` AS ${sql.identifier(column.as.trim())}` : ''}`).join(',\n  ')
    : '*';
  const lines = [`SELECT ${state.distinct ? 'DISTINCT ' : ''}${select}`];

  joinPlan(state).forEach((item, index) => {
    if (index === 0) {
      lines.push(`FROM ${source(item.alias)}`);
      return;
    }
    const on = item.conditions
      .map((join) => `${sql.identifier(join.left.alias)}.${sql.identifier(join.left.column)} = ${sql.identifier(join.right.alias)}.${sql.identifier(join.right.column)}`)
      .join(' AND ');
    lines.push(`${item.kind} ${source(item.alias)}${on ? ` ON ${on}` : ''}`);
  });

  const where = columns.filter((column) => !column.aggregate).map((column) => condition(sql, column)).filter((item): item is string => !!item);
  if (where.length) lines.push(`WHERE ${where.join('\n  AND ')}`);
  if (grouped) {
    const groupBy = shown.filter((column) => !column.aggregate && column.column !== '*').map((column) => reference(sql, column));
    if (groupBy.length) lines.push(`GROUP BY ${groupBy.join(', ')}`);
  }
  const having = columns.filter((column) => column.aggregate).map((column) => condition(sql, column)).filter((item): item is string => !!item);
  if (having.length) lines.push(`HAVING ${having.join('\n  AND ')}`);
  const order = columns.filter((column) => column.sort && (column.column !== '*' || column.aggregate)).map((column) => `${expression(sql, column)} ${column.sort}`);
  if (order.length) lines.push(`ORDER BY ${order.join(', ')}`);
  const limit = Number(state.limit);
  if (state.limit.trim() && Number.isInteger(limit) && limit > 0) lines.push(`LIMIT ${limit}`);
  return lines.join('\n');
};

export default buildSql;
