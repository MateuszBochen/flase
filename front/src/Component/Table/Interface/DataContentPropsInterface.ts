import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


interface DataContentPropsInterface {
  columns: ColumnInterface[]; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  records: {[key:string]: string|number}[]; // PropTypes.array,
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  possibleRecords: number;
}

export default DataContentPropsInterface;
