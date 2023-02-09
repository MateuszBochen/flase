import TableDataItem from '../Library/DataTypes/TableDataItem';
import StoreManager from '../Containers/Table/Store/StoreManager';


class TableDataReducer {
    constructor() {
        this.initalState = {
            tabs: {},
        }
    }

    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'TableDataAction_CreateTabEntry':
                return this.createTabEntry(state, action.data);
            case 'TableDataAction_DeleteTabEntry':
                return this.deleteTabEntry(state, action.data);
            case 'SOCKET_SET_SELECT_QUERY_COLUMNS':
                return this.setTableColumns(state, action.data.tabIndex, action.data.columns);
            case 'SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW':
                return this.appendRowToRecords(state, action.data.tabIndex, action.data.row);
            case 'SOCKET_SET_SELECT_QUERY_TOTAL_ROWS':
                return this.setTotalRows(state, action.data.tabIndex, action.data.totalRows);
            case 'SOCKET_SET_SELECT_QUERY_INDEXES':
                return this.setTableKeys(state, action.data.tabIndex, action.data.tableKeys);
            default:
                return state;
        }
    }


    setTableColumns = (state, tabNumber, columns) => {
        StoreManager.dispatch(tabNumber, 'SOCKET_SET_SELECT_QUERY_COLUMNS', columns);

        return state;
    }

    setTableKeys = (state, tabNumber, keys) => {
        StoreManager.dispatch(tabNumber, 'SOCKET_SET_SELECT_QUERY_INDEXES', keys);
        return state;
    }

    appendRowToRecords = (state, tabNumber, row) => {
        StoreManager.dispatch(tabNumber, 'SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW', row);
        return state;
    }

    setTotalRows = (state, tabNumber, totalRows) => {
        StoreManager.dispatch(tabNumber, 'SOCKET_SET_SELECT_QUERY_TOTAL_ROWS', totalRows);
        return state;
    }

    createTabEntry = (state, tabNumber) => {
        const newState = {...state};
        newState.tabs[tabNumber] = new TableDataItem();
        return newState;
    }

    deleteTabEntry = (state, tabNumber) => {

        if (state.tabs[tabNumber]) {
            const newState = {...state};
            delete newState.tabs[tabNumber];
            return newState;
        }
        return state;
    }
}

export default TableDataReducer;