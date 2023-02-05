import React, {Component} from 'react';
import { Provider } from 'react-redux';
import StoreManager from './Store/StoreManager';
import SnackTraceUI from './UI/SnackTraceUI';


class SnackTrace extends Component {
    constructor(props) {
        super(props);
        StoreManager.createStore();
    }

    render() {
        return(
            <Provider store={StoreManager.getStore()}>
                <SnackTraceUI />
            </Provider>
        );
    }
}

export default SnackTrace;
