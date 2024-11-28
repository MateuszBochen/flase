import store from '../store';

class BaseAction {
    makeDispatch = (actionName, data) => {
        store.dispatch({
            type: actionName,
            data,
        });
    };
}

export default BaseAction;
