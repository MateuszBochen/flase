import {MutableRefObject} from 'react';

interface DataGridPropsInterface {
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  parentRef: MutableRefObject<HTMLDivElement | null>;
}

export default DataGridPropsInterface;
