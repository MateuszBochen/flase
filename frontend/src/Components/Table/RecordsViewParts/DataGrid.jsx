import React, {Component} from 'react';
import PropTypes from 'prop-types';
import Column from '../../../Library/DataTypes/Column';
import Row from './Row';
class DataGrid extends Component {
    rowRender = (data, columns) => {
        return data.map((item) => {
            return (
                <Row
                    key={`row_${item.id}`}
                    rowItem={item}
                    columns={columns}
                />
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