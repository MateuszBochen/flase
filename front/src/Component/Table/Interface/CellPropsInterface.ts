import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';

interface CellPropsInterface {
  column: ColumnInterface; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  value: string|number;
}

export default CellPropsInterface;
