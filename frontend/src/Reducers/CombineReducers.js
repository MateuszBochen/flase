import { combineReducers } from 'redux';
import LoginReducer from './LoginReducer';
import DatabaseListReducer from './DatabaseListReducer';
import WorkPlaceReducer from './WorkPlaceReducer';
import TableDataReducer from './TableDataReducer';

export default combineReducers({
    login: (new LoginReducer()).handler,
    databaseList: (new DatabaseListReducer()).handler,
    workPlace: (new WorkPlaceReducer()).handler,
    tableData: (new TableDataReducer()).handler,
});
