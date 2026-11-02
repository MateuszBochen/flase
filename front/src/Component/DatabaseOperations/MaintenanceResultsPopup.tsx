import React from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import {DatabaseOperationType, MaintenanceResultInterface} from '../../Library/Database/Interface/DatabaseOperationInterface';
import './style.css';

interface MaintenanceResultsPopupPropsInterface {
  operation: DatabaseOperationType;
  results: MaintenanceResultInterface[];
  onClose: () => void;
}

/** MaintenanceResultsPopup - messages of OPTIMIZE / ANALYZE / CHECK / REPAIR / VACUUM for every table */
export default (props: MaintenanceResultsPopupPropsInterface) => (
  <Popup
    openOnMount
    label={props.operation.kind === 'maintenance' ? `${MAINTENANCE_LABELS[props.operation.action] || props.operation.action} - results` : 'Results'}
    onClickOk={props.onClose}
    onClose={props.onClose}
    buttons={[<Button key="close" size="small" label="Close" onClick={props.onClose} />]}
  >
    <div className="cmp-maintenance-results">
      {props.results.length ? (
        <table>
          <thead><tr><th>Table</th><th>Operation</th><th>Type</th><th>Message</th></tr></thead>
          <tbody>
            {props.results.map((result, index) => (
              <tr key={index} className={`result-${String(result.type).toLowerCase()}`}>
                <td>{result.table}</td>
                <td>{result.operation}</td>
                <td className="type">{result.type}</td>
                <td>{result.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="structure-hint">Nothing was reported.</div>}
    </div>
  </Popup>
);

export const MAINTENANCE_LABELS: {[action: string]: string} = {
  optimize: 'Optimize',
  analyze: 'Analyze',
  check: 'Check',
  repair: 'Repair',
  vacuum: 'Vacuum',
  vacuumFull: 'Vacuum full',
  vacuumAnalyze: 'Vacuum analyze',
  reindex: 'Reindex',
};

