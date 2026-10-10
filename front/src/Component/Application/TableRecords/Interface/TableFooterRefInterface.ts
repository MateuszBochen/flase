
interface TableFooterRefInterface {
  setLimit: (offset: number, perPage: number) => void;
  setTotal: (total: number) => void; // total records
  setLength: (length: number) => void; // current records set
  adjustTotal: (difference: number) => void; // e.g. -2 after two rows were deleted
}

export default TableFooterRefInterface;
