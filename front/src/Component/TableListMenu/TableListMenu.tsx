import TableListMenuPropsInterface from './TableListMenuPropsInterface';
import TableManager from '../../Library/Table/TableManager';
import {useEffect, useState} from 'react';
import TableInformationInterface from '../../Library/Table/Interface/TableInformationInterface';
import EventBus from '../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../Library/Table/Event/TableInformationWasReceived';
import ReceivedTableInformationInterface from '../../Library/Table/Interface/ReceivedTableInformationInterface';

const tableManager = TableManager.getInstance();

/** TableListMenu */
export default (props: TableListMenuPropsInterface) => {
  const [state, setState] = useState<TableInformationInterface[]>([]);

  useEffect(() => {
    tableManager.askForTableList(props.connection, props.database, false);
    const newList = tableManager.getTablesListForDatabase(props.connection, props.database);
    setState([...newList]);
  }, []);

  useEffect(() => {
    EventBus.subscribe<ReceivedTableInformationInterface>(TableInformationWasReceived.name, () => {
      const newList = tableManager.getTablesListForDatabase(props.connection, props.database);
      setState([...newList]);
    });
  }, [props.connection, props.database, state]);

  return (
    <div>
      <ul>
        {state.map((tableInformation) => <li key={tableInformation.tableName}>{tableInformation.tableName}</li>)}
      </ul>
    </div>
  );
}
