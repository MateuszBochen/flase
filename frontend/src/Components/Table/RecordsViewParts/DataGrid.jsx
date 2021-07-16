import React, {Component} from 'react';
class DataGrid extends Component {


    relationClickHandler = (e, column, value) => {
        e.stopPropagation();
        e.preventDefault();

        const { onReferenceClick } = this.props;
        if (typeof onReferenceClick === 'function') {
            onReferenceClick(e.button, column, value);
        }
    }


    columnRender = (rowItem, columns) => {
        return columns.map((column) => {
            if (typeof column === 'string') {
                return (
                    <td>
                        {rowItem[column]}
                    </td>
                );
            }


            if (column.referenceTable && column.referenceColumn) {
                return (
                    <td>
                        <span
                            onMouseDown={(e) => this.relationClickHandler(e, column, rowItem[column.name])}
                            className="reference"
                        >
                            {rowItem[column.name]}
                        </span>
                    </td>
                );
            }


            return (
                <td>
                    {rowItem[column.name]}
                </td>
            );
        });
    }

    rowRender = (data, columns) => {
        return data.map((item, index) => {
            return (
                <tr key={`row_${index}`}>
                    {this.columnRender(item, columns)}
                </tr>
            );
        });
    }

    render() {
        const { columns, records} = this.props;
        return (
            <tbody>
                {this.rowRender(records, columns)}
            </tbody>
        );
    }

}

export default DataGrid;