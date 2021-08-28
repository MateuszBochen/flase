import React, {Component} from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faArrowAltCircleLeft, faArrowAltCircleRight } from '@fortawesome/fontawesome-free-solid';
import {Col, Row, ProgressBar} from 'react-bootstrap';
import HeaderColumns from './RecordsViewParts/HeaderColumns';
import DataGrid from './RecordsViewParts/DataGrid';
import './style.css';

import Column from '../../Library/DataTypes/Column';
import DataContent from "./DataContent";
import TableFooter from "./RecordsViewParts/TableFooter";

class RecordsView extends Component {
    constructor(props) {
        super(props);
        this.state = {
            renderStickyHeader: false,
        }

        this.columnsRefStatic = {};
        this.columnsRefSticky = {};
    }

    containerTableWrapperDidMount = (node) => {
        if (node) {
            this.containerTableWrapperRef = node;
            this.stickyTable();
            const resizeObserver = new ResizeObserver(this.stickyTable);
            resizeObserver.observe(node);
        }
    }

    tableDidMount = (node) => {
        if (node) {
            this.tableRef = node;
            this.stickyTable();
        }
    }

    tableHeaderDidMount = (node) => {
        if (node) {
            this.tableHeaderRef = node;
            this.stickyTable();
        }
    }

    stickyHeaderDidMount = (node) => {
        if (node) {
            this.stickyHeaderRef = node;
            this.stickyTable();
        }
    }


    stickyTable = () => {
        if (this.containerTableWrapperRef && this.tableRef && this.tableHeaderRef && this.stickyHeaderRef) {
            const wrapperRect = this.containerTableWrapperRef.getBoundingClientRect();
            const tableRect = this.tableRef.getBoundingClientRect();
            if (tableRect.height > wrapperRect.height) {
                this.containerTableWrapperRef.addEventListener('scroll', (e) => this.scrollHandler(e));
                this.setState({
                    renderStickyHeader: true,
                });
            }
        }
    }

    scrollHandler = (e) => {
        const wrapperRect = this.containerTableWrapperRef.getBoundingClientRect();
        const tableRect = this.tableRef.getBoundingClientRect();
        this.stickyHeaderRef.style.top = `${wrapperRect.y - tableRect.y}px`;
    }



    onHeaderStaticColumnDidMount = (column, columnRef) => {
        this.columnsRefStatic[column.name] = columnRef;
        this.changeColumnWidth(column.name);
    }

    onHeaderStickyColumnDidMount = (column, columnRef) => {
        this.columnsRefSticky[column.name] = columnRef;
        this.changeColumnWidth(column.name);
    }

    changeColumnWidth = (columnName) => {
        if (this.columnsRefSticky[columnName] && this.columnsRefStatic[columnName]) {
            const rect = this.columnsRefStatic[columnName].getBoundingClientRect();
            this.columnsRefSticky[columnName].style.width = `${rect.width}px`;
            const headerRect = this.tableHeaderRef.getBoundingClientRect();
            this.stickyHeaderRef.style.width = `${headerRect.width}px`;
        }
    }

    // handlers
    onChangePageHandler = (newPageNumber) => {
        const { onPageChange } = this.props;
        if (typeof onPageChange === 'function') {
            onPageChange(newPageNumber);
        }
    }

    renderStickyHeader = () => {
        const { renderStickyHeader } = this.state;
        if (!renderStickyHeader) {
            return null;
        }

        const headerRect = this.tableHeaderRef.getBoundingClientRect();
        this.stickyHeaderRef.style.width = `${headerRect.width}px`;

        const { columns, onSort } = this.props;

        return (
            <table>
                <thead>
                <HeaderColumns
                    columns={columns}
                    onColumnDidMount={this.onHeaderStickyColumnDidMount}
                    onSort={onSort}
                />
                </thead>
            </table>
        );
    };

    render() {
        const {
            columns,
            records,
            page,
            total,
            perPage,
            onSort,
        } = this.props;



        return (
            <div

                className="cmp-records-view nice-scrollbar"
            >
                <div
                    ref={this.containerTableWrapperDidMount}
                    className="cmp-records-view-table-wrapper nice-scrollbar"
                >
                    <div
                        ref={this.stickyHeaderDidMount}
                        className="cmp-records-view-sticky-table"
                    >
                        {this.renderStickyHeader()}
                    </div>
                    <table
                        ref={this.tableDidMount}
                    >
                        <thead
                            ref={this.tableHeaderDidMount}
                        >
                            <HeaderColumns
                                columns={columns}
                                onColumnDidMount={this.onHeaderStaticColumnDidMount}
                                onSort={onSort}
                            />
                        </thead>
                        <DataContent
                            columns={columns}
                            records={records}
                            loadedRecords={0}
                            possibleRecords={0}
                        />
                    </table>
                </div>
                <div className="cmp-records-view-pager">
                   <TableFooter
                       page={page}
                       total={total}
                       length={records.length}
                       perPage={perPage}
                       onPageChange={this.onChangePageHandler}
                   />
                </div>
            </div>
        );
    }
}

RecordsView.propTypes = {
    columns: PropTypes.arrayOf(PropTypes.instanceOf(Column)),
    records: PropTypes.arrayOf(PropTypes.object),
    loadedRecords: PropTypes.number,
    possibleRecords: PropTypes.number,
    total: PropTypes.number,
    page: PropTypes.number,
    perPage: PropTypes.number,
    onPageChange: PropTypes.func,
    onSort: PropTypes.func,
}

export default RecordsView;
