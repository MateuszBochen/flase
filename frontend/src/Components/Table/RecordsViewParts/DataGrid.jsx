import React, {Component} from 'react';
import PropTypes from 'prop-types';
import Column from '../../../Library/DataTypes/Column';
class DataGrid extends Component {
    columnRender = (rowItem, columns) => {
        return columns.map((column) => {
            const cellValue = rowItem[column.name];
            const key = `${column.name}${cellValue}`;
            if (column.function) {
                return (
                    <td key={key} style={{height: '100%'}}>
                        {column.function(column, rowItem)}
                    </td>
                );
            }

            return (
                <td key={key}>
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

DataGrid.propTypes = {
    columns: PropTypes.arrayOf(PropTypes.instanceOf(Column)),
    records: PropTypes.array,
}

export default DataGrid;