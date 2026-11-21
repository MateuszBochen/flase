/** one step of execution plan - the same shape for plans of all databases, drivers parse their EXPLAIN into it (driver.parsePlan) */
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

/** number of plan value (number or numeric text) */
export const planNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** text of plan value - lists joined, objects as JSON */
export const planText = (value: unknown): string => Array.isArray(value) ? value.map(planText).join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** the biggest value of metric in tree - bars of steps are relative to it */
export const maxOf = (node: PlanNodeType, metric: (node: PlanNodeType) => number | undefined): number =>
  Math.max(metric(node) ?? 0, ...node.children.map((child) => maxOf(child, metric)));
