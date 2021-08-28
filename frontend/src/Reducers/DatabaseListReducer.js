
class DatabaseListReducer {
    constructor() {
        this.initalState = {
            listIsLoaded: false,
            list: [],
        }
    }


    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'DataBaseAction_setDatabasesList':
                return this.setDatabasesList(state, action.data);
            case 'DataBaseRequest_ClearTablesListFromDataBase':
                return this.clearTablesList(state, action.data);
            case 'DataBaseAction_setTablesToDataBase':
                return this.setTablesListToDatabase(state, action.data.databaseName, action.data.tablesList);
            case 'SOCKET_DATABASE_LIST_APPEND_DATA':
                return this.appendItem(state, action.data);
            case 'SOCKET_GET_TABLES_FOR_DATABASE':
                return this.appendTableToDatabaseList(state, action.data.dataBaseName, action.data.tableName);
            default:
                return state;
        }
    }

    setDatabasesList = (state, data) => {
        const newState = { ...state };
        newState.listIsLoaded = true;
        newState.list = [];

        data.forEach((item) => {
            const dataBaseItem = {};
            dataBaseItem.name = item.Database;
            dataBaseItem.tables = {
                isLoaded: false,
                tables: [],
            };
            newState.list.push(dataBaseItem);
        });

        return newState;
    }

    appendItem = (state, data) => {
        const newState = { ...state };
        newState.listIsLoaded = true;

        const dataBaseItem = {};
        dataBaseItem.name = data.Database;
        dataBaseItem.tables = {
            isLoaded: false,
            tables: [],
        };

        newState.list.push(dataBaseItem);
        return newState;
    }

    setTablesListToDatabase = (state, databaseName, tablesList) => {
        const newState = { ...state };

        newState.list = newState.list.map((item) => {
            if (item.name === databaseName) {
                const newItem = { ...item };
                newItem.tables.isLoaded = true;
                newItem.tables.tables = tablesList;
                return newItem;
            } else {
                return item;
            }
        });

        return newState;
    }

    appendTableToDatabaseList = (state, databaseName, tableName) => {
        if (!tableName) {
            return state;
        }
        const newState = { ...state };

        newState.list = newState.list.map((item) => {
            if (item.name === databaseName) {
                const newItem = { ...item };
                newItem.tables.isLoaded = true;
                if (!newItem.tables.tables.includes(tableName)) {
                    newItem.tables.tables.push(tableName);
                }
                return newItem;
            } else {
                return item;
            }
        });

        return newState;
    }

    clearTablesList = (state, databaseName) => {
        const newState = { ...state };
        newState.list = newState.list.map((item) => {
            if (item.name === databaseName) {
                const newItem = { ...item };
                newItem.tables.isLoaded = false;
                newItem.tables.tables = [];
                return newItem;
            } else {
                return item;
            }
        });

        return newState;
    }
}

export default DatabaseListReducer;
