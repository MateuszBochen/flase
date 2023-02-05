import thunk from 'redux-thunk';
import {createStore, applyMiddleware, compose} from 'redux';
import DriverFactory from '../../../Driver/DriverFactory';
import Reducer from './Reducer';


class StoreManager {
    static instances = {};
    static DEFAULT_LIMIT = 50;

    store = undefined;

    static createStore = (props) => {
        const tabIndex = props.tabIndex;
        if (!StoreManager.instances[tabIndex]) {
            console.log('create new store instance', tabIndex);
            StoreManager.instances[tabIndex] = new StoreManager(props);
        }
    }

    static getStore = (tabIndex) => {
        const instance = StoreManager.getInstance(tabIndex);
        return instance.getReactStore();
    }

    /** @deprecated */
    static dispatch = (tabIndex, action, data) => {
        const instance = StoreManager.getInstance(tabIndex);
        const reactStorage = instance.getReactStore();
        reactStorage.dispatch({
            type: action,
            data: data,
        });
    }

    static getInstance = (tabIndex) => {
        if (!StoreManager.instances[tabIndex]) {
            console.log(StoreManager.instances);
            throw new Error(`Given ${tabIndex} tab index not exist`);
        }

        return StoreManager.instances[tabIndex];
    };

    constructor(props) {
        const middleware = applyMiddleware(thunk);
        const enhancer = compose(middleware,);

        const driverAdapter = DriverFactory.getDriver();
        let defaultQuery = driverAdapter.simpleSelectQuery(props.tableName, StoreManager.DEFAULT_LIMIT);

        if (props.query) {
            defaultQuery = props.query;
        }

        const limits = driverAdapter.getLimitOfQuery(defaultQuery);

        const initialState  = {
            tabIndex: props.tabIndex,
            tableName: props.tableName,
            database: props.database,
            offset: limits.offset,
            limit: limits.limit,
            query: defaultQuery,
            queryHistory: [defaultQuery]
        };

        const reducer = (new Reducer(initialState)).getReducer;

        this.store = createStore(reducer, enhancer);
    }

    getReactStore = () => {
        return this.store;
    }

    reactDispatch = (action, data) => {
        const reactStore = this.getReactStore();
        reactStore.dispatch({
            type: action,
            data: data,
        });
    }

    getCurrentQuery = () => {
        return this.getReactStore().getState().query;
    }

    getCurrentDatabase = () => {
        return this.getReactStore().getState().database;
    }

    getCurrentLimit = () => {
        return this.getReactStore().getState().limit;
    }

    getCurrentTotalRows = () => {
        return this.getReactStore().getState().totalRows;
    }

    getHistoryQuery = (queryIndex) => {
        const history = [...this.getReactStore().getState().queryHistory];
        return history[queryIndex];
    }
}

export default StoreManager;
