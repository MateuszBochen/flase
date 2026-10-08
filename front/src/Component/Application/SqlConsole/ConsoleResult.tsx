import React, {useCallback, useEffect, useRef} from 'react';
import RecordsView from '../../Table/RecordsView';
import RecordsViewRefInterface from '../../Table/Interface/RecordsViewRefInterface';
import ResultBuffer from '../../../Library/Console/ResultBuffer';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../../Table/Interface/RecordsViewPropsInterface';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import openTableTab from '../TableRecords/openTableTab';
import './ConsoleResult.css';

interface ConsoleResultPropsInterface {
  buffer: ResultBuffer;
  connection: ConnectionDataInterface;
  /** file name of export */
  name: string;
}

/** ConsoleResult - rows of one statement in the data grid (read only) */
export default (props: ConsoleResultPropsInterface) => {
  const recordsRef = useRef<RecordsViewRefInterface | null>(null);

  useEffect(() => {
    const view = recordsRef.current!;
    const {buffer} = props;
    const finish = (rows: number) => {
      view.setLimit(0, Math.max(rows, 1));
      view.setTotal(rows);
      view.setFinished(rows);
    };

    // what came before the view was shown
    if (buffer.columns) {
      view.setColumns(buffer.columns, null, buffer.readOnlyReason);
    }
    buffer.rows.forEach((row) => view.addRow(row));
    if (buffer.finished !== null) {
      finish(buffer.finished);
    }

    return buffer.subscribe((event) => {
      if (event.type === 'columns') {
        view.setColumns(event.columns, null, event.readOnlyReason);
      } else if (event.type === 'row') {
        view.addRow(event.row);
      } else {
        finish(event.rows);
      }
    });
  }, [props.buffer]);

  /** foreign keys work in console results too */
  const onOpenReference = useCallback((column: ColumnInterface, value: CellValueType, newTab: boolean) => {
    const reference = column.reference;
    if (!reference) return;
    const query = DriverFactory.getDriver(props.connection).getRowsQuery(reference.table, reference.table.databaseName, [{column: reference.columnName, value}]);
    openTableTab(props.connection, reference.table, {query, newTab: true});
  }, [props.connection]);

  return (
    <div className="console-result-grid">
      <RecordsView
        ref={recordsRef}
        sqlLiteral={DriverFactory.getDriver(props.connection).sql}
        onPageChange={() => {}}
        onSort={() => {}}
        queryLoading={false}
        cellRender={undefined}
        onOpenReference={onOpenReference}
        exportName={props.name}
      />
    </div>
  );
}
