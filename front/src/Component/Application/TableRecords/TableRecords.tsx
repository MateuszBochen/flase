import QueryPlace from './UI/QueryPlace';
import Box from '../../../UI/Box/Box';

import './style/style.css';
import TableRecordsPropsInterface from './Interface/TableRecordsPropsInterface';
import RecordsView from '../../Table/RecordsView';
import RecordsViewPropsInterface from '../../Table/Interface/RecordsViewPropsInterface';
import TableInterface from '../../../Library/Table/Interface/TableInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import GridView from './UI/GridView';

const table: TableInterface = {
  databaseName: 'baza',
  name: 'tabela',
}

const fakeList: ColumnInterface[] = [
  {
    table: table,
    alias: 'a',
    autoIncrement: false,
    defaultValue: 'value',
    name: 'name',
    nullable: false,
    primaryKey: false,
  },
  {
    table: table,
    alias: 'a',
    autoIncrement: false,
    defaultValue: '3',
    name: 'oliczer',
    nullable: false,
    primaryKey: false,
  }
];

const fakeData = [
  {'oliczer': 'olicze value', 'name': 'name value'},
  {'oliczer': 'olicze value 2', 'name': 'name value 2'},
]


/** TableRecords */
export default (props: TableRecordsPropsInterface) => {
  return (
    <Box className="table-records-root">
      <QueryPlace
        database={props.database}
        connection={props.connection}
        table={props.table}
        tabId={props.tabId || ''}
      />
      <GridView
        database={props.database}
        connection={props.connection}
        table={props.table}
        tabId={props.tabId || ''}
      />
    </Box>
  );
}
