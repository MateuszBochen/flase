import PropTypes from 'prop-types';

interface TableFooterPropsInterface {
  page: number; //PropTypes.number,
  total: number; // PropTypes.number,
  length: number; //PropTypes.number,
  perPage: number; //PropTypes.number,
  onPageChange: () => void; //PropTypes.func,
}

export default TableFooterPropsInterface;
