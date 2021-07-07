import BaseRequest from './BaseRequest';


class SqlRequest extends BaseRequest {

    query = (databaseName, query) => {
        const url = '/api/select/get-data';


        return this.promiseDoRequest(BaseRequest.METHOD_POST, url, {
            host: localStorage.getItem('host'),
            login: localStorage.getItem('login'),
            password: localStorage.getItem('password'),
            databaseName,
            query,
        });

    }

}

export default SqlRequest;
