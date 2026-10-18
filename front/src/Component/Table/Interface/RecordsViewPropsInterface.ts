import {ExportFormatType} from '../../../Library/Export/ExportRows';
import SqlLiteralInterface from '../../../Library/Database/Driver/SqlLiteralInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';
import RowChangeInterface from '../../../Library/Record/Interface/RowChangeInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';

/** foreign keys are not checked - deleted rows may be referenced by other tables */
export type RowChangesOptionsType = {ignoreForeignKeys: boolean};

export type CellValueType = string|number|null;
export type QuickFilterOperatorType = '=' | '<>' | 'IS NULL' | 'IS NOT NULL' | 'clear';
export type SingleRowType = {[key:string]: CellValueType};

interface RecordsViewPropsInterface {
  /** connection of rows - labels of referenced rows, display settings of columns, whole binary values */
  connection?: ConnectionDataInterface;
  /** quoting for copy as INSERT - dialect of connection */
  sqlLiteral?: SqlLiteralInterface;
  /*tabIndex: PropTypes.number,*/
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  queryLoading: boolean,
  cellRender: any,
  /** editing is enabled only when handlers are passed */
  onPreviewChanges?: (editable: EditableResultInterface, changes: RowChangeInterface[], options: RowChangesOptionsType) => void;
  onSubmitChanges?: (editable: EditableResultInterface, changes: RowChangeInterface[], options: RowChangesOptionsType) => void;
  submitting?: boolean;
  /** filter rows by value of cell, 'clear' removes filter */
  onQuickFilter?: (column: ColumnInterface, value: CellValueType, operator: QuickFilterOperatorType) => void;
  /** export of all rows of query (not only current page) as file */
  onExportAll?: (format: ExportFormatType, fileName: string) => void;
  /** file name without extension, e.g. table name */
  exportName?: string;
  /** widths of columns set by user are remembered under this key (connection / table) */
  columnWidthsKey?: string;
  /** stop running query of the grid */
  onCancelQuery?: () => void;
  /** foreign key value was clicked */
  onOpenReference?: (column: ColumnInterface, value: CellValueType, newTab: boolean) => void;
}
export default RecordsViewPropsInterface;
