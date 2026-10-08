import React, {useEffect} from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import useStatementRunner from '../../../../Library/Console/useStatementRunner';
import ConsoleResult from '../../SqlConsole/ConsoleResult';

interface ExplainPopupPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  query: string;
  tabId: string;
  onClose: () => void;
}

/** ExplainPopup - execution plan of current query of the tab */
export default (props: ExplainPopupPropsInterface) => {
  const runner = useStatementRunner(props.connection, `${props.tabId}:explain`);
  const statement = /^\s*explain\b/i.test(props.query) ? props.query : `EXPLAIN ${props.query}`;

  useEffect(() => {
    runner.run([statement], props.database, 1000);
  }, []);

  const log = runner.logs[0];

  return (
    <Popup
      isOpen={true}
      label="EXPLAIN"
      onClickOk={props.onClose}
      buttons={[<Button key="close" size="small" label="Close" onClick={props.onClose} />]}
    >
      <div className="cmp-explain">
        <pre className="explain-query">{statement}</pre>
        {log?.error && <div className="explain-error">{log.error}</div>}
        {runner.resultIndexes.includes(0) && (
          <div className="explain-result">
            <ConsoleResult buffer={runner.buffer(0)} connection={props.connection} name="explain" />
          </div>
        )}
        {!log?.error && !runner.resultIndexes.includes(0) && <div className="explain-loading">Loading…</div>}
      </div>
    </Popup>
  );
}
