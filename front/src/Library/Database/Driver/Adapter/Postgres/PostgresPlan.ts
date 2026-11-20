import {PlanNodeType, PlanType, planNumber, planText} from '../../../../Console/ExplainPlan';

/** EXPLAIN (FORMAT JSON) of PostgreSQL, also with ANALYZE */
const DETAIL_KEYS_PG = [
  'Join Type', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Filter', 'Rows Removed by Filter',
  'Rows Removed by Join Filter', 'Sort Key', 'Sort Method', 'Group Key', 'Strategy', 'Scan Direction', 'Startup Cost',
  'Total Cost', 'Plan Width', 'Actual Loops', 'Shared Hit Blocks', 'Shared Read Blocks', 'Temp Read Blocks', 'Temp Written Blocks',
  'Workers Planned', 'Workers Launched', 'Subplan Name', 'CTE Name', 'Function Name', 'Parent Relationship',
];

const postgresNode = (plan: any): PlanNodeType => {
  const loops = planNumber(plan['Actual Loops']) ?? 1;
  const relation = plan['Relation Name'] ? `${plan['Schema'] ? plan['Schema'] + '.' : ''}${plan['Relation Name']}` : undefined;
  const object = [relation, plan['Index Name'] && `index ${plan['Index Name']}`, plan['Alias'] && plan['Alias'] !== plan['Relation Name'] ? `as ${plan['Alias']}` : null]
    .filter(Boolean).join(' ') || plan['CTE Name'] || plan['Function Name'] || undefined;
  const type: string = plan['Node Type'] || 'Step';
  const actual = planNumber(plan['Actual Rows']);
  const time = planNumber(plan['Actual Total Time']);
  const estimate = planNumber(plan['Plan Rows']);
  return {
    title: plan['Join Type'] && /Join|Nested Loop/.test(type) ? `${type} (${plan['Join Type']})` : plan['Strategy'] && type === 'Aggregate' ? `${plan['Strategy']} Aggregate` : type,
    object,
    // rows of plan are per loop - inner side of nested loop runs many times
    rows: estimate !== undefined ? estimate * loops : undefined,
    actualRows: actual !== undefined ? actual * loops : undefined,
    cost: planNumber(plan['Total Cost']),
    time: time !== undefined ? time * loops : undefined,
    warning: type === 'Seq Scan' ? 'Full table scan' : planNumber(plan['Temp Written Blocks']) ? 'Uses temporary files' : undefined,
    details: DETAIL_KEYS_PG.filter((key) => plan[key] !== undefined && plan[key] !== '' && !(key === 'Join Type' && plan['Join Type'] === 'Inner'))
      .map((key) => [key, planText(plan[key])]),
    children: (plan['Plans'] || []).map(postgresNode),
  };
};

export const postgresPlan = (json: any): PlanType => {
  const top = Array.isArray(json) ? json[0] : json;
  const totals: [string, string][] = [];
  if (top['Planning Time'] !== undefined) totals.push(['Planning', `${top['Planning Time']} ms`]);
  if (top['Execution Time'] !== undefined) totals.push(['Execution', `${top['Execution Time']} ms`]);
  return {root: postgresNode(top['Plan']), totals};
};


/** plan of EXPLAIN (FORMAT JSON) - parsed JSON or its text, null when not known format */
export const parsePostgresPlan = (output: unknown): PlanType | null => {
  try {
    const json = typeof output === 'string' ? JSON.parse(output) : output;
    if (!json || typeof json !== 'object') return null;
    const top = Array.isArray(json) ? json[0] : json;
    return top?.Plan ? postgresPlan(json) : null;
  } catch (e) {
    return null;
  }
};
