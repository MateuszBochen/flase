import {MutableRefObject} from 'react';
import GridEditInterface from './GridEditInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from './RecordsViewPropsInterface';

interface DataGridPropsInterface {
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  parentRef: MutableRefObject<HTMLDivElement | null>;
  edit?: GridEditInterface;
  onOpenReference?: (column: ColumnInterface, value: CellValueType, newTab: boolean) => void;
}

export default DataGridPropsInterface;
