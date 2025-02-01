import QueryPlace from './UI/QueryPlace';
import Box from '../../../UI/Box/Box';

import './style/style.css';
import TableRecordsPropsInterface from './Interface/TableRecordsPropsInterface';
import GridView from './UI/GridView';

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
