import BaseRequest from './BaseRequest';
import ConnectionRequestInterface from '../../Connection/Interface/ConnectionRequestInterface';
import EstablishedUser from '../../Connection/Interface/EstablishedUser';
import EstablishedConnectionInterface from '../../Connection/Interface/EstablishedConnectionInterface';


class DisconnectRequest extends BaseRequest{

    disconnect = (connection: EstablishedConnectionInterface):Promise<null> => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/disconnect', connection.user).then((response) => {
            return null;
        }).catch(() => {
            return null;
        });
    };
}

export default DisconnectRequest;
