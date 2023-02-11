

class TableInformation {
    static instance = undefined;

    databases = {};

    static getInstance() {
        if (!TableInformation.instance) {
            TableInformation.instance = new TableInformation();
        }

        return TableInformation.instance;
    }


    addTableInformationFromSocket = (socketData) => {
        if (!this.databases[socketData.dataBaseName]) {
            console.log('addTableInformationFromSocket - crate database');
            this.databases[socketData.dataBaseName] = {};
        }

        if (!this.databases[socketData.dataBaseName][socketData.tableName]) {
            console.log('addTableInformationFromSocket - crate table');
            this.databases[socketData.dataBaseName][socketData.tableName] = {};
        }

        this.databases[socketData.dataBaseName][socketData.tableName] = {
            tableName: socketData.tableName,
            databaseName: socketData.dataBaseName,
            columns: socketData.columns,
            preload: socketData.preload,
            primaryColumns: socketData.primaryColumns,
            uniqueColumns: socketData.uniqueColumns,
        }
    }

    tableIsReady = (stringDatabaseName, stringTableName) => {
        if (!this._tableExist(stringDatabaseName, stringTableName)) {
            return false;
        }

        return this.databases[stringDatabaseName][stringTableName].preload;
    }

    getPrimaryKeysFromTable = (tableObject) => {
        if (!this._tableExist(tableObject.databaseName, tableObject.name)) {
            return null;
        }

        return this.databases[tableObject.databaseName][tableObject.name].primaryColumns;
    }


    _tableExist = (stringDatabaseName, stringTableName) => {
        if (!this.databases[stringDatabaseName]) {
            return false;
        }

        return !!this.databases[stringDatabaseName][stringTableName];
    }
}

export default TableInformation;
