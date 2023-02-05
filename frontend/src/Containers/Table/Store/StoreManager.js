import thunk from 'redux-thunk';
import {createStore, applyMiddleware, compose} from 'redux';
import DriverFactory from '../../../Driver/DriverFactory';
import Reducer from './Reducer';


class StoreManager {
    static storages = {};
    static DEFAULT_LIMIT = 50;

    static createStore = (props) => {
        const middleware = applyMiddleware(thunk);
        const enhancer = compose(
            middleware,
        );

        const driverAdapter = DriverFactory.getDriver();
        let defaultQuery = driverAdapter.simpleSelectQuery(props.tableName, StoreManager.DEFAULT_LIMIT);

        if (props.query) {
            defaultQuery = props.query;
        }

        const limits = driverAdapter.getLimitOfQuery(defaultQuery);

        const tabIndex = props.tabIndex;

        const initialState  = {
            tabIndex: props.tabIndex,
            tableName: props.tableName,
            database: props.database,
            offset: limits.offset,
            limit: limits.limit,
            query: defaultQuery,

        };

        const reducer = (new Reducer(initialState)).getReducer;

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
}

export default StoreManager;
