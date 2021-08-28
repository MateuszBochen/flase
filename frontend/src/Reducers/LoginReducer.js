import WebSocketClientFactory from '../Library/WebSocketClientFactory';


class LoginReducer {
    constructor() {
        this.initalState = {
            token: localStorage.getItem('flase.token'),
        }
    }


    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'LoginAction_SetLogin':
                return this.setLogin(state, action.data);
            case 'LOGOUT':
                return this.logout(state);
            default:
                return state;
        }
    }


    setLogin = (state, data) => {
        const newState = { ...state };
        newState.token = data.token;
        localStorage.setItem('flase.token', data.token);
        WebSocketClientFactory.createNewClient(data.token);
        return newState;
    }

    logout = (state) => {
        const newState = { ...state };
        newState.token = null;
        localStorage.setItem('flase.token', '');
        WebSocketClientFactory.closeConnection();
        return newState;
    }
}

export default LoginReducer;
