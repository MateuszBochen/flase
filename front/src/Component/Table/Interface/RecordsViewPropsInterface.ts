import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';
import RowChangeInterface from '../../../Library/Record/Interface/RowChangeInterface';

export type CellValueType = string|number|null;
export type SingleRowType = {[key:string]: CellValueType};

interface RecordsViewPropsInterface {
  /*tabIndex: PropTypes.number,*/
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  queryLoading: boolean,
  cellRender: any,
  /** editing is enabled only when handlers are passed */
  onPreviewChanges?: (editable: EditableResultInterface, changes: RowChangeInterface[]) => void;
  onSubmitChanges?: (editable: EditableResultInterface, changes: RowChangeInterface[]) => void;
  submitting?: boolean;
}
export default RecordsViewPropsInterface;
