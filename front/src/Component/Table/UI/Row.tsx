import RowPropsInterface from '../Interface/RowPropsInterface';
import LoopThrough from '../../../Library/Loop/LoopThrough';
import Cell from './Cell';
import {useEffect} from 'react';

/** Row */
export default (props: RowPropsInterface) => {



/*  useEffect(() => {

    const keyName = `${column.alias}-${column.name}`;
    const cellClassName = `.cmp-data-data-cell-${keyName}`;
    const columnClassName = `#cmp-data-data-header-cell-${keyName}`;


    const headerElement = document.getElementById(columnClassName);

  }, [props.columns]);*/

  return (
    <div className="data-table-row">
      {props.columns.map((column) => {

        const keyName = `${column.alias}-${column.name}`;

        return (
          <Cell
            tabIndex={props.tabIndex}
            cellRender={props.cellRender}
            key={keyName}
            column={column}
            value={props.rowItem[column.name]}
            gridRef={props.gridRef}
          />
        );
      })}
    </div>
  );
}
