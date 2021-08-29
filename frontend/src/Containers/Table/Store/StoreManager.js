import thunk from 'redux-thunk';
import {createStore, applyMiddleware, compose} from 'redux';
import { v4 as uuidv4 } from 'uuid';
import SqlRegex from "../../../Library/SqlRegex";


class TemporaryRecords  {

    records = {};

    constructor(tabIndex) {
        this.tabIndex = tabIndex;
    }

    addRecord = (tabIndex, record) => {
        if (this.records[tabIndex]) {
            this.records[tabIndex] = [...this.records[tabIndex], record];
        } else {
            this.records[tabIndex] = [];
            this.records[tabIndex] = [...this.records[tabIndex], record];
        }
    }

    clearData = (tabIndex) => {
        this.records[tabIndex] = [];
    }
}

class StoreManager {
    static storages = {};
    static DEFAULT_LIMIT = 50;

    static createStore = (props) => {
        const middleware = applyMiddleware(thunk);
        const enhancer = compose(
            middleware,
        );

        const sqlRegex = new SqlRegex();
        let defaultQuery = `SELECT * FROM \`${props.tableName}\` WHERE 1 LIMIT ${StoreManager.DEFAULT_LIMIT}`;

        if (props.query) {
            defaultQuery = props.query;
        }

        const limits = sqlRegex.getLimitOfQuery(defaultQuery);

        const tabIndex = props.tabIndex;
        let temporaryRecords = [];
        const initialState  = {
            tableKeys: [],
            tabIndex: props.tabIndex,
            tableName: props.tableName,
            database: props.database,
            columns: [],
            records: [],
            offset: limits.offset,
            limit: limits.limit,
            query: defaultQuery,
            recordsLoaded: 0,
            totalRows: -1,
            currentQueryIndex: 0,
            queryHistory: [defaultQuery]
        };

        const reducer = (state = initialState, action) => {
            switch (action.type) {
                case 'CHANGE_QUERY': {
                    const newState = {
                        ...state,
                        ...StoreManager._addQueryToHistory(action.data, state.queryHistory, state.currentQueryIndex)
                    };

                    const limits = sqlRegex.getLimitOfQuery(newState.query);

                    newState.offset = limits.offset;
                    newState.limit = limits.limit;
                    newState.records = [];
                    temporaryRecords = [];

                    return newState;
                }
                case 'RELOAD_QUERY': {
                    const newState = {...state};
                    newState.query = action.data;
                    newState.records = [];
                    temporaryRecords = [];
                    return newState;
                }
                case 'SOCKET_SET_SELECT_QUERY_COLUMNS': {
                    const newState = {...state};
                    newState.columns = action.data;
                    return newState;
                }
                case 'SOCKET_SET_SELECT_QUERY_INDEXES': {
                    const newState = {...state};
                    newState.tableKeys = action.data;
                    return newState;
                }
                case 'SOCKET_SET_SELECT_QUERY_TOTAL_ROWS': {
                    const newState = {...state};
                    newState.totalRows = action.data;
                    return newState;
                }
                case 'GO_TO_QUERY_HISTORY': {
                    const newState = {
                        ...state,
                        ...StoreManager._getHistoryQuery(action.data, state.queryHistory),
                    };

                    const limits = sqlRegex.getLimitOfQuery(newState.query);

                    newState.offset = limits.offset;
                    newState.limit = limits.limit;
                    newState.records = [];
                    temporaryRecords = [];

                    return newState;
                }
                case 'SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW': {
                    const newState = {...state};
                    const recordItem = {
                        id: uuidv4(),
                        rowValues: action.data,
                    }

                    /*newState.records = [...newState.records, recordItem];
                    return newState;*/

                    temporaryRecords = [...temporaryRecords, recordItem];

                    // console.log('ffff', temporaryRecords.length, state.totalRows);

                    if (state.totalRows > 0) {
                        const alreadySows = (state.totalRows - state.offset);

                        // console.log('gg', alreadySows, temporaryRecords.length, state.totalRows, state.limit, state.totalRows);
                        const minValueOfRecordToShow = Math.min(state.limit, alreadySows);
                        if (minValueOfRecordToShow === temporaryRecords.length) {
                            newState.records = temporaryRecords;
                        }
                    }

                    return newState;
                }
                default:
                    return state;
            }
        };

        StoreManager.storages[tabIndex] = createStore(reducer, enhancer);
    }

    static getStore = tabIndex => StoreManager.storages[tabIndex];

    static dispatch = (tabIndex, action, data) => {
        const store = StoreManager.getStore(tabIndex);
        store.dispatch({
            type: action,
            data: data,
        });
    }

    static _addQueryToHistory = (newQuery, queryHistory, queryIndex) => {
        let queries = [...queryHistory];
        if (queries.length - 1 > queryIndex) {
            queries = queries.slice(0, queryIndex + 1);
        }

        return {
            query: newQuery,
            queryHistory: [...queries, newQuery],
            currentQueryIndex: queryIndex + 1,
        };
    }

    static _getHistoryQuery = (queryIndex, queryHistory) => {
        const queries = [...queryHistory];
        const query = queries[queryIndex];
        if (query) {
            return {
                query,
                currentQueryIndex: queryIndex
            }
        }
    }
}

export default StoreManager;
