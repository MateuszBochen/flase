import React from 'react';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ExportPanel from './ExportPanel';
import ImportPanel from './ImportPanel';
import './style.css';

export interface TransferTabPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
  /** opened from table - export / CSV import of this table */
  table?: string;
}

/** TransferTab - import and export of database */
export default (props: TransferTabPropsInterface) => (
  <div className="cmp-transfer">
    <div className="transfer-title">
      {props.database}{props.table ? `.${props.table}` : ''} <span>import / export</span>
    </div>
    <ExportPanel connection={props.connection} database={props.database} table={props.table} tabId={`${props.tabId}`} />
    <ImportPanel connection={props.connection} database={props.database} table={props.table} tabId={`${props.tabId}`} />
  </div>
);
