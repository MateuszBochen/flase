import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';

export type SingleRowType = {[key:string]: string|number};



interface RecordsViewPropsInterface {
  loadedRecords: number,
  /*tabIndex: PropTypes.number,*/
  possibleRecords: number,
  total: number,
  page: number,
  perPage: number,
  onPageChange: () => void,
  onSort: () => void,
  queryLoading: boolean,
  cellRender: any
}
export default RecordsViewPropsInterface;
