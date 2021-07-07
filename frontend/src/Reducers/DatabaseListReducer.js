
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
            case 'DataBaseAction_setTablesToDataBase':
                return this.setTablesListToDatabase(state, action.data.databaseName, action.data.tablesList);
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
}

export default DatabaseListReducer;
