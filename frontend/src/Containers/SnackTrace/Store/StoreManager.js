import {createStore, applyMiddleware, compose} from 'redux';
import thunk from 'redux-thunk';
import Reducer from "./Reducer";

class StoreManager {

    static instance = null;

    store = null

    constructor(store) {
        this.store = store;
    }


    static createStore() {
        if (StoreManager.instance) {
            return;
        }

        const middleware = applyMiddleware(thunk);
        const enhancer = compose(
            middleware,
        );

        const reducer = (new Reducer()).getReducer;
        StoreManager.instance = new StoreManager(createStore(reducer, enhancer));
    }

    static getInstance() {
        if (!StoreManager.instance) {
            StoreManager.createStore();
        }

        return StoreManager.instance;
    }

    static getStore() {
        return StoreManager.getInstance().getReduxStore();
    }

    getReduxStore() {
        return this.store;
    }

    removeItem(index) {
        this.store.dispatch({
            type: Reducer.REMOVE_ITEM,
            data: index,
        });
    }

    addItem(message) {
        this.store.dispatch({
            type: Reducer.ADD_ITEM,
            data: message,
        });
    }
}

export default StoreManager;
