import React, {Component} from 'react';
import DataBaseRequest from '../../API/DataBaseRequest';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import TablesList from './TablesList';


class DatabaseListItem extends Component {
    constructor(props) {
        super(props);
        const { databaseItem } = this.props;
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

    loadTables = (dataBaseName) => {
        this.dataBaseRequest
            .getTablesForDatabase(dataBaseName);
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
                    <TablesList databaseItem={databaseItem.tables} databaseName={databaseItem.name} />
                </div>
            </li>
        )
    }
}

export default DatabaseListItem;