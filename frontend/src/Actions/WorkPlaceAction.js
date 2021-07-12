import BaseAction from './BaseAction';
import TableData from '../Containers/Table/TableData';

class WorkPlaceAction extends BaseAction {
    switchTab = (tabNumber) => {
        this.makeDispatch('WorkPlaceAction_switchTab', tabNumber);
    }

    addNewTableDataTab = (databaseName, table, props) => {
        const defProps = { ...props} || {};
        const data = {
            id: (new Date()).getTime(),
            tabName: `${databaseName}:${table}`,
            tabProperties: {
                database: databaseName,
                tableName: table,
                ...defProps
            },
            renderComponent: TableData,
        }
        this.addNewTab(data);
    };

    openTableDataTab = (databaseName, table, props) => {
        const defProps = { ...props} || {};
        const data = {
            id: (new Date()).getTime(),
            tabName: `${databaseName}:${table}`,
            tabProperties: {
                database: databaseName,
                tableName: table,
                ...defProps
            },
            renderComponent: TableData,
        }
        this.openInCurrentTab(data);
    };

    closeTab = (tabNumber) => {
        this.makeDispatch('WorkPlaceAction_closeTab', tabNumber);
    };

    openInCurrentTab = (newTab) => {
        this.makeDispatch('WorkPlaceAction_openInCurrentTab', newTab);
    }

    addNewTab = (newTab) => {
        this.makeDispatch('WorkPlaceAction_addNewTab', newTab);
    }
}

export default WorkPlaceAction;
