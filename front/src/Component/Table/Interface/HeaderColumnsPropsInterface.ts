import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


interface HeaderColumnsPropsInterface {
  columns: ColumnInterface[]; //Column PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  onColumnDidMount: () => void;
  onSort: () => void;
}

export default HeaderColumnsPropsInterface;
