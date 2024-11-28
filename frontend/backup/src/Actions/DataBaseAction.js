import BaseAction from './BaseAction';


class DataBaseAction extends BaseAction {
    setDatabasesList = (list) => {
        this.makeDispatch('DataBaseAction_setDatabasesList', list);
    }

    setTablesToDataBase = (databaseName, tablesList) => {
        this.makeDispatch('DataBaseAction_setTablesToDataBase', {
            databaseName,
            tablesList
        });
    }
}

export default DataBaseAction;
