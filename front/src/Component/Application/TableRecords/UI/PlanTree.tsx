import React, {useMemo, useState} from 'react';
import {maxOf, PlanNodeType, PlanType} from '../../../../Library/Console/ExplainPlan';

interface PlanTreePropsInterface {
  plan: PlanType;
}

type FlatNodeType = {node: PlanNodeType, depth: number, path: string};

const formatNumber = (value: number | undefined, digits: number = 2): string => value === undefined
  ? ''
  : value >= 1000 ? Math.round(value).toLocaleString('en-US') : String(Number(value.toFixed(digits)));

/** estimate of rows is wrong 10 times or more - statistics of table can be old */
const isMisestimate = (node: PlanNodeType): boolean => node.rows !== undefined && node.actualRows !== undefined
  && Math.max(node.rows, node.actualRows) >= 10 * Math.max(Math.min(node.rows, node.actualRows), 1);

/** PlanTree - steps of execution plan with rows, cost and time; bar shows share of the most expensive step */
export default (props: PlanTreePropsInterface) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>('0');
  const analyzed = useMemo(() => maxOf(props.plan.root, (node) => node.time) > 0, [props.plan]);
  const metric = (node: PlanNodeType) => analyzed ? node.time : node.cost;
  const max = useMemo(() => maxOf(props.plan.root, metric), [props.plan, analyzed]);

  const flat: FlatNodeType[] = [];
  const walk = (node: PlanNodeType, depth: number, path: string) => {
    flat.push({node, depth, path});
    if (!collapsed.has(path)) node.children.forEach((child, index) => walk(child, depth + 1, `${path}.${index}`));
  };
  walk(props.plan.root, 0, '0');
  const current = flat.find((item) => item.path === selected)?.node;

  const toggle = (path: string) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  return (
    <div className="cmp-plan-tree">
      <div className="plan-rows" role="tree">
        <div className="plan-row plan-header">
          <span>Step</span>
          <span>Rows{analyzed ? ' (estimate → actual)' : ''}</span>
          <span>Cost</span>
          {analyzed && <span>Time</span>}
          <span>{analyzed ? 'Share of time' : 'Share of cost'}</span>
        </div>
        {flat.map(({node, depth, path}) => {
          const value = metric(node);
          return (
            <div
              key={path}
              role="treeitem"
              aria-selected={path === selected}
              className={`plan-row ${path === selected ? 'selected' : ''}`}
              onClick={() => setSelected(path)}
              title={node.details.map(([key, detail]) => `${key}: ${detail}`).join('\n')}
            >
              <span className="plan-step" style={{paddingLeft: depth * 16}}>
                {node.children.length > 0
                  ? <button type="button" className="plan-toggle" onClick={(event) => { event.stopPropagation(); toggle(path); }}>{collapsed.has(path) ? '▸' : '▾'}</button>
                  : <span className="plan-toggle" />}
                <span className="plan-title">{node.title}</span>
                {node.object && <span className="plan-object">{node.object}</span>}
                {node.warning && node.warning !== node.title && <span className="plan-warning">{node.warning}</span>}
              </span>
              <span className={`plan-number ${isMisestimate(node) ? 'misestimate' : ''}`} title={isMisestimate(node) ? 'Estimate is far from actual rows - statistics can be old (ANALYZE TABLE)' : undefined}>
                {formatNumber(node.rows)}{node.actualRows !== undefined ? ` → ${formatNumber(node.actualRows)}` : ''}
              </span>
              <span className="plan-number">{formatNumber(node.cost)}</span>
              {analyzed && <span className="plan-number">{node.time !== undefined ? `${formatNumber(node.time, 3)} ms` : ''}</span>}
              <span className="plan-bar">{value !== undefined && max > 0 && <span style={{width: `${Math.max(1, value / max * 100)}%`}} />}</span>
            </div>
          );
        })}
      </div>
      <div className="plan-details">
        {props.plan.totals.length > 0 && (
          <div className="plan-totals">{props.plan.totals.map(([key, value]) => <span key={key}>{key}: <b>{value}</b></span>)}</div>
        )}
        {current && (
          <dl>
            <dt>Step</dt><dd>{current.title}{current.object ? ` - ${current.object}` : ''}</dd>
            {current.details.map(([key, value], index) => <React.Fragment key={index}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}
          </dl>
        )}
      </div>
    </div>
  );
}
