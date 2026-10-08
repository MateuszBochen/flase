import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';
import RowChangeInterface from '../../../Library/Record/Interface/RowChangeInterface';
import {CopyFormatType} from '../Copy/CopyFormats';

export type CellValueType = string|number|null;
export type QuickFilterOperatorType = '=' | '<>' | 'IS NULL' | 'IS NOT NULL' | 'clear';
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
  /** filter rows by value of cell, 'clear' removes filter */
  onQuickFilter?: (column: ColumnInterface, value: CellValueType, operator: QuickFilterOperatorType) => void;
  /** export of all rows of query (not only current page) as file */
  onExportAll?: (format: CopyFormatType, fileName: string) => void;
  /** file name without extension, e.g. table name */
  exportName?: string;
  /** foreign key value was clicked */
  onOpenReference?: (column: ColumnInterface, value: CellValueType, newTab: boolean) => void;
}
export default RecordsViewPropsInterface;
