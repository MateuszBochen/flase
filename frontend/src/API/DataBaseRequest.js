import BaseAction from '../Actions/BaseAction';
import WebSocketClientFactory from '../Library/WebSocketClientFactory';



class DataBaseRequest extends BaseAction {

    getDataBaseList = () => {

    };

    getTablesForDatabase = (databaseName) => {
        this.makeDispatch('DataBaseRequest_ClearTablesListFromDataBase', databaseName);

         WebSocketClientFactory.getClient()
            .getTablesForDatabase(databaseName);
    }
}

export default DataBaseRequest;
