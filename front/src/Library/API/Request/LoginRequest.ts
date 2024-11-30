import BaseRequest from './BaseRequest';
import ConnectionRequestInterface from '../../Connection/Interface/ConnectionRequestInterface';


class LoginRequest extends BaseRequest{

    login = (connection: ConnectionRequestInterface) => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/login', connection);
    };
}

export default LoginRequest;
