import {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import Trace from './Trace';
import './css/style.css';
import StoreManager from '../Store/StoreManager';


class SnackTraceUI extends Component {

    componentDidMount() {
        setInterval(() => {
            const {traces} = this.props;
            if (traces.length) {
                StoreManager.getInstance().removeItem(0);
            }

        }, 5000);
    }

    render() {
        const {traces} = this.props;
        return (
            <div className="SnackTrace">
                {traces.map((trace, index) => <Trace index={index} trace={trace} key={`${index}${trace.message}`} />)}
            </div>
        );
    };
}
const mapStateToProps = (state) => ({...state});
export default connect(mapStateToProps)(SnackTraceUI);
