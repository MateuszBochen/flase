import React, {Component} from 'react';
import { FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faArrowAltCircleLeft, faArrowAltCircleRight } from '@fortawesome/fontawesome-free-solid';
import HeaderColumns from './RecordsViewParts/HeaderColumns';
import DataGrid from './RecordsViewParts/DataGrid';
import './style.css';

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

    renderStickyHeader = () => {
        const { renderStickyHeader } = this.state;
        if (!renderStickyHeader) {
            return null;
        }

        const headerRect = this.tableHeaderRef.getBoundingClientRect();
        this.stickyHeaderRef.style.width = `${headerRect.width}px`;

        const { columns} = this.props;

        return (
            <table>
                <thead>
                    <HeaderColumns
                        columns={columns}
                        onColumnDidMount={this.onHeaderStickyColumnDidMount}
                    />
                </thead>
            </table>
        );
    };

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


    render() {
        const {
            columns,
            records,
            page,
            total,
            perPage,
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
                            />
                        </thead>
                        <DataGrid
                            columns={columns}
                            records={records}
                        />
                    </table>
                </div>
                <div className="cmp-records-view-pager">
                    <div className="cmp-records-view-pager-item pager">
                        <FontAwesomeIcon
                            role="button"
                            icon={faArrowAltCircleLeft}
                            onClick={() => this.onChangePageHandler(page - 1)}
                        />
                        <input
                            className="form-control"
                            type="number"
                            value={page}
                        />
                        <FontAwesomeIcon
                            onClick={() => this.onChangePageHandler(page + 1)}
                            role="button"
                            icon={faArrowAltCircleRight}
                        />
                    </div>
                    <div className="cmp-records-view-pager-item">
                        Page: {page}&nbsp;/&nbsp;{Math.ceil(total / perPage)}
                    </div>
                    <div className="cmp-records-view-pager-item">
                        records: { page * perPage } - {records.length * (page+1)}
                        &nbsp;/&nbsp;{total}
                    </div>
                </div>
            </div>
        );
    }
}

export default RecordsView;
