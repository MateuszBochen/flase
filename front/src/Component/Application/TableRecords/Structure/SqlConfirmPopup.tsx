import React from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import './style.css';

interface SqlConfirmPopupPropsInterface {
  statements: string[];
  change: StructureChangeType;
  busy: boolean;
  /** truncate / drop - option of foreign keys changes the change, its sql is previewed again */
  onChange?: (change: StructureChangeType) => void;
  /** MySQL turns foreign key checks off, PostgreSQL uses CASCADE */
  isMysql?: boolean;
  onExecute: () => void;
  onCancel: () => void;
}

/** changes which lose data - Execute must be held */
export const isDestructive = (change: StructureChangeType): boolean => {
  if (change.kind === 'drop' || change.kind === 'truncate') return true;
  return change.kind === 'alter' && change.operations.some((operation) => operation.op === 'dropColumn' || operation.op === 'dropIndex' || operation.op === 'dropForeignKey');
};

/** SqlConfirmPopup - sql of structure change, executed only after confirmation */
export default (props: SqlConfirmPopupPropsInterface) => {
  const destructive = isDestructive(props.change);
  return (
    <Popup
      openOnMount
      label={destructive ? 'Confirm - this cannot be undone' : 'Confirm structure change'}
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
      {props.onChange && (props.change.kind === 'truncate' || props.change.kind === 'drop') && (
        <label className="checkbox sql-confirm-option">
          <input
            type="checkbox"
            checked={!!props.change.ignoreForeignKeys}
            disabled={props.busy}
            onChange={(event) => props.onChange!({...props.change, ignoreForeignKeys: event.target.checked} as StructureChangeType)}
          />
          {props.isMysql
            ? 'Disable foreign key checks (FOREIGN_KEY_CHECKS = 0)'
            : `CASCADE - also ${props.change.kind === 'drop' ? 'objects depending on the table' : 'tables referencing it'}`}
        </label>
      )}
      <pre className="cmp-sql-preview">{props.statements.map((statement) => `${statement};`).join('\n')}</pre>
      {props.statements.length > 1 && !(props.change.kind === 'truncate' || props.change.kind === 'drop') && <div className="structure-hint">Statements are executed one by one, DDL cannot be rolled back.</div>}
    </Popup>
  );
}
