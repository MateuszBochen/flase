import {MutableRefObject} from 'react';
import GridEditInterface from './GridEditInterface';

interface DataGridPropsInterface {
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  parentRef: MutableRefObject<HTMLDivElement | null>;
  edit?: GridEditInterface;
}

export default DataGridPropsInterface;
