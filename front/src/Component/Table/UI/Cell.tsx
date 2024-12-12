import CellPropsInterface from '../Interface/CellPropsInterface';

/** Cell */
export default (props: CellPropsInterface) => {

  const keyName = `${props.column.alias}-${props.column.name}`;
  const className = `cmp-data-data-cell-${keyName}`;

  return (
    <div className={`data-table-cell ${className}`} key={keyName}>
      {props.value}
    </div>
  );
}
