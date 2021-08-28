import BaseAction from "./BaseAction";


class TableDataAction extends BaseAction {

    createTabEntry = (tabNumber) => {
        this.makeDispatch('TableDataAction_CreateTabEntry', tabNumber);
    }

    deleteTabEntry = (tabNumber) => {
        this.makeDispatch('TableDataAction_DeleteTabEntry', tabNumber);
    }
}

export default TableDataAction;
