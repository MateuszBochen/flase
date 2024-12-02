import Box from '../../UI/Box/Box';
import TableListPropsInterface from './Interface/TableListPropsInterface';
import {useCallback, useEffect, useState} from 'react';
import TableInformationInterface from '../../Library/Table/Interface/TableInformationInterface';
import TableItem from './TableItem';

/** TableList */
export default (props: TableListPropsInterface) => {
  const [state, setState] = useState<TableInformationInterface[]>(props.tables);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    setState(props.tables);
  }, [props.tables]);

  const compare = useCallback((input: string, filter: string):boolean => {
    const splitFilter = filter.split(',');
    for (const key in splitFilter) {
      if (input.trim().toLowerCase().includes(splitFilter[key].trim())) {
        return true;
      }
    }
    return false;
  }, []);

  return (
    <Box maxPossibleHeight={true}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault()
        }}
      >
        <div>
          <input
            type="text"
            className="form-control"
            value={filter}
            onChange={(e) => setFilter(e.target.value.toLowerCase())}
          />
        </div>
        <ul>
          {state.filter((tableItem) => compare(tableItem.tableName, filter)).map((filteredItem) =>(
            <TableItem connection={props.connection} database={props.database} table={filteredItem} key={filteredItem.tableName}/>
          ))}
        </ul>
      </div>
    </Box>
  );
}
