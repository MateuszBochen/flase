import React, {forwardRef, useImperativeHandle, useState} from 'react';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import TableInterface from '../../../../Library/Table/Interface/TableInterface';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import useStructureChange from './useStructureChange';
import SqlConfirmPopup from './SqlConfirmPopup';
import TableNameForm from './TableNameForm';

export type TableOperationType = 'rename' | 'copy' | 'truncate' | 'drop';

export interface TableOperationsRefInterface {
  start: (operation: TableOperationType) => void;
}

interface TableOperationsPropsInterface {
  connection: ConnectionDataInterface;
  table: TableInterface;
  /** own id for websocket answers */
  operationsTabId: string;
  onApplied: (change: StructureChangeType) => void;
}

/** TableOperations - rename / copy / truncate / drop of table, only popups, started from tab toolbar */
export default forwardRef<TableOperationsRefInterface, TableOperationsPropsInterface>((props, ref) => {
  const [nameForm, setNameForm] = useState<'rename' | 'copy' | null>(null);
  const change = useStructureChange(props.connection, props.table, props.operationsTabId, (applied) => {
    setNameForm(null);
    props.onApplied(applied);
  });

  useImperativeHandle(ref, () => ({
    start: (operation: TableOperationType) => {
      if (operation === 'rename' || operation === 'copy') {
        setNameForm(operation);
      } else {
        change.requestPreview({kind: operation});
      }
    },
  }));

  return (
    <>
      {nameForm && (
        <TableNameForm
          mode={nameForm}
          currentName={props.table.name}
          busy={change.busy}
          onCancel={() => setNameForm(null)}
          onPreview={(newName, withData) => change.requestPreview(nameForm === 'copy'
            ? {kind: 'copy', newName, withData}
            : {kind: 'rename', newName})}
        />
      )}
      {change.preview && (
        <SqlConfirmPopup
          statements={change.preview.statements}
          change={change.preview.change}
          busy={change.busy}
          onExecute={change.execute}
          onCancel={change.closePreview}
        />
      )}
    </>
  );
});
