import initialState from './initialState';
import {v4 as uuidv4} from 'uuid';
import DriverFactory from '../../../Driver/DriverFactory';


class Reducer {
    static CHANGE_QUERY = 'CHANGE_QUERY';
    static GO_TO_QUERY_HISTORY = 'GO_TO_QUERY_HISTORY';

    initialState = initialState;
    driverAdapter;
    temporaryRecords = [];

    constructor(dataForInitialState) {
        this.initialState = {...this.initialState, ...dataForInitialState};
        this.driverAdapter = DriverFactory.getDriver();
    }


    getReducer = (state = this.initialState, action) => {
        switch (action.type) {
            case Reducer.CHANGE_QUERY: {
                const newState = {
                    ...state,
                    ...this._addQueryToHistory(action.data, state.queryHistory, state.currentQueryIndex)
                };

                const limits = this.driverAdapter.getLimitOfQuery(newState.query);

                newState.offset = limits.offset;
                newState.limit = limits.limit;
                newState.queryLoading = true;
                this.temporaryRecords = [];

                return newState;
            }
            case 'RELOAD_QUERY': {
                const newState = {...state};
                newState.query = action.data;
                newState.records = [];
                this.temporaryRecords = [];
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
            case Reducer.GO_TO_QUERY_HISTORY: {
                const newState = {
                    ...state,
                    ...this._getHistoryQuery(action.data, state.queryHistory),
                };

                const limits = this.driverAdapter.getLimitOfQuery(newState.query);

                newState.offset = limits.offset;
                newState.limit = limits.limit;
                newState.records = [];
                this.temporaryRecords = [];

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

                this.temporaryRecords = [...this.temporaryRecords, recordItem];

                // console.log('ffff', temporaryRecords.length, state.totalRows);

                if (state.totalRows > 0) {
                    const alreadySows = (state.totalRows - state.offset);

                    // console.log('gg', alreadySows, temporaryRecords.length, state.totalRows, state.limit, state.totalRows);
                    const minValueOfRecordToShow = Math.min(state.limit, alreadySows);
                    if (minValueOfRecordToShow === this.temporaryRecords.length) {
                        newState.records = this.temporaryRecords;
                        newState.queryLoading = false;
                    }
                }

                return newState;
            }
            default:
                return state;
        }
    };


    _addQueryToHistory = (newQuery, queryHistory, queryIndex) => {
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

    _getHistoryQuery = (queryIndex, queryHistory) => {
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

export default Reducer;
