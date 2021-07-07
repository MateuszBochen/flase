import React, {Component} from 'react';
import { FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/fontawesome-free-solid';
import SqlRequest from '../../API/SqlRequest';
import BaseRequest from "../../API/BaseRequest";
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';
import Editor from '../../Components/Editor/Editor';
import SqlRegex from '../../Library/SqlRegex';
import './style.css';


class TableData extends Component {
    constructor(props) {
        super(props);
        const { tableName, query } = this.props;

        this.state = {
            isLoading: true,
            query: query || `SELECT * FROM \`${tableName}\` WHERE 1 LIMIT 50`,
            data: [],
            page: 0,
            perPage: 50,
        }

        this.sqlRequest = new SqlRequest();
        this.sqlRegex = new SqlRegex();



        console.log('AAA nowy nie');
    }

    pageChangeHandler = (newPageNumber) => {
        const sql = this.sqlRegex.setLimitToSql(this.state.query, newPageNumber * this.state.perPage, this.state.perPage);

        this.sendQuery(sql, newPageNumber);
    }

    componentDidMount() {
        this.sendQuery();
    }

    sendQuery = (query, page) => {
        const { database } = this.props;
        this.sqlRequest
            .query(database, query || this.state.query)
            .then((response) => {
                if (response.status === BaseRequest.STATUS_OK) {
                    this.setState({
                        data: response.data.data,
                        isLoading: false,
                        page: page || 0,
                        query: query || this.state.query,
                    });
                }
            });
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
                    onPageChange={this.pageChangeHandler}
                />
            </div>
        );

    }

    render() {
        const { query } = this.state;
        const { database, tableName } = this.props;

        return (
            <div className="cmp-table-data">
                <div className="cmp-table-data-header">
                    <div className="cmp-table-data-navbar">
                        <div className="cmp-table-data-navbar-buttons">
                            <div className="icon">
                                <FontAwesomeIcon icon={faArrowLeft} />
                            </div>
                            <div className="icon">
                                <FontAwesomeIcon icon={faArrowRight} />
                            </div>
                            <div className="icon database-name">
                                {database}://
                            </div>
                        </div>
                        <Editor
                            onChange={(e) => this.setState({query: e.target.value})}
                            onSearch={() => this.sendQuery()}
                        >
                            {query}
                        </Editor>
                    </div>
                </div>
                <div className="cmp-table-data-content">
                    {this.renderData()}
                </div>
            </div>
        );
    }
}

export default TableData;
