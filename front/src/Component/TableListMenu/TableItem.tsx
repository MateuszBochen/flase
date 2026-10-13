import TableItemPropsInterface from './Interface/TableItemPropsInterface';
import TabOpener from '../TabOpener/TabOpener';
import TabInterface from '../ApplicationRenderer/Interface/TabInterface';
import TableRecords from '../Application/TableRecords/TableRecords';
import TableRecordsPropsInterface from '../Application/TableRecords/Interface/TableRecordsPropsInterface';
import {useEffect, useRef} from 'react';

/** highlighted - chosen by arrows, open-in-tab - used by some tab, active-in-tab - used by the current tab */
const classNames = (props: TableItemPropsInterface): string => [
  props.highlighted && 'highlighted',
  props.openInTab && 'open-in-tab',
  props.activeInTab && 'active-in-tab',
].filter(Boolean).join(' ');

/** TableItem */
export default (props: TableItemPropsInterface) => {
  const itemRef = useRef<HTMLLIElement | null>(null);

  // chosen by arrows - list scrolls to it
  useEffect(() => {
    if (props.highlighted) {
      itemRef.current?.scrollIntoView({block: 'nearest'});
    }
  }, [props.highlighted]);

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
    <li ref={itemRef} className={classNames(props) || undefined} onContextMenu={props.onContextMenu ? (event) => {
      event.preventDefault();
      event.stopPropagation();
      props.onContextMenu!(event, props.table);
    } : undefined}>
      <TabOpener<TableRecordsPropsInterface>
        tooltip={props.activeInTab ? 'Open table records (shown in current tab)' : props.openInTab ? 'Open table records (open in other tab)' : 'Open table records'}
        tab={tab}
      >
        {props.table.tableName}
      </TabOpener>
    </li>
  );
}
