import React, {Component} from 'react';
import TableFooterPropsInterface from '../../Application/TableRecords/Interface/TableFooterPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faCircleChevronLeft, faCircleChevronRight} from '@fortawesome/free-solid-svg-icons';




/** TableFooter */
export default (props:TableFooterPropsInterface) => {
  /* constructor(props) {
       super(props);

       this.state = {
           currentPage: this.props.page + 1,
       }
   }

   componentDidUpdate(prevProps, prevState, snapshot) {
       if (prevProps.page !== this.props.page) {
           this.setState({
               currentPage: this.props.page + 1,
           });
       }
   }

   onChangePageHandler = (newPage) => {
       const { onPageChange } = this.props;
       onPageChange(newPage);
   };*/


  return (
    <div className="cmp-records-view-pager-root">

      <div className="cmp-records-view-pager-item pager">
        <IconButton
          disabled={false}
          icon={faCircleChevronLeft}
          onClick={() => {
          }}
        />
        <IconButton
          disabled={false}
          icon={faCircleChevronRight}
          onClick={() => {
          }}
        />
        <input
          className="form-control"
          type="number"
          /*value={currentPage}*/
          /*onChange={(e) => this.setState({currentPage: e.target.value})}*/
          /*onKeyPress={(e) => {
              if (e.key === 'Enter') {
                  this.onChangePageHandler(e.target.value - 1);
                  e.target.select();
              }
          }}*/
        />
      </div>

      <div className="cmp-records-view-pager-item pager-info">
        <div>
          Page: {props.page} &nbsp;/&nbsp; {Math.ceil(props.total / props.perPage)}
        </div>
        <div>
          &nbsp; Records: &nbsp; {props.page * props.perPage - (props.length) + (props.page * props.perPage)}
          &nbsp;/&nbsp;{props.total}
        </div>
      </div>
    </div>
  );
}
