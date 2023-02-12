import initialState from './initialState';

class Reducer {
    static REMOVE_ITEM = 'remove_item';
    static SET_PREVENT_REMOVE = 'SET_PREVENT_REMOVE';
    static ADD_ITEM = 'add_item';

    getReducer = (state = initialState, action) =>{
        switch (action.type) {
            case Reducer.REMOVE_ITEM:
                return this.removeItem(state, action.data);
            case Reducer.ADD_ITEM:
                return this.addItem(state, action.data);
            case Reducer.SET_PREVENT_REMOVE:
                return this.setPreventRemove(state, action.data);
            default:
                return state;
        }
    }

    setPreventRemove = (state, preventRemove) => {
        const newState = {...state};
        newState.preventRemove = preventRemove;
        return newState;
    }

    addItem = (state, message) => {
        const newState = {...state};
        const newList = [...newState.traces];
        newList.push(message);

        newState.traces = newList;
        return newState;
    }

    removeItem = (state, index) => {
        if (index <= -1) {
            return state;
        }

        const newState = {...state};
        const newList = [...newState.traces];

        newList.splice(index, 1);
        newState.traces = newList;

        return newState;
    }
}

export default Reducer;
