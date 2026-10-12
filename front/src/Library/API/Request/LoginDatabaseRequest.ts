import BaseRequest from './BaseRequest';
import EstablishedUser from '../../Connection/Interface/EstablishedUser';


class LoginDatabaseRequest extends BaseRequest {

    /** session of other database of PostgreSQL server, login of the given session is used */
    login = (user: EstablishedUser, database: string): Promise<EstablishedUser> => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/login/database', {token: user.token, database}).then((response) => {
            return response.data;
        });
    };
}

export default LoginDatabaseRequest;
