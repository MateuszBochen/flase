import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


interface HeaderColumnsRefInterface {
  setColumns: (columns: ColumnInterface[]) => void;
  reset: () => void;
}

export default HeaderColumnsRefInterface;
