import { combineReducers } from 'redux';

import LoginReducer from "./LoginReducer";
import DatabaseListReducer from './DatabaseListReducer';
import WorkPlaceReducer from './WorkPlaceReducer';

export default combineReducers({
    login: (new LoginReducer()).handler,
    databaseList: (new DatabaseListReducer()).handler,
    workPlace: (new WorkPlaceReducer()).handler,
});
