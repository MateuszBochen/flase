/** one step of execution plan - the same shape for PostgreSQL, MySQL and MariaDB plans */
export type PlanNodeType = {
  /** operation, e.g. Seq Scan, Nested loop, Full table scan */
  title: string;
  /** table, index or alias the operation reads */
  object?: string;
  /** estimated rows - all loops, like actualRows */
  rows?: number;
  /** rows really returned (ANALYZE) - all loops */
  actualRows?: number;
  /** estimated cost - units of the server, compared only inside one plan */
  cost?: number;
  /** milliseconds of the step with its children (ANALYZE) */
  time?: number;
  /** reason to look at the step: full scan, filesort, temporary table */
  warning?: string;
  details: [string, string][];
  children: PlanNodeType[];
};

export type PlanType = {
  root: PlanNodeType;
  /** planning / execution time of the whole statement */
  totals: [string, string][];
};

const number = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

const text = (value: unknown): string => Array.isArray(value) ? value.map(text).join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** EXPLAIN (FORMAT JSON) of PostgreSQL, also with ANALYZE */
const DETAIL_KEYS_PG = [
  'Join Type', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Filter', 'Rows Removed by Filter',
  'Rows Removed by Join Filter', 'Sort Key', 'Sort Method', 'Group Key', 'Strategy', 'Scan Direction', 'Startup Cost',
  'Total Cost', 'Plan Width', 'Actual Loops', 'Shared Hit Blocks', 'Shared Read Blocks', 'Temp Read Blocks', 'Temp Written Blocks',
  'Workers Planned', 'Workers Launched', 'Subplan Name', 'CTE Name', 'Function Name', 'Parent Relationship',
];

const postgresNode = (plan: any): PlanNodeType => {
  const loops = number(plan['Actual Loops']) ?? 1;
  const relation = plan['Relation Name'] ? `${plan['Schema'] ? plan['Schema'] + '.' : ''}${plan['Relation Name']}` : undefined;
  const object = [relation, plan['Index Name'] && `index ${plan['Index Name']}`, plan['Alias'] && plan['Alias'] !== plan['Relation Name'] ? `as ${plan['Alias']}` : null]
    .filter(Boolean).join(' ') || plan['CTE Name'] || plan['Function Name'] || undefined;
  const type: string = plan['Node Type'] || 'Step';
  const actual = number(plan['Actual Rows']);
  const time = number(plan['Actual Total Time']);
  const estimate = number(plan['Plan Rows']);
  return {
    title: plan['Join Type'] && /Join|Nested Loop/.test(type) ? `${type} (${plan['Join Type']})` : plan['Strategy'] && type === 'Aggregate' ? `${plan['Strategy']} Aggregate` : type,
    object,
    // rows of plan are per loop - inner side of nested loop runs many times
    rows: estimate !== undefined ? estimate * loops : undefined,
    actualRows: actual !== undefined ? actual * loops : undefined,
    cost: number(plan['Total Cost']),
    time: time !== undefined ? time * loops : undefined,
    warning: type === 'Seq Scan' ? 'Full table scan' : number(plan['Temp Written Blocks']) ? 'Uses temporary files' : undefined,
    details: DETAIL_KEYS_PG.filter((key) => plan[key] !== undefined && plan[key] !== '' && !(key === 'Join Type' && plan['Join Type'] === 'Inner'))
      .map((key) => [key, text(plan[key])]),
    children: (plan['Plans'] || []).map(postgresNode),
  };
};

const postgresPlan = (json: any): PlanType => {
  const top = Array.isArray(json) ? json[0] : json;
  const totals: [string, string][] = [];
  if (top['Planning Time'] !== undefined) totals.push(['Planning', `${top['Planning Time']} ms`]);
  if (top['Execution Time'] !== undefined) totals.push(['Execution', `${top['Execution Time']} ms`]);
  return {root: postgresNode(top['Plan']), totals};
};

/** EXPLAIN FORMAT=JSON of MySQL and MariaDB, also ANALYZE FORMAT=JSON of MariaDB */
const ACCESS_TYPES: {[type: string]: string} = {
  ALL: 'Full table scan', index: 'Full index scan', range: 'Index range scan', ref: 'Index lookup', eq_ref: 'Unique index lookup',
  const: 'Single row (constant)', system: 'Single row (system)', ref_or_null: 'Index lookup or NULL', index_merge: 'Index merge',
  fulltext: 'Fulltext index', unique_subquery: 'Unique subquery', index_subquery: 'Index subquery', hash_ALL: 'Hash join (full scan)',
};

const TITLES: {[key: string]: string} = {
  query_block: 'Query', nested_loop: 'Nested loop', ordering_operation: 'Sort', grouping_operation: 'Group',
  duplicates_removal: 'Distinct', filesort: 'Filesort', temporary_table: 'Temporary table', read_sorted_file: 'Read sorted file',
  union_result: 'Union', materialized_from_subquery: 'Materialized subquery', windowing: 'Window functions', block_nl_join: 'Block nested loop',
};

/** keys which are only noise in tree */
const SKIPPED = new Set(['select_id', 'cost_info', 'r_engine_stats', 'query_optimization', 'used_columns']);

/** r_rows, r_loops... of MariaDB ANALYZE are real values */
const humanize = (key: string): string => TITLES[key]
  || (key.startsWith('r_') ? `Actual ${key.slice(2)}` : key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, ' ');

const mysqlNode = (key: string, value: any): PlanNodeType => {
  const node: PlanNodeType = {title: humanize(key), details: [], children: []};
  if (key === 'table') {
    node.title = ACCESS_TYPES[value.access_type] || value.access_type || 'Table';
    node.object = [value.table_name, value.key && `index ${value.key}`].filter(Boolean).join(' ');
    const loops = number(value.r_loops) ?? 1;
    // MariaDB: rows per loop with estimated loops, MySQL: rows per scan
    const estimate = number(value.rows_examined_per_scan) ?? number(value.rows);
    node.rows = estimate !== undefined ? estimate * (number(value.loops) ?? 1) : undefined;
    const actual = number(value.r_rows);
    node.actualRows = actual !== undefined ? actual * loops : undefined;
    const time = (number(value.r_table_time_ms) ?? 0) + (number(value.r_other_time_ms) ?? 0);
    node.time = value.r_table_time_ms !== undefined ? time : undefined;
    if (value.access_type === 'ALL' || value.access_type === 'hash_ALL') node.warning = 'Full table scan';
    else if (value.access_type === 'index') node.warning = 'Full index scan';
  }
  if (key === 'query_block' && value.select_id !== undefined) node.title = `Query #${value.select_id}`;
  node.cost = number(value.cost_info?.prefix_cost) ?? number(value.cost_info?.query_cost) ?? number(value.cost);
  if (node.time === undefined) node.time = number(value.r_total_time_ms);
  if (value.using_filesort === true || key === 'filesort') node.warning = node.warning || 'Filesort';
  if (value.using_temporary_table === true || key === 'temporary_table') node.warning = node.warning || 'Temporary table';

  Object.entries(value).forEach(([name, item]: [string, any]) => {
    if (SKIPPED.has(name) || (key === 'table' && /^(table_name|access_type|key|rows|rows_examined_per_scan|r_rows|r_loops|cost|r_table_time_ms|r_other_time_ms)$/.test(name))
      || name === 'r_total_time_ms' || name === 'cost') {
      return;
    }
    if (Array.isArray(item) && item.some((element) => element && typeof element === 'object')) {
      // nested_loop: [{table: ...}, ...], query_specifications / subqueries: [{query_block: ...}]
      const children = item.map((element: any) => {
        const keys = Object.keys(element).filter((elementKey) => element[elementKey] && typeof element[elementKey] === 'object' && !SKIPPED.has(elementKey));
        return keys.length === 1 && Object.keys(element).length <= 3 ? mysqlNode(keys[0], element[keys[0]]) : mysqlNode(name, element);
      });
      if (name === 'nested_loop') {
        node.children.push({title: 'Nested loop', details: [], children});
      } else {
        node.children.push(...children.map((child) => child.title === humanize(name) ? child : {...child, title: `${humanize(name)}: ${child.title}`}));
      }
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      node.children.push(mysqlNode(name, item));
    } else {
      node.details.push([humanize(name), text(item)]);
    }
  });
  if (value.cost_info) {
    Object.entries(value.cost_info).forEach(([name, item]) => node.details.push([humanize(name), text(item)]));
  }
  return node;
};

const mysqlPlan = (json: any): PlanType => {
  const totals: [string, string][] = [];
  const optimization = number(json.query_optimization?.r_total_time_ms);
  if (optimization !== undefined) totals.push(['Optimization', `${optimization.toFixed(3)} ms`]);
  const execution = number(json.query_block?.r_total_time_ms);
  if (execution !== undefined) totals.push(['Execution', `${execution.toFixed(3)} ms`]);
  return {root: mysqlNode('query_block', json.query_block || json), totals};
};

/**
 * EXPLAIN ANALYZE (FORMAT=TREE) of MySQL - text tree, 4 spaces of indentation per level:
 * -> Nested loop inner join  (cost=94.5 rows=125) (actual time=0.0647..0.274 rows=125 loops=1)
 */
const treePlan = (output: string): PlanType => {
  const root: PlanNodeType = {title: 'Query', details: [], children: []};
  const stack: {depth: number, node: PlanNodeType}[] = [{depth: -1, node: root}];
  output.split('\n').forEach((line) => {
    const arrow = line.indexOf('-> ');
    if (arrow < 0) return;
    const depth = arrow / 4;
    let rest = line.slice(arrow + 3);
    const node: PlanNodeType = {title: rest, details: [], children: []};
    const estimate = /\(cost=([\d.e+-]+)(?:\.\.([\d.e+-]+))? rows=([\d.e+-]+)\)/.exec(rest);
    const actual = /\(actual time=([\d.e+-]+)\.\.([\d.e+-]+) rows=([\d.e+-]+) loops=(\d+)\)/.exec(rest);
    const loops = actual ? number(actual[4]) ?? 1 : 1;
    if (estimate) {
      node.cost = number(estimate[2] ?? estimate[1]);
      // rows are per loop
      node.rows = (number(estimate[3]) ?? 0) * loops;
    }
    if (actual) {
      node.time = (number(actual[2]) ?? 0) * loops;
      node.actualRows = (number(actual[3]) ?? 0) * loops;
      node.details.push(['Loops', String(loops)], ['First row', `${actual[1]} ms`]);
    }
    rest = rest.replace(/\s*\((cost|actual time)=[^)]*\)/g, '').trim();
    // "Table scan on o", "Index lookup on c using PRIMARY (id=o.customer_id)", "Filter: (o.status = 'paid')"
    const on = /^(.*?) on (\S+)(?: using (\S+))?(.*)$/.exec(rest);
    const colon = /^([^:(]+):\s*(.*)$/.exec(rest);
    if (on && !colon) {
      node.title = on[1];
      node.object = [on[2], on[3] && `index ${on[3]}`].filter(Boolean).join(' ');
      if (on[4].trim()) node.details.push(['Condition', on[4].trim()]);
    } else if (colon) {
      node.title = colon[1];
      node.details.unshift([colon[1], colon[2]]);
    } else {
      node.title = rest;
    }
    if (/^Table scan$/.test(node.title) && node.object && !node.object.startsWith('<')) node.warning = 'Full table scan';
    else if (/^Index scan$/.test(node.title)) node.warning = 'Full index scan';
    else if (/temporary/i.test(node.title)) node.warning = 'Temporary table';
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({depth, node});
  });
  const single = root.children.length === 1 ? root.children[0] : root;
  return {root: single, totals: single.time !== undefined ? [['Execution', `${single.time.toFixed(3)} ms`]] : []};
};

/** plan of EXPLAIN output - value of its single cell (JSON text, parsed JSON of PostgreSQL or text tree), null when not known format */
export const parsePlan = (output: unknown): PlanType | null => {
  try {
    if (typeof output === 'string' && /^\s*->/.test(output)) return treePlan(output);
    const json = typeof output === 'string' ? JSON.parse(output) : output;
    if (!json || typeof json !== 'object') return null;
    const top = Array.isArray(json) ? json[0] : json;
    if (top?.Plan) return postgresPlan(json);
    if (top?.query_block) return mysqlPlan(top);
    return null;
  } catch (e) {
    return null;
  }
};

/** the biggest value of metric in tree - bars of steps are relative to it */
export const maxOf = (node: PlanNodeType, metric: (node: PlanNodeType) => number | undefined): number =>
  Math.max(metric(node) ?? 0, ...node.children.map((child) => maxOf(child, metric)));
