import BaseAction from './BaseAction';


class LoginAction extends BaseAction {
    static SET_LOGIN_ACTION = 'LoginAction_SetLogin';

    setLogin = (host, login, password) => {
        this.makeDispatch(
            LoginAction.SET_LOGIN_ACTION,
            {
                host,
                login,
                password,
            }
        );
    }
}

export default LoginAction;
