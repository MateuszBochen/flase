import StoreManager from '../Store/StoreManager';
import SqlRequest from '../../../API/SqlRequest';
import DriverFactory from '../../../Driver/DriverFactory';
import Reducer from '../Store/Reducer';
import WorkPlaceAction from '../../../Actions/WorkPlaceAction';

class ApplicationManager {
    static DEFAULT_LIMIT = 50;
    static instances = {};

    tabIndex = undefined;
    sqlRequest = undefined;

    /** @type StoreManager */
    storeManager = undefined;

    /** @type WorkPlaceAction */
    workPlaceAction = undefined;

    /** @type MysqlAdapter */
    driverAdapter = undefined;

    static createNewInstance = (props) => {

        StoreManager.createStore({...props,  limit: ApplicationManager.DEFAULT_LIMIT});
        ApplicationManager.instances[props.tabIndex] = new ApplicationManager(props.tabIndex);
    }


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
        this.workPlaceAction = new WorkPlaceAction();
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

    /**
     * @param {Column} column
     * @param {string} value
     * */
    referenceOpenNewTab = (column, value) => {
        console.log('column', column);
        const query = this.driverAdapter.simpleSelectQuery(column.table.name, ApplicationManager.DEFAULT_LIMIT);
        const whereQuery = this.driverAdapter.setWhereToSql(query, column.name, value);

        this.workPlaceAction.addNewTableDataTab(column.table.databaseName, column.referenceTable, {query: whereQuery});
    }

    referenceOpenSameTab = (column, value) => {
        console.log('column', column);
        const query = this.driverAdapter.simpleSelectQuery(column.table.name, ApplicationManager.DEFAULT_LIMIT);
        const whereQuery = this.driverAdapter.setWhereToSql(query, column.name, value);
        this.sendQuery(whereQuery);
    }
}

export default ApplicationManager;
