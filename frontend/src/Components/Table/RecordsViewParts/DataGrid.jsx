import React, {Component} from 'react';


class DataGrid extends Component {

    columnRender = (rowItem, columns) => {
        return columns.map((column) =>{
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