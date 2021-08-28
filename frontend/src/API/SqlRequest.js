import BaseRequest from './BaseRequest';
import WebSocketClientFactory from "../Library/WebSocketClientFactory";
import WebSocketOutMessage from "../Library/DataTypes/WebSocketOutMessage";


class SqlRequest extends BaseRequest {

    query = (databaseName, query, tabIndex) => {

        const message =  new WebSocketOutMessage('SELECT_QUERY', [databaseName, query, tabIndex]);

        const websocketClient = WebSocketClientFactory.getClient();
        websocketClient.sendMessage(message);
    }

    simpleUpdate = (databaseName, tableName, primaryColumn, primaryValue, columnToUpdate, valueToUpdate) => {
        const query = `UPDATE \`${tableName}\` SET \`${columnToUpdate}\` = '${valueToUpdate}' WHERE \`${primaryColumn}\` = '${primaryValue}'`;
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
