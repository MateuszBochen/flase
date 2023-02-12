import {Component} from 'react';
import StoreManager from '../Store/StoreManager';


class Trace extends Component {

    constructor(props) {
        super(props);
        this.storeManager = StoreManager.getInstance();
    }

    render() {
        const {index, trace} = this.props;

        return (
            <div
                className={`trace-item ${trace.type}`}
                onMouseEnter={() => this.storeManager.setPreventRemove(true)}
                onMouseLeave={() => this.storeManager.setPreventRemove(false)}
            >
                {trace.message}
                <button onClick={() => this.storeManager.removeItem(index)}>x</button>
            </div>
        );
    }
}

export default Trace;
