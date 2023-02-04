import React, {Component} from 'react';
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';


class ProcessList extends Component {

    sortHandler = (column, direction) => {
        const { page } = this.state;
        const sql = this.sqlRegex.setOrderByToSql("SHOW PROCESSLIST", column.name, direction);
        this.sendQuery(sql, page);
    }

    renderData = () => {
        const { isLoading, data, page } = this.state;
        if (isLoading) {
            return (
                <div className="cmp-table-data">
                    <LoaderSquare />
                </div>
            );
        }

        return (
            <div className="cmp-table-data">
                <RecordsView
                    columns={data.columns}
                    records={data.records}
                    total={data.total}
                    page={page}
                    perPage={50}
                    onSort={this.sortHandler}
                />
            </div>
        );

    }

    render() {
        return (
            <div>
                {this.renderData()}
            </div>
        );
    }
}

export default ProcessList;
