import BaseRequest from './BaseRequest';


class DataBaseRequest extends BaseRequest{

    getDataBaseList = () => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/login', {
            host: localStorage.getItem('host'),
            login: localStorage.getItem('login'),
            password: localStorage.getItem('password'),
        });
    };

    getTablesForDatabase = (databaseName) => {
        return this.promiseDoRequest(BaseRequest.METHOD_POST, '/api/get-tables', {
            host: localStorage.getItem('host'),
            login: localStorage.getItem('login'),
            password: localStorage.getItem('password'),
            databaseName,
        });
    }
}

export default DataBaseRequest;
