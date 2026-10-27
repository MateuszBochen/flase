import React, {useEffect, useMemo, useState} from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import useStatementRunner from '../../../../Library/Console/useStatementRunner';
import ConsoleResult from '../../SqlConsole/ConsoleResult';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import {parsePlan} from '../../../../Library/Console/ExplainPlan';
import {statementKeyword} from '../../../../Library/Console/SqlInspections';
import PlanTree from './PlanTree';
import '../style/style.css';

interface ExplainPopupPropsInterface {
  connection: ConnectionDataInterface;
  database: string | null;
  query: string;
  tabId: string;
  onClose: () => void;
}

/** statement without EXPLAIN / ANALYZE written by user */
const withoutExplain = (query: string): string => query
  .replace(/^\s*(explain|analyze)\s+(analyze\s+)?(\((?:[^()]|\([^()]*\))*\)\s*)?(format\s*=\s*\w+\s+)?/i, '')
  .trim();

/**
 * statements of plan - JSON of every server; ANALYZE executes the query:
 * PostgreSQL EXPLAIN (ANALYZE), MariaDB ANALYZE FORMAT=JSON, MySQL EXPLAIN ANALYZE (text tree, used when MariaDB syntax fails)
 */
const planStatements = (dialect: string, query: string, analyze: boolean): string[] => {
  if (dialect === 'postgresql') {
    return [analyze ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}` : `EXPLAIN (FORMAT JSON) ${query}`];
  }
  return analyze ? [`ANALYZE FORMAT=JSON ${query}`, `EXPLAIN ANALYZE ${query}`] : [`EXPLAIN FORMAT=JSON ${query}`];
};

/** ExplainPopup - execution plan as tree (cost, rows, time of steps) and classic EXPLAIN table */
export default (props: ExplainPopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const query = withoutExplain(props.query);
  /** ANALYZE executes statement - only SELECT */
  const canAnalyze = statementKeyword(query, driver.dialect) === 'SELECT';
  const [analyze, setAnalyze] = useState<boolean>(false);
  const [view, setView] = useState<'plan' | 'table'>('plan');
  /** index of statement of planStatements which is tried */
  const [attempt, setAttempt] = useState<number>(0);
  const plan = useStatementRunner(props.connection, `${props.tabId}:explain`);
  const table = useStatementRunner(props.connection, `${props.tabId}:explain-table`);
  const statements = planStatements(driver.dialect, query, analyze);
  const statement = statements[Math.min(attempt, statements.length - 1)];

  useEffect(() => {
    plan.run([statement], props.database, 10);
  }, [statement]);

  useEffect(() => {
    if (view === 'table' && !table.logs.length) {
      table.run([`EXPLAIN ${query}`], props.database, 1000);
    }
  }, [view]);

  const log = plan.logs[0];
  // other syntax of the same plan (MySQL instead of MariaDB)
  useEffect(() => {
    if (log?.status === 'error' && attempt < statements.length - 1) setAttempt(attempt + 1);
  }, [log?.status]);

  const parsed = useMemo(() => {
    if (log?.status !== 'done' || !plan.resultIndexes.includes(0)) return null;
    const rows = plan.buffer(0).rows;
    const value = rows.length ? Object.values(rows[0])[0] : null;
    // MySQL text tree comes in one cell, other outputs as JSON
    return parsePlan(rows.length > 1 ? rows.map((row) => Object.values(row)[0]).join('\n') : value);
  }, [log?.status, plan.resultIndexes]);
  const failed = log?.status === 'error' && attempt >= statements.length - 1;

  return (
    <Popup
      openOnMount
      label="EXPLAIN"
      onClickOk={props.onClose}
      onClose={props.onClose}
      buttons={[<Button key="close" size="small" label="Close" onClick={props.onClose} />]}
    >
      <div className="cmp-explain">
        <pre className="explain-query">{query}</pre>
        <div className="explain-toolbar" role="tablist">
          <button type="button" role="tab" className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>Plan</button>
          <button type="button" role="tab" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
          {view === 'plan' && (
            <label
              className="explain-analyze"
              title={canAnalyze ? 'Executes the query and shows real rows and time of every step' : 'Only SELECT can be analyzed - ANALYZE executes the statement'}
            >
              <input type="checkbox" checked={analyze} disabled={!canAnalyze || plan.running} onChange={(event) => { setAttempt(0); setAnalyze(event.target.checked); }} />
              Analyze (executes query)
            </label>
          )}
        </div>
        {view === 'plan' && (
          <>
            {failed && <div className="explain-error">{log.error}</div>}
            {parsed && <PlanTree key={statement} plan={parsed} />}
            {log?.status === 'done' && !parsed && <div className="explain-error">Plan of this server is not known - see Table</div>}
            {!failed && log?.status !== 'done' && <div className="explain-loading">Loading…</div>}
          </>
        )}
        {view === 'table' && (
          <>
            {table.logs[0]?.error && <div className="explain-error">{table.logs[0].error}</div>}
            {table.resultIndexes.includes(0) && (
              <div className="explain-result">
                <ConsoleResult buffer={table.buffer(0)} connection={props.connection} name="explain" />
              </div>
            )}
            {!table.logs[0]?.error && !table.resultIndexes.includes(0) && <div className="explain-loading">Loading…</div>}
          </>
        )}
      </div>
    </Popup>
  );
}
