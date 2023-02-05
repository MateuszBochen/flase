
class DatabaseListReducer {
    constructor() {
        this.initalState = {
            listIsLoaded: false,
            list: {},
        }
    }


    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'DataBaseAction_setDatabasesList':
                return this.setDatabasesList(state, action.data);
            case 'DataBaseRequest_ClearTablesListFromDataBase':
                return this.clearTablesList(state, action.data);
            case 'DataBaseAction_setTablesToDataBase':
                return this.setTablesListToDatabase(state, action.data.dataBaseName, action.data.tablesList);
            case 'SOCKET_DATABASE_LIST_APPEND_DATA':
                // adding new database to list.
                return this.appendItem(state, action.data);
            case 'SOCKET_GET_TABLES_FOR_DATABASE':
                // Adding Table to database.
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
            dataBaseItem.name = item.name;
            dataBaseItem.tables = {
                isLoaded: false,
                tables: [],
            };
            newState.list.push(dataBaseItem);
        });
        return newState;
    }

    appendItem = (state, data) => {
        // Database already added
        if (state.list[data.name]?.tables?.tables) {
            return state;
        }

        const newState = { ...state };
        newState.listIsLoaded = true;
        const dataBaseItem = {};
        dataBaseItem.name = data.name;
        dataBaseItem.tables = {
            isLoaded: false,
            tables: [],
        };

        newState.list[data.name] = dataBaseItem;
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
        if (!tableName || !databaseName) {
            return state;
        }
        let newState = {};
        if (!state.list[databaseName]?.tables?.tables) {
            newState = this.appendItem(state, {Database: databaseName});
        } else {
            newState = {...state};
        }

        const currentTablesList = newState.list[databaseName].tables.tables;
        if (!currentTablesList.includes(tableName)) {
            currentTablesList.push(tableName);
        }

        newState.list[databaseName].tables.tables = currentTablesList;
        newState.list[databaseName].tables.isLoaded = true;
        return newState;
    }

    clearTablesList = (state, databaseName) => {
        if (!state.list[databaseName].tables.tables) {
            return state;
        }

        const newState = { ...state };
        newState.list[databaseName].tables = {
            isLoaded: false,
            tables: [],
        };

        return newState;
    }
}

export default DatabaseListReducer;
