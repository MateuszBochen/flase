import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';

export type SingleRowType = {[key:string]: string|number};

interface RecordsViewPropsInterface {
  /*tabIndex: PropTypes.number,*/
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  queryLoading: boolean,
  cellRender: any
}
export default RecordsViewPropsInterface;
