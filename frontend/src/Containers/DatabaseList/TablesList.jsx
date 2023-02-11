import React, {Component} from 'react';
import {Spinner} from 'react-bootstrap';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';


class TablesList extends Component {

    constructor(props) {
        super(props);
        this.workPlaceAction = new WorkPlaceAction();

        this.state = {
            filter: '',
        }
    }


    renderTableNames = (tables) => {
        const { databaseName } = this.props;
        return Object.entries(tables).map(([key]) => {
            const table = tables[key];
            console.log('table', table);

           if (table.tableName.includes(this.state.filter)) {
               return (
                   <li
                       className={table.preload ? 'preload' : ''}
                       key={`${table.tableName}`}
                       onClick={() => this.workPlaceAction.openTableDataTab(databaseName, table.tableName)}
                       onMouseDown={(e) => e.button === 1&& this.workPlaceAction.addNewTableDataTab(databaseName, table.tableName)}
                   >
                       {table.tableName}
                   </li>
               );
           }

        });
    }


    render() {
        const { databaseItem } = this.props;
        const { tables, isLoaded } = databaseItem;
        const { filter } = this.state;
        console.log(tables, isLoaded);

        // return <div/>;

        if (!isLoaded) {
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
                <li className="data-base-tables-list-search-item">
                    <input
                        type="text"
                        className="form-control"
                        value={filter}
                        onChange={(e) => this.setState({filter: e.target.value.toLowerCase()})}
                    />
                </li>
                {this.renderTableNames(tables)}
                {/*{tables.tables.filter((item) => item.toLowerCase().includes(filter)).map(item => (
                    <li
                        key={`${databaseItem.name}_${item}`}
                        onClick={() => this.workPlaceAction.openTableDataTab(databaseItem.name, item)}
                        onMouseDown={(e) => e.button === 1&& this.workPlaceAction.addNewTableDataTab(databaseItem.name, item)}
                    >
                        {item}
                    </li>
                ))}*/}
            </ul>
        );
    }
}

export default TablesList;