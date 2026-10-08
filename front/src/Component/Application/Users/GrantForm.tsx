import React, {useEffect, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import {PrivilegeLevelInterface, PrivilegeLevelType, UserChangeType} from '../../../Library/Users/UserInterface';
import ConnectionManager from '../../../Library/Connection/ConnectionManager';
import DatabaseManger from '../../../Library/Database/DatabaseManger';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../../Library/Database/Event/DatabaseWasReceived';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';

interface GrantFormPropsInterface {
  connection: ConnectionDataInterface;
  levels: PrivilegeLevelInterface[];
  /** other accounts - membership of role (PostgreSQL) */
  roles: string[];
  busy: boolean;
  onPreview: (change: UserChangeType) => void;
  onCancel: () => void;
}

/** GrantForm - level (database / table / ...), privileges and grant option */
export default (props: GrantFormPropsInterface) => {
  const [levelName, setLevelName] = useState<PrivilegeLevelType>(props.levels[0]?.level || 'database');
  const [database, setDatabase] = useState<string>('');
  const [table, setTable] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [withGrantOption, setWithGrantOption] = useState<boolean>(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const level = props.levels.find((item) => item.level === levelName);

  // databases (schemas) of connection
  useEffect(() => {
    const refresh = () => {
      try {
        const established = ConnectionManager.getInstance().getEstablishedConnection(props.connection);
        const list = DatabaseManger.getInstance().getListOfDatabaseForConnection(established).map((item) => item.name);
        if (!list.length) DatabaseManger.getInstance().aksForDatabaseList(established);
        setDatabases(list);
      } catch (e) {
        setDatabases([]);
      }
    };
    refresh();
    const eventId = EventBus.subscribe(DatabaseWasReceived.name, refresh);
    return () => EventBus.unSub(eventId);
  }, [props.connection]);

  // tables of chosen database
  useEffect(() => {
    setTable('');
    if (!database || !level?.needsTable) return;
    const refresh = () => setTables(TableManager.getInstance().getTablesListForDatabase(props.connection, {name: database}).map((item) => item.tableName).sort());
    refresh();
    TableManager.getInstance().askForTableList(props.connection, {name: database}, false);
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, refresh);
    return () => EventBus.unSub(eventId);
  }, [database, levelName]);

  useEffect(() => setPrivileges([]), [levelName]);

  const toggle = (privilege: string) => setPrivileges((previous) => previous.includes(privilege)
    ? previous.filter((item) => item !== privilege)
    : [...previous, privilege]);

  const all = privileges.includes('ALL PRIVILEGES');
  const valid = !!level && (level.needsRole ? !!role : privileges.length > 0)
    && (!level.needsDatabase || !!database) && (!level.needsTable || !!table);

  const preview = () => level && props.onPreview({
    kind: 'grant',
    level: level.level,
    privileges,
    database: level.needsDatabase ? database : undefined,
    table: level.needsTable ? table : undefined,
    role: level.needsRole ? role : undefined,
    withGrantOption,
  });

  return (
    <Popup
      isOpen={true}
      label="Grant privileges"
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" loading={props.busy} disabled={!valid} onClick={preview} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-structure-form cmp-grant-form">
        <label>On
          <select value={levelName} onChange={(e) => setLevelName(e.target.value as PrivilegeLevelType)}>
            {props.levels.map((item) => <option key={item.level} value={item.level}>{item.label}</option>)}
          </select>
        </label>
        {level?.needsDatabase && (
          <label>{/postgres/i.test(props.connection.dsn) ? 'Schema' : 'Database'}
            <select value={database} onChange={(e) => setDatabase(e.target.value)}>
              <option value="">— select —</option>
              {databases.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {level?.needsTable && (
          <label>Table
            <select value={table} onChange={(e) => setTable(e.target.value)} disabled={!database}>
              <option value="">— select —</option>
              {tables.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {level?.needsRole && (
          <label>Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">— select —</option>
              {props.roles.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {!!level?.privileges.length && (
          <div className="grant-privileges">
            {level.privileges.map((privilege) => (
              <label className="checkbox" key={privilege}>
                <input
                  type="checkbox"
                  checked={privileges.includes(privilege) || (all && privilege !== 'ALL PRIVILEGES')}
                  disabled={all && privilege !== 'ALL PRIVILEGES'}
                  onChange={() => toggle(privilege)}
                />
                {privilege}
              </label>
            ))}
          </div>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={withGrantOption} onChange={(e) => setWithGrantOption(e.target.checked)} />
          {level?.needsRole ? 'WITH ADMIN OPTION - can grant the role to others' : 'WITH GRANT OPTION - can grant these privileges to others'}
        </label>
      </div>
    </Popup>
  );
}
