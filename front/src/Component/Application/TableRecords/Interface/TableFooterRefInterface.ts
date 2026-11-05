import TotalCountInterface from '../../../../Library/Record/Interface/TotalCountInterface';

interface TableFooterRefInterface {
  setLimit: (offset: number, perPage: number) => void;
  /** total records, null - not known yet (counting); count tells if it is estimated */
  setTotal: (total: number | null, count?: Omit<TotalCountInterface, 'totalCount'>) => void;
  setLength: (length: number) => void; // current records set
  adjustTotal: (difference: number) => void; // e.g. -2 after two rows were deleted
}

export default TableFooterRefInterface;
