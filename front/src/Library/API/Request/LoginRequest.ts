import BaseRequest from './BaseRequest';
import ConnectionRequestInterface from '../../Connection/Interface/ConnectionRequestInterface';
import EstablishedUser from '../../Connection/Interface/EstablishedUser';


class LoginRequest extends BaseRequest{

    login = (connection: ConnectionRequestInterface):Promise<EstablishedUser> => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/login', connection).then((response) => {
            return response.data;
        });
    };
}

export default LoginRequest;
