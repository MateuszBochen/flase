import {Component} from 'react';
import StoreManager from '../Store/StoreManager';


class Trace extends Component {
    render() {
        const storeManager = StoreManager.getInstance();

        const {index, trace} = this.props;
        return (
            <div className={`trace-item ${trace.type}`}>
                {trace.message}
                <button onClick={() => storeManager.removeItem(index)}>x</button>
            </div>
        );
    }
}

export default Trace;
