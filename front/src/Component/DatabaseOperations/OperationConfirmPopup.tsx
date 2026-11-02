import React from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import {DatabaseOperationType} from '../../Library/Database/Interface/DatabaseOperationInterface';
import '../Application/TableRecords/Structure/style.css';
import './style.css';

interface OperationConfirmPopupPropsInterface {
  connection: ConnectionDataInterface;
  statements: string[];
  operation: DatabaseOperationType;
  busy: boolean;
  /** option of operation was changed - preview is built again */
  onChange: (operation: DatabaseOperationType) => void;
  onExecute: () => void;
  onCancel: () => void;
}

/** operations which lose data or objects - Execute must be held */
export const isDestructiveOperation = (operation: DatabaseOperationType): boolean => ['dropDatabase', 'renameDatabase', 'tables', 'dropObject'].includes(operation.kind)
  || (operation.kind === 'objectDdl' && !!operation.replace);

const title = (operation: DatabaseOperationType, label: string): string => {
  switch (operation.kind) {
    case 'createDatabase': return `Create ${label.toLowerCase()} ${operation.name}`;
    case 'alterDatabase': return `Change collation of ${operation.name}`;
    case 'renameDatabase': return `Rename ${label.toLowerCase()} ${operation.name}`;
    case 'dropDatabase': return `Drop ${label.toLowerCase()} ${operation.name} - this cannot be undone`;
    case 'createTable': return `Create table ${operation.name}`;
    case 'tables': return `${operation.action === 'drop' ? 'Drop' : 'Truncate'} ${operation.tables.length} table(s) - this cannot be undone`;
    case 'createView': return `Create view ${operation.name}`;
    case 'dropObject': return `Drop ${operation.object.type.toLowerCase()} ${operation.object.name} - this cannot be undone`;
    case 'objectDdl': return operation.replace ? `Replace ${operation.replace.type.toLowerCase()} ${operation.replace.name}` : 'Create object';
    default: return 'Confirm';
  }
};

/** OperationConfirmPopup - sql of database operation, executed only after confirmation */
export default (props: OperationConfirmPopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const destructive = isDestructiveOperation(props.operation);
  const {hints, transactionalDdl} = driver.features;
  const operation = props.operation;

  return (
    <Popup
      openOnMount
      label={title(operation, driver.features.databaseLabel)}
      onClickOk={props.onCancel}
      onClose={props.onCancel}
      buttons={[
        <Button
          key="execute"
          size="small"
          colorVariant={destructive ? 'danger' : 'success'}
          label={destructive ? 'Hold to execute' : 'Execute'}
          loading={props.busy}
          onClick={props.onExecute}
        />,
        <Button key="close" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-operation-confirm">
        {operation.kind === 'tables' && (
          <label className="checkbox operation-option">
            <input
              type="checkbox"
              checked={operation.ignoreForeignKeys}
              disabled={props.busy}
              onChange={(event) => props.onChange({...operation, ignoreForeignKeys: event.target.checked})}
            />
            {hints.ignoreForeignKeys(operation.action, true)}
          </label>
        )}
        <pre className="cmp-sql-preview">{props.statements.map((statement) => `${statement};`).join('\n')}</pre>
        {operation.kind === 'renameDatabase' && hints.renameDatabase && <div className="structure-hint">{hints.renameDatabase}</div>}
        {operation.kind === 'dropDatabase' && hints.dropDatabase && <div className="structure-hint">{hints.dropDatabase}</div>}
        {operation.kind === 'objectDdl' && operation.replace && hints.objectRestore && <div className="structure-hint">{hints.objectRestore}</div>}
        {props.statements.length > 1 && (transactionalDdl
          ? <div className="structure-hint">Statements are executed in one transaction - all or nothing.</div>
          : <div className="structure-hint">Statements are executed one by one, DDL cannot be rolled back.</div>)}
      </div>
    </Popup>
  );
}
