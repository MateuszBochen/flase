import React, {Component} from 'react';
import Column from './Column';


class Row extends Component {
    static totalTime = 0;
    columnRender = (rowItem, columns, tabIndex) => {
        return columns.map((column) => {
            const cellValue = rowItem.rowValues[column.name];
            const key = `${rowItem.id}_${column.name}${cellValue}`;

            return <Column key={key} column={column} rowItem={rowItem} id={key} tabIndex={tabIndex} />
        });
    }

    render () {
        const {rowItem, columns, tabIndex} = this.props;
        return (
            <tr>
                {this.columnRender(rowItem, columns, tabIndex)}
            </tr>
        );
    }
}

export default Row;
