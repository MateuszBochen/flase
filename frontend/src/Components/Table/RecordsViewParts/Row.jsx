import React, {Component} from 'react';
import Column from './Column';

class Row extends Component {
    static totalTime = 0;
    columnRender = (rowItem, columns, tabIndex, cellRender) => {
        return columns.map((column) => {
            const cellValue = rowItem.rowValues[column.name];
            const key = `${rowItem.id}_${column.name}${cellValue}`;

            if (cellRender) {
                const cellProps = {
                    key: key,
                    column,
                    rowItem,
                    id: key,
                    tabIndex,
                }

                return React.createElement(cellRender, cellProps);
            }

            return <Column key={key} column={column} rowItem={rowItem} id={key} tabIndex={tabIndex} />
        });
    }

    render () {
        const {rowItem, columns, tabIndex, cellRender} = this.props;

        return (
            <tr>
                {this.columnRender(rowItem, columns, tabIndex, cellRender)}
            </tr>
        );
    }
}

export default Row;
