import BaseRequest from './BaseRequest';
import EstablishedUser from '../../Connection/Interface/EstablishedUser';


class RefreshTokenRequest extends BaseRequest {

    /** new token for the same server session */
    refresh = (user: EstablishedUser): Promise<EstablishedUser> => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/refresh', {token: user.token}).then((response) => {
            return response.data;
        });
    };
}

export default RefreshTokenRequest;
