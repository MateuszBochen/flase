import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';

interface DataGridPropsInterface {
  columns: ColumnInterface[]; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  records: {[key:string]: string|number}[]; // PropTypes.array,
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
}

export default DataGridPropsInterface;
