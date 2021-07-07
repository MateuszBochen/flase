import React, {Component} from "react";
import { Spinner } from "react-bootstrap";
import DataBaseAction from '../../Actions/DataBaseAction';
import DataBaseRequest from '../../API/DataBaseRequest';
import BaseRequest from '../../API/BaseRequest';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';


class DatabaseListItem extends Component {
    constructor(props) {
        super(props);
        const { databaseItem } = this.props;
        this.dataBaseAction = new DataBaseAction();
        this.dataBaseRequest = new DataBaseRequest();
        this.workPlaceAction = new WorkPlaceAction();

        const isOpen = localStorage.getItem(`DatabaseListItem_${databaseItem.name}`) || false;

        this.state = {
            isOpen,
        };

        if (isOpen) {
            this.loadTables(databaseItem.name);
        }
    }

    toggleStatusOpen = () => {
        const { databaseItem } = this.props;
        const { isOpen } = this.state;
        const newStatus = !isOpen;
        this.setState({isOpen: newStatus});
        localStorage.setItem(`DatabaseListItem_${databaseItem.name}`, newStatus ? 'open' : '');
        if (newStatus) {
            this.loadTables(databaseItem.name);
        }
    }

    onMouseDownHandler = (e) => {

    }

    loadTables = (dataBaseName) => {
        this.dataBaseRequest
            .getTablesForDatabase(dataBaseName)
            .then((response) => {
                if (response.status === BaseRequest.STATUS_OK) {
                    this.dataBaseAction
                        .setTablesToDataBase(dataBaseName, response.data.data);
                }
            });
    }

    showTables = (tables) => {
        const { databaseItem } = this.props;

        if (!tables.isLoaded) {
            return (
                <ul className="data-base-tables-list">
                    <li className="loading-item">
                        <Spinner as="span"
                                 animation="border"
                                 size="sm"
                                 role="status"
                                 aria-hidden="true"
                                 variant="secondary"
                        />
                    </li>
                </ul>
            );
        }
        return (
            <ul className="data-base-tables-list">
                {tables.tables.map(item => (
                    <li
                        key={`${databaseItem.name}_${item}`}
                        onClick={() => this.workPlaceAction.openTableDataTab(databaseItem.name, item)}
                        onMouseDown={(e) => e.button === 1&& this.workPlaceAction.addNewTableDataTab(databaseItem.name, item)}
                    >
                        {item}
                    </li>
                ))}
            </ul>
        );
    }

    render() {
        const { isOpen } = this.state;
        const { databaseItem } = this.props;

        return (
            <li
                className="data-base-name"
                onClick={this.toggleStatusOpen}
            >
                {databaseItem.name}
                <div
                    className="data-base-tables-list" style={{display: isOpen ? 'block' : 'none'}}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                >
                    {this.showTables(databaseItem.tables)}
                </div>
            </li>
        )
    }
}

export default DatabaseListItem;