import {Component} from 'react';
import StoreManager from '../Store/StoreManager';


class Trace extends Component {

    componentDidMount() {
        const {index} = this.props;
        setInterval(() => {
            StoreManager.getInstance().removeItem(index);
        }, 5000 * (index+1));
    }

    render() {
        const storeManager = StoreManager.getInstance();

        const {index, trace} = this.props;
        console.log('44433332', [trace.type, trace.message]);
        return (
            <div className={`trace-item ${trace.type}`}>
                {trace.message}
                <button onClick={() => storeManager.removeItem(index)}>x</button>
            </div>
        );
    }
}

export default Trace;
