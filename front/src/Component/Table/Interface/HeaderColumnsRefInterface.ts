import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


interface HeaderColumnsRefInterface {
  setColumns: (columns: ColumnInterface[]) => void; //Column PropTypes.arrayOf(PropTypes.instanceOf(Column)),
}

export default HeaderColumnsRefInterface;
