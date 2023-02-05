import React, {Component} from 'react';
import StoreManager from './Store/StoreManager';
import { Provider } from 'react-redux';
import TableDataRender from './UI/TableDataRender';

class TableData extends Component {
    constructor(props) {
        super(props);
        StoreManager.createStore(this.props);
    }

    render() {
        const { tabIndex } = this.props;
        return(
            <Provider store={StoreManager.getStore(tabIndex)}>
                <TableDataRender />
            </Provider>
        );
    }

}
export default TableData;
