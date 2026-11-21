import {PlanNodeType, PlanType, planNumber, planText} from '../../../../Console/ExplainPlan';

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
    const loops = planNumber(value.r_loops) ?? 1;
    // MariaDB: rows per loop with estimated loops, MySQL: rows per scan
    const estimate = planNumber(value.rows_examined_per_scan) ?? planNumber(value.rows);
    node.rows = estimate !== undefined ? estimate * (planNumber(value.loops) ?? 1) : undefined;
    const actual = planNumber(value.r_rows);
    node.actualRows = actual !== undefined ? actual * loops : undefined;
    const time = (planNumber(value.r_table_time_ms) ?? 0) + (planNumber(value.r_other_time_ms) ?? 0);
    node.time = value.r_table_time_ms !== undefined ? time : undefined;
    if (value.access_type === 'ALL' || value.access_type === 'hash_ALL') node.warning = 'Full table scan';
    else if (value.access_type === 'index') node.warning = 'Full index scan';
  }
  if (key === 'query_block' && value.select_id !== undefined) node.title = `Query #${value.select_id}`;
  node.cost = planNumber(value.cost_info?.prefix_cost) ?? planNumber(value.cost_info?.query_cost) ?? planNumber(value.cost);
  if (node.time === undefined) node.time = planNumber(value.r_total_time_ms);
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
      node.details.push([humanize(name), planText(item)]);
    }
  });
  if (value.cost_info) {
    Object.entries(value.cost_info).forEach(([name, item]) => node.details.push([humanize(name), planText(item)]));
  }
  return node;
};

const mysqlPlan = (json: any): PlanType => {
  const totals: [string, string][] = [];
  const optimization = planNumber(json.query_optimization?.r_total_time_ms);
  if (optimization !== undefined) totals.push(['Optimization', `${optimization.toFixed(3)} ms`]);
  const execution = planNumber(json.query_block?.r_total_time_ms);
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
    const loops = actual ? planNumber(actual[4]) ?? 1 : 1;
    if (estimate) {
      node.cost = planNumber(estimate[2] ?? estimate[1]);
      // rows are per loop
      node.rows = (planNumber(estimate[3]) ?? 0) * loops;
    }
    if (actual) {
      node.time = (planNumber(actual[2]) ?? 0) * loops;
      node.actualRows = (planNumber(actual[3]) ?? 0) * loops;
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

/** plan of EXPLAIN output - JSON text or text tree of EXPLAIN ANALYZE, null when not known format */
export const parseMysqlPlan = (output: unknown): PlanType | null => {
  try {
    if (typeof output === 'string' && /^\s*->/.test(output)) return treePlan(output);
    const json = typeof output === 'string' ? JSON.parse(output) : output;
    if (!json || typeof json !== 'object') return null;
    const top = Array.isArray(json) ? json[0] : json;
    return top?.query_block ? mysqlPlan(top) : null;
  } catch (e) {
    return null;
  }
};
