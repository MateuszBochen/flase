import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import SqlRequest from '../../../API/SqlRequest';
import LoaderSquare from '../../../Components/Loader/LoaderSquare';
import RecordsView from '../../../Components/Table/RecordsView';
import SqlRegex from '../../../Library/SqlRegex';
import WorkPlaceAction from '../../../Actions/WorkPlaceAction';
import TableDataLibrary from '../../../Library/DataHelpers/TableData';
import QueryPlace from './QueryPlace';
import {Alert} from 'react-bootstrap';
import ApplicationManager from '../Application/ApplicationManager';
import '../style.css';

class TableDataRender extends Component {
    /** @type ApplicationManager */
    applicationManager = undefined;

    constructor(props) {
        super(props);
        this.tabIndex = this.props.tabIndex;
        this.applicationManager = ApplicationManager.getInstance(this.tabIndex);
        this.sqlRegex = new SqlRegex();
        this.sqlRequest = new SqlRequest();
        this.workPlaceAction = new WorkPlaceAction();
        this.tableDataLibrary = new TableDataLibrary();
        this.hasPrimary = -1;
    }

    componentDidMount() {
        this.applicationManager.sendQuery();
    }

    pageChangeHandler = (newPageNumber) => {
        this.applicationManager.changePage(newPageNumber);
    }

    sortHandler = (column, direction) => {
        this.applicationManager.changeOrderBy(column, direction);
    }

    renderData = () => {
        const { columns, records, recordsLoaded, limit, totalRows, offset, queryLoading} = this.props;

        if (totalRows === 0) {
            return (
                <Alert variant="light">
                    No Records find
                </Alert>
            );
        }

        if (!columns || !columns.length) {
            return (
                <div className="cmp-table-data">
                    <LoaderSquare />
                </div>
            );
        }

        return (
            <div className="cmp-table-data">
                <RecordsView
                    tabIndex={this.tabIndex}
                    queryLoading={queryLoading}
                    columns={this.tableDataLibrary.prepareColumnsDataType(columns)}
                    records={records}
                    total={totalRows}
                    loadedRecords={recordsLoaded}
                    possibleRecords={Math.min(limit, totalRows)}
                    page={Math.floor((offset / limit))}
                    perPage={limit}
                    onPageChange={this.pageChangeHandler}
                    onSort={this.sortHandler}
                />
            </div>
        );
    }

    render() {
        return (
            <div className="cmp-table-data">
                <QueryPlace tabIndex={this.tabIndex} />
                <div className="cmp-table-data-content">
                    {this.renderData()}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state) => ({...state});

export default connect(mapStateToProps)(TableDataRender);
