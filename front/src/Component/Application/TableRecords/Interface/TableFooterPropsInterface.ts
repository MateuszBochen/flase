import React from 'react';

interface TableFooterPropsInterface {
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  loading?: boolean;
  /** extra content on the right side, e.g. pending changes */
  children?: React.ReactNode;
}

export default TableFooterPropsInterface;
