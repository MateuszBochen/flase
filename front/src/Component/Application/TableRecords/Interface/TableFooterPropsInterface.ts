interface TableFooterPropsInterface {
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  loading?: boolean;
}

export default TableFooterPropsInterface;
