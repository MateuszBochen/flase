import React, {useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowDown, faArrowUp, faPlus, faTable, faXmark} from '@fortawesome/free-solid-svg-icons';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import useServerOptions from '../../../Library/Database/useServerOptions';
import TableManager from '../../../Library/Table/TableManager';
import {ColumnDefaultType} from '../../../Library/Table/Interface/StructureChangeInterface';
import {CreateTableIndexInterface, DatabaseOperationType} from '../../../Library/Database/Interface/DatabaseOperationInterface';
import useDatabaseOperation from '../../DatabaseOperations/useDatabaseOperation';
import CollationSelect from '../../DatabaseOperations/CollationSelect';
import openTableTab from '../TableRecords/openTableTab';
import './style.css';

export interface CreateTablePropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
}

type DefaultKind = ColumnDefaultType['kind'];

interface ColumnRowInterface {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  defaultKind: DefaultKind;
  defaultValue: string;
  autoIncrement: boolean;
  onUpdate: boolean;
  primary: boolean;
  comment: string;
}

interface IndexRowInterface {
  id: string;
  kind: CreateTableIndexInterface['kind'];
  name: string;
  columns: string[];
}

const isTimeType = (type: string) => /^(datetime|timestamp)/i.test(type.trim());

const column = (values: Partial<ColumnRowInterface>): ColumnRowInterface => ({
  id: uuidv4(), name: '', type: 'varchar(255)', nullable: true, defaultKind: 'none', defaultValue: '',
  autoIncrement: false, onUpdate: false, primary: false, comment: '', ...values,
});

/** CreateTable - columns, primary key, indexes and options of new table; sql is previewed before execution */
const CreateTable = (props: CreateTablePropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const driver = DriverFactory.getDriver(props.connection);
  const features = driver.features;
  const isMysql = driver.dialect === 'mysql';
  const options = useServerOptions(props.connection);
  const tabId = props.tabId || `create-table:${props.database}`;

  const [name, setName] = useState<string>('');
  const [engine, setEngine] = useState<string>('');
  const [collation, setCollation] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [columns, setColumns] = useState<ColumnRowInterface[]>(() => [
    column({name: 'id', type: isMysql ? 'int unsigned' : 'integer', nullable: false, autoIncrement: true, primary: true}),
    column({name: 'name'}),
  ]);
  const [indexes, setIndexes] = useState<IndexRowInterface[]>([]);

  const operation = useDatabaseOperation(props.connection, `${tabId}:create`, (applied: DatabaseOperationType) => {
    if (applied.kind !== 'createTable') return;
    TableManager.getInstance().askForTableList(props.connection, {name: props.database}, true);
    // new table replaces the form
    openTableTab(props.connection, {databaseName: props.database, name: applied.name}, {newTab: false});
  });

  const updateColumn = (id: string, values: Partial<ColumnRowInterface>) => setColumns((previous) => previous.map((item) => {
    if (item.id !== id) return item;
    const next = {...item, ...values};
    // NULL default needs nullable column
    if (!next.nullable && next.defaultKind === 'null') next.defaultKind = 'none';
    return next;
  }));
  const moveColumn = (index: number, by: number) => setColumns((previous) => {
    const next = [...previous];
    const [moved] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, moved);
    return next;
  });
  const removeColumn = (id: string) => setColumns((previous) => previous.filter((item) => item.id !== id));
  const updateIndex = (id: string, values: Partial<IndexRowInterface>) => setIndexes((previous) => previous.map((item) => item.id === id ? {...item, ...values} : item));

  const named = columns.filter((item) => item.name.trim());
  const columnNames = named.map((item) => item.name.trim());

  const preview = () => operation.run({
    kind: 'createTable',
    database: props.database,
    name: name.trim(),
    columns: named.map((item) => ({
      name: item.name.trim(),
      type: item.type.trim(),
      nullable: item.nullable && !item.primary,
      defaultValue: item.defaultKind === 'value' || item.defaultKind === 'expression'
        ? {kind: item.defaultKind, value: item.defaultValue}
        : {kind: item.defaultKind} as ColumnDefaultType,
      autoIncrement: item.autoIncrement,
      onUpdateCurrentTimestamp: features.onUpdateTimestamp && item.onUpdate && isTimeType(item.type),
      comment: item.comment,
      collation: null,
    })),
    primaryKey: named.filter((item) => item.primary).map((item) => item.name.trim()),
    indexes: indexes
      .map((index) => ({kind: index.kind, name: index.name.trim(), columns: index.columns.filter((columnName) => columnNames.includes(columnName))}))
      .filter((index) => index.columns.length),
    engine: isMysql && engine ? engine : null,
    collation: isMysql && collation ? collation : null,
    comment: comment.trim(),
  });

  const invalid = !name.trim() || !named.length || named.some((item) => !item.type.trim());
  const defaultEngine = options?.engines.find((item) => item.isDefault)?.name;

  return (
    <div className="cmp-create-table">
      <div className="create-table-title">
        <FontAwesomeIcon icon={faTable} /> New table in <strong>{props.database}</strong>
      </div>

      <section className="create-table-options">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="table_name" aria-label="Table name" />
        </label>
        {isMysql && (
          <label>
            <span>Engine</span>
            <select value={engine} onChange={(event) => setEngine(event.target.value)} aria-label="Engine">
              <option value="">Default{defaultEngine ? ` (${defaultEngine})` : ''}</option>
              {(options?.engines || []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
        )}
        {isMysql && (
          <label>
            <span>Collation</span>
            <CollationSelect options={options} value={collation} onChange={setCollation} emptyLabel="Default of database" />
          </label>
        )}
        <label className="wide">
          <span>Comment</span>
          <input value={comment} onChange={(event) => setComment(event.target.value)} aria-label="Table comment" />
        </label>
      </section>

      <section>
        <h3>Columns</h3>
        <table className="create-table-columns">
          <thead>
            <tr>
              <th />
              <th>Name</th><th>Type</th><th title="Nullable">Null</th><th>Default</th>
              <th title="Auto increment">A_I</th><th title="Primary key">PK</th>
              {features.onUpdateTimestamp && <th title="ON UPDATE CURRENT_TIMESTAMP">On update</th>}
              <th>Comment</th><th />
            </tr>
          </thead>
          <tbody>
            {columns.map((item, index) => (
              <tr key={item.id}>
                <td className="muted">{index + 1}</td>
                <td><input value={item.name} onChange={(event) => updateColumn(item.id, {name: event.target.value})} aria-label={`Column ${index + 1} name`} placeholder="column" /></td>
                <td>
                  <input value={item.type} onChange={(event) => updateColumn(item.id, {type: event.target.value})} list="create-table-types" aria-label={`Column ${index + 1} type`} className="type" />
                </td>
                <td className="center">
                  <input type="checkbox" checked={item.nullable && !item.primary} disabled={item.primary} onChange={(event) => updateColumn(item.id, {nullable: event.target.checked})} aria-label={`Column ${index + 1} nullable`} />
                </td>
                <td>
                  <span className="default">
                    <select value={item.defaultKind} onChange={(event) => updateColumn(item.id, {defaultKind: event.target.value as DefaultKind})} aria-label={`Column ${index + 1} default`}>
                      <option value="none">None</option>
                      <option value="null" disabled={!item.nullable || item.primary}>NULL</option>
                      <option value="value">Value</option>
                      <option value="expression">Expression</option>
                    </select>
                    {(item.defaultKind === 'value' || item.defaultKind === 'expression') && (
                      <input
                        value={item.defaultValue}
                        onChange={(event) => updateColumn(item.id, {defaultValue: event.target.value})}
                        placeholder={item.defaultKind === 'expression' ? 'CURRENT_TIMESTAMP' : ''}
                        aria-label={`Column ${index + 1} default value`}
                      />
                    )}
                  </span>
                </td>
                <td className="center"><input type="checkbox" checked={item.autoIncrement} onChange={(event) => updateColumn(item.id, {autoIncrement: event.target.checked})} aria-label={`Column ${index + 1} auto increment`} /></td>
                <td className="center"><input type="checkbox" checked={item.primary} onChange={(event) => updateColumn(item.id, {primary: event.target.checked})} aria-label={`Column ${index + 1} primary key`} /></td>
                {features.onUpdateTimestamp && (
                  <td className="center">
                    {isTimeType(item.type) && <input type="checkbox" checked={item.onUpdate} onChange={(event) => updateColumn(item.id, {onUpdate: event.target.checked})} aria-label={`Column ${index + 1} on update`} />}
                  </td>
                )}
                <td><input value={item.comment} onChange={(event) => updateColumn(item.id, {comment: event.target.value})} aria-label={`Column ${index + 1} comment`} /></td>
                <td className="actions">
                  <button type="button" onClick={() => moveColumn(index, -1)} disabled={index === 0} title="Move up"><FontAwesomeIcon icon={faArrowUp} /></button>
                  <button type="button" onClick={() => moveColumn(index, 1)} disabled={index === columns.length - 1} title="Move down"><FontAwesomeIcon icon={faArrowDown} /></button>
                  <button type="button" onClick={() => removeColumn(item.id)} disabled={columns.length <= 1} title="Remove column" className="danger"><FontAwesomeIcon icon={faXmark} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="create-table-types">{features.columnTypes.map((type) => <option key={type} value={type} />)}</datalist>
        <button type="button" className="create-table-add" onClick={() => setColumns((previous) => [...previous, column({})])}>
          <FontAwesomeIcon icon={faPlus} /> Add column
        </button>
        {columns.some((item) => !item.name.trim()) && <div className="create-table-hint">Columns without name are left out.</div>}
      </section>

      <section>
        <h3>Indexes</h3>
        {!indexes.length && <div className="create-table-hint">Primary key is set in columns. Other indexes can be added here or later in structure of the table.</div>}
        {indexes.map((index) => (
          <div className="create-table-index" key={index.id}>
            <select value={index.kind} onChange={(event) => updateIndex(index.id, {kind: event.target.value as IndexRowInterface['kind']})} aria-label="Index kind">
              {features.indexKinds.filter((kind) => kind !== 'PRIMARY').map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <input value={index.name} onChange={(event) => updateIndex(index.id, {name: event.target.value})} placeholder="name (optional)" aria-label="Index name" />
            <span className="create-table-index-columns">
              {columnNames.map((columnName) => (
                <label key={columnName} className={index.columns.includes(columnName) ? 'checked' : ''}>
                  <input
                    type="checkbox"
                    checked={index.columns.includes(columnName)}
                    onChange={(event) => updateIndex(index.id, {
                      // order of columns in index is order of clicking
                      columns: event.target.checked ? [...index.columns, columnName] : index.columns.filter((item) => item !== columnName),
                    })}
                  />
                  {columnName}
                  {index.columns.includes(columnName) && index.columns.length > 1 && <sup>{index.columns.indexOf(columnName) + 1}</sup>}
                </label>
              ))}
            </span>
            <button type="button" className="danger" onClick={() => setIndexes((previous) => previous.filter((item) => item.id !== index.id))} title="Remove index">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        ))}
        <button type="button" className="create-table-add" onClick={() => setIndexes((previous) => [...previous, {id: uuidv4(), kind: 'INDEX', name: '', columns: []}])}>
          <FontAwesomeIcon icon={faPlus} /> Add index
        </button>
      </section>

      <div className="create-table-footer">
        <button type="button" className="primary" onClick={preview} disabled={invalid || operation.busy || !!connection.readOnly}>
          {connection.readOnly ? 'Read only connection' : 'Preview SQL & create'}
        </button>
        {!name.trim() && <span className="create-table-hint">Name of table is required.</span>}
      </div>
      {operation.element}
    </div>
  );
};

export default CreateTable;
