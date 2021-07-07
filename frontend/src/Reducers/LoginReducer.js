

class LoginReducer {
    constructor() {
        this.initalState = {
            host: localStorage.getItem('host'),
            login: localStorage.getItem('login'),
            password: localStorage.getItem('password'),
        }
    }


    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'LoginAction_SetLogin':
                return this.setLogin(state, action.data)
            default:
                return state;
        }
    }


    setLogin = (state, data) => {
        const newState = { ...state };
        newState.host = data.host;
        newState.login = data.login;
        newState.password = data.password;

        localStorage.setItem('host', data.host);
        localStorage.setItem('login', data.login);
        localStorage.setItem('password', data.password);

        return newState;
    }
}

export default LoginReducer;
