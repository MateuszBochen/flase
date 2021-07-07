import BaseRequest from './BaseRequest';


class LoginRequest extends BaseRequest{

    login = (host, login, password) => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/login', {
            host,
            login,
            password,
        })
    };
}

export default LoginRequest;
