import BaseAction from './BaseAction';


class LoginAction extends BaseAction {
    static SET_LOGIN_ACTION = 'LoginAction_SetLogin';

    setLogin = (token) => {
        this.makeDispatch(
            LoginAction.SET_LOGIN_ACTION,
            {
                token,
            }
        );
    }
}

export default LoginAction;
