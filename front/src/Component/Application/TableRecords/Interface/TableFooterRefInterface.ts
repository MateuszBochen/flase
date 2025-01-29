import PropTypes from 'prop-types';

interface TableFooterRefInterface {
  setPage: (page: number) => void; //PropTypes.func,
  setTotal: (total: number) => void; //PropTypes.func,
  setLength: (length: number) => void; //PropTypes.func,
  setPerPage: (perPage: number) => void; //PropTypes.func,

}

export default TableFooterRefInterface;
