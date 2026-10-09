import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


interface HeaderColumnsRefInterface {
  setColumns: (columns: ColumnInterface[]) => void;
  reset: () => void;
  /** some column has width set by user */
  hasWidths: () => boolean;
  /** back to automatic widths (and forget remembered ones) */
  resetWidths: () => void;
}

export default HeaderColumnsRefInterface;
