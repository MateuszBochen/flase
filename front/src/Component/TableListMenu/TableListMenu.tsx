import TableListMenuPropsInterface from './Interface/TableListMenuPropsInterface';
import TableManager from '../../Library/Table/TableManager';
import {useEffect, useState} from 'react';
import TableInformationInterface from '../../Library/Table/Interface/TableInformationInterface';
import EventBus from '../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../Library/Table/Event/TableInformationWasReceived';
import ReceivedTableInformationInterface from '../../Library/Table/Interface/ReceivedTableInformationInterface';
import Box from '../../UI/Box/Box';
import TableList from './TableList';
import './style.css';
import TableListWasReloaded from '../../Library/Table/Event/TableListWasReloaded';


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
    const refresh = () => setState([...tableManager.getTablesListForDatabase(props.connection, props.database)]);

    const receivedId = EventBus.subscribe<ReceivedTableInformationInterface>(TableInformationWasReceived.name, refresh);
    const reloadedId = EventBus.subscribe<{connection: {id: string}, database: {name: string}}>(TableListWasReloaded.name, (event) => {
      const data = event.getData();
      if (data.connection.id === props.connection.id && data.database.name === props.database.name) {
        refresh();
      }
    });

    return () => {
      EventBus.unSub(receivedId);
      EventBus.unSub(reloadedId);
    };
  }, [props.connection, props.database]);

  return (
    <Box maxPossibleHeight={true} style={{maxHeight: '300px'}} className="table-list-menu-root">
      <TableList
        connection={props.connection}
        database={props.database}
        tables={state}
      />
    </Box>
  );
}
