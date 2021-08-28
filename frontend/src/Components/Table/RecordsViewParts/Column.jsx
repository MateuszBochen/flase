import React, {Component} from "react";


class Column extends Component {

    /*shouldComponentUpdate(nextProps, nextState){
        const { id } = this.props;
        return id !== nextProps.id;
    }*/

    render () {
        const { column, rowItem} = this.props;

        if (column.function) {
            return (
                <td style={{height: '100%'}}>
                    {column.function(column, rowItem)}
                </td>
            );
        }

        return (
            <td>
                {rowItem.rowValues[column.name]}
            </td>
        );
    }
}

export default Column;

