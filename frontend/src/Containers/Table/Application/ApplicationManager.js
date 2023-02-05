import StoreManager from '../Store/StoreManager';
import SqlRequest from '../../../API/SqlRequest';
import DriverFactory from '../../../Driver/DriverFactory';
import Reducer from '../Store/Reducer';


class ApplicationManager {
    static instances = {};

    tabIndex = undefined;
    /** @type StoreManager */
    storeManager = undefined;
    sqlRequest = undefined;

    static getInstance = (tabIndex) => {
        if (!ApplicationManager.instances[tabIndex]) {
            ApplicationManager.instances[tabIndex] = new ApplicationManager(tabIndex);
        }

        return ApplicationManager.instances[tabIndex];
    }

    constructor(tabIndex) {
        this.tabIndex = tabIndex;
        console.log('create new ApplicationManager instance', tabIndex);
        this.storeManager = StoreManager.getInstance(tabIndex);
        this.sqlRequest = new SqlRequest();
        this.driverAdapter = DriverFactory.getDriver();
    }

    sendQuery = (newQuery) => {
        const query = this.storeManager.getCurrentQuery();
        const database = this.storeManager.getCurrentDatabase();

        if (newQuery) {
            this.storeManager.reactDispatch(
                Reducer.CHANGE_QUERY,
                newQuery,
            );
        }

        this.sqlRequest
            .query(database, newQuery ?? query, this.tabIndex);
    }

    changePage = (newPageNumber) => {
        if (newPageNumber < 0) {
            return;
        }

        const limit = this.storeManager.getCurrentLimit();
        const totalRows = this.storeManager.getCurrentTotalRows();
        const newLimit = newPageNumber * limit;

        if (newLimit > totalRows) {
            return;
        }

        const query = this.storeManager.getCurrentQuery();
        const newQuery = this.driverAdapter.setLimitToSql(query, newLimit, limit);
        const database = this.storeManager.getCurrentDatabase();

        this.storeManager.reactDispatch(
            Reducer.CHANGE_QUERY,
            newQuery,
        );

        this.sqlRequest
            .query(database, newQuery, this.tabIndex);
    }

    changeOrderBy = (column, direction) => {
        const query = this.storeManager.getCurrentQuery();
        const newQuery = this.driverAdapter.setOrderByToSql(query, column.name, direction);
        const database = this.storeManager.getCurrentDatabase();

        this.storeManager.reactDispatch(
            Reducer.CHANGE_QUERY,
            newQuery,
        );

        this.sqlRequest
            .query(database, newQuery, this.tabIndex);
    }

    historyQuery = (queryIndex) => {
        const queryFromHistory = this.storeManager.getHistoryQuery(queryIndex);
        const database = this.storeManager.getCurrentDatabase();

        this.storeManager.reactDispatch(
            Reducer.GO_TO_QUERY_HISTORY,
            queryIndex,
        );

        this.sqlRequest
            .query(database, queryFromHistory, this.tabIndex);
    }
}

export default ApplicationManager;
