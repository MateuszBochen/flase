import {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import Trace from './Trace';
import './css/style.css';


class SnackTraceUI extends Component {
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
