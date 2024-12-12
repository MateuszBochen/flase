import RowPropsInterface from '../Interface/RowPropsInterface';
import LoopThrough from '../../../Library/Loop/LoopThrough';
import Cell from './Cell';

/** Row */
export default (props: RowPropsInterface) => {

  return (
    <div className="data-table-row">
      {props.columns.map((column) => {

        const keyName = `${column.alias}-${column.name}`;
        const className = `cmp-data-data-cell-${keyName}`;

        return (
          <Cell
            tabIndex={props.tabIndex}
            cellRender={props.cellRender}
            key={keyName}
            column={column}
            value={props.rowItem[column.name]}
          />
        );
      })}
    </div>
  );
}
