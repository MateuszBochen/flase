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
    isOpen={true}
    label={props.operation.kind === 'maintenance' ? `${MAINTENANCE_LABELS[props.operation.action] || props.operation.action} - results` : 'Results'}
    onClickOk={props.onClose}
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

/** maintenance actions of database - MySQL / MariaDB or PostgreSQL */
export const maintenanceActions = (dialect: string): {action: string, label: string, hint: string}[] => dialect === 'mysql'
  ? [
    {action: 'optimize', label: 'Optimize', hint: 'OPTIMIZE TABLE - rebuild, free unused space'},
    {action: 'analyze', label: 'Analyze', hint: 'ANALYZE TABLE - refresh statistics of indexes'},
    {action: 'check', label: 'Check', hint: 'CHECK TABLE - look for errors'},
    {action: 'repair', label: 'Repair', hint: 'REPAIR TABLE - MyISAM, Aria, ARCHIVE, CSV'},
  ]
  : [
    {action: 'vacuum', label: 'Vacuum', hint: 'VACUUM - reclaim space of dead rows'},
    {action: 'vacuumAnalyze', label: 'Vacuum analyze', hint: 'VACUUM (ANALYZE) - vacuum and refresh statistics'},
    {action: 'vacuumFull', label: 'Vacuum full', hint: 'VACUUM FULL - rewrite table (locks it)'},
    {action: 'analyze', label: 'Analyze', hint: 'ANALYZE - refresh statistics'},
    {action: 'reindex', label: 'Reindex', hint: 'REINDEX TABLE - rebuild indexes'},
  ];
