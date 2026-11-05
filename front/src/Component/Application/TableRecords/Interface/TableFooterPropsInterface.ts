import React from 'react';

interface TableFooterPropsInterface {
  onPageChange: (page: number, perPage: number, maxPages: number) => void;
  loading?: boolean;
  /** stop running query */
  onCancel?: () => void;
  /** count rows exactly, without time limit - shown when rows are only estimated */
  onCountExactly?: () => void;
  /** extra content on the right side, e.g. pending changes */
  children?: React.ReactNode;
}

export default TableFooterPropsInterface;
