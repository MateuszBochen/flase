import QueryPlace from './QueryPlace';
import Box from '../../../UI/Box/Box';

import './style/style.css';
import TableRecordsPropsInterface from './Interface/TableRecordsPropsInterface';

/** TableRecords */
export default (props: TableRecordsPropsInterface) => {
  return (
    <Box className="table-records-root">
      <QueryPlace
        database={props.database}
        connection={props.connection}
        table={props.table}
      />
      <div className="cmp-table-data-content">
        {/*{this.renderData()}*/}
        {props.tabId}
      </div>
    </Box>
  );
}
