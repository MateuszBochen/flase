import React, {Component} from "react";
import Column from "./Column";


class Row extends Component {
    static totalTime = 0;
    columnRender = (rowItem, columns) => {
        return columns.map((column) => {
            const cellValue = rowItem.rowValues[column.name];
            const key = `${rowItem.id}_${column.name}${cellValue}`;

            return <Column key={key} column={column} rowItem={rowItem} id={key}/>
        });
    }

    render () {
        const {rowItem, columns} = this.props;
        return (
            <tr>
                {this.columnRender(rowItem, columns)}
            </tr>
        );
    }
}

export default Row;
