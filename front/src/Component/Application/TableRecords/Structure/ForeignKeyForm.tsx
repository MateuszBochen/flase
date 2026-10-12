import React, {useEffect, useState} from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import TableManager from '../../../../Library/Table/TableManager';
import EventBus from '../../../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../../../Library/Table/Event/TableInformationWasReceived';
import TableInterface from '../../../../Library/Table/Interface/TableInterface';
import {AlterOperationType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import './style.css';

type ForeignKeyOperationType = Extract<AlterOperationType, {op: 'addForeignKey'}>;

interface ForeignKeyFormPropsInterface {
  connection: ConnectionDataInterface;
  /** table which gets the foreign key */
  table: TableInterface;
  /** columns of the table */
  columns: string[];
  /** prefilled from ER diagram */
  initial?: {columns: string[], referencedTable: string, referencedColumns: string[]};
  busy: boolean;
  onPreview: (operation: ForeignKeyOperationType) => void;
  onCancel: () => void;
}

type PairType = {column: string, referenced: string};

/** ForeignKeyForm - columns of table and columns of referenced table in pairs, referential actions, sql is previewed */
export default (props: ForeignKeyFormPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const tableManager = TableManager.getInstance();
  const database = {name: props.table.databaseName};
  const listTables = () => tableManager.getTablesListForDatabase(props.connection, database).filter((table) => !table.preload);
  const [tables, setTables] = useState(listTables());
  const [referencedTable, setReferencedTable] = useState<string>(props.initial?.referencedTable || '');
  const [pairs, setPairs] = useState<PairType[]>(props.initial
    ? props.initial.columns.map((column, index) => ({column, referenced: props.initial!.referencedColumns[index] || ''}))
    : [{column: props.columns[0] || '', referenced: ''}]);
  const [name, setName] = useState<string>('');
  const [onDelete, setOnDelete] = useState<string>('RESTRICT');
  const [onUpdate, setOnUpdate] = useState<string>('RESTRICT');
  // InnoDB refuses SET DEFAULT
  const actions = driver.dialect === 'mysql' ? ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'] : ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'];

  useEffect(() => {
    tableManager.askForTableList(props.connection, database, false);
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => setTables(listTables()));
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.table.databaseName]);

  const target = tables.find((table) => table.tableName === referencedTable);
  const targetColumns = target?.columns.map((column) => column.name) || [];

  /** referenced columns default to primary key of referenced table */
  const chooseTable = (tableName: string) => {
    setReferencedTable(tableName);
    const primary = tables.find((table) => table.tableName === tableName)?.columns.filter((column) => column.primaryKey).map((column) => column.name) || [];
    setPairs((previous) => previous.map((pair, index) => ({...pair, referenced: primary[index] || primary[0] || ''})));
  };

  const update = (index: number, values: Partial<PairType>) => setPairs((previous) => previous.map((pair, pairIndex) => pairIndex === index ? {...pair, ...values} : pair));
  const valid = !!referencedTable && pairs.length > 0 && pairs.every((pair) => pair.column && pair.referenced);

  const preview = () => valid && props.onPreview({
    op: 'addForeignKey',
    name: name.trim(),
    columns: pairs.map((pair) => pair.column),
    referencedTable: {databaseName: props.table.databaseName, name: referencedTable},
    referencedColumns: pairs.map((pair) => pair.referenced),
    onDelete,
    onUpdate,
  });

  return (
    <Popup
      openOnMount
      label={`Add foreign key to ${props.table.name}`}
      onClickOk={preview}
      onClose={props.onCancel}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={!valid} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); preview(); }}>
        <label>
          References
          <select value={referencedTable} onChange={(event) => chooseTable(event.target.value)} aria-label="Referenced table" autoFocus={!props.initial}>
            <option value="" disabled>— table —</option>
            {tables.map((table) => <option key={table.tableName} value={table.tableName}>{table.tableName}</option>)}
          </select>
        </label>
        <div className="foreign-key-pairs">
          {pairs.map((pair, index) => (
            <div className="foreign-key-pair" key={index}>
              <select value={pair.column} onChange={(event) => update(index, {column: event.target.value})} aria-label={`Column ${index + 1}`}>
                <option value="" disabled>— column —</option>
                {props.columns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
              <span className="arrow">→</span>
              <select value={pair.referenced} onChange={(event) => update(index, {referenced: event.target.value})} aria-label={`Referenced column ${index + 1}`} disabled={!target}>
                <option value="" disabled>— {referencedTable || 'referenced'} column —</option>
                {targetColumns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
              {pairs.length > 1 && <button type="button" onClick={() => setPairs((previous) => previous.filter((item, itemIndex) => itemIndex !== index))} title="Remove column">✕</button>}
            </div>
          ))}
          <button type="button" className="structure-section-action" onClick={() => setPairs((previous) => [...previous, {column: '', referenced: ''}])}>+ column (composite key)</button>
        </div>
        <label>ON DELETE<select value={onDelete} onChange={(event) => setOnDelete(event.target.value)} aria-label="ON DELETE">{actions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>ON UPDATE<select value={onUpdate} onChange={(event) => setOnUpdate(event.target.value)} aria-label="ON UPDATE">{actions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="chosen by database" aria-label="Constraint name" /></label>
        <div className="hint">Referenced columns need a primary key or unique index; existing rows must match.</div>
        <button type="submit" hidden />
      </form>
    </Popup>
  );
}
