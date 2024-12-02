import TableItemPropsInterface from './Interface/TableItemPropsInterface';
import TabOpener from '../TabOpener/TabOpener';
import TabInterface from '../ApplicationRenderer/Interface/TabInterface';
import TableRecords from '../Application/TableRecords/TableRecords';
import TableRecordsPropsInterface from '../Application/TableRecords/Interface/TableRecordsPropsInterface';

/** TableItem */
export default (props: TableItemPropsInterface) => {

  const tab:TabInterface<TableRecordsPropsInterface> = {
    component: TableRecords,
    props: {
      connection: props.connection,
      database: props.database,
      table: props.table
    },
    tabName: `${props.database.name}/${props.table.tableName}`,
    isActive: false,
  };

  return (
    <li>
      <TabOpener<TableRecordsPropsInterface>
        tooltip={'Open table records'}
        tab={tab}
      >
        {props.table.tableName}
      </TabOpener>
    </li>
  );
}
