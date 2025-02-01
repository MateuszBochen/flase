
interface TableFooterRefInterface {
  setLimit: (offset: number, perPage: number) => void;
  setTotal: (total: number) => void; // total records
  setLength: (length: number) => void; // current records set
}

export default TableFooterRefInterface;
