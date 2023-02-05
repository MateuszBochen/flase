import initialState from './initialState';

class Reducer {
    static REMOVE_ITEM = 'remove_item';
    static ADD_ITEM = 'add_item';

    getReducer = (state = initialState, action) =>{
        switch (action.type) {
            case Reducer.REMOVE_ITEM:
                return this.removeItem(state, action.data);
            case Reducer.ADD_ITEM:
                return this.addItem(state, action.data);
            default:
                return state;
        }
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
