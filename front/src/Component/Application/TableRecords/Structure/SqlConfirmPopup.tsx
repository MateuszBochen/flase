import React from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';

interface SqlConfirmPopupPropsInterface {
  statements: string[];
  change: StructureChangeType;
  busy: boolean;
  onExecute: () => void;
  onCancel: () => void;
}

/** changes which lose data - Execute must be held */
export const isDestructive = (change: StructureChangeType): boolean => {
  if (change.kind === 'drop' || change.kind === 'truncate') return true;
  return change.kind === 'alter' && change.operations.some((operation) => operation.op === 'dropColumn' || operation.op === 'dropIndex');
};

/** SqlConfirmPopup - sql of structure change, executed only after confirmation */
export default (props: SqlConfirmPopupPropsInterface) => {
  const destructive = isDestructive(props.change);
  return (
    <Popup
      isOpen={true}
      label={destructive ? 'Confirm - this cannot be undone' : 'Confirm structure change'}
      onClickOk={props.onCancel}
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
      <pre className="cmp-sql-preview">{props.statements.map((statement) => `${statement};`).join('\n')}</pre>
      {props.statements.length > 1 && <div className="structure-hint">Statements are executed one by one, DDL cannot be rolled back.</div>}
    </Popup>
  );
}
