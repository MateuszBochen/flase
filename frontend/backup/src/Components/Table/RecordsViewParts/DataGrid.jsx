import React, {Component} from 'react';
import PropTypes from 'prop-types';
import Column from '../../../Library/DataTypes/Column';
import Row from './Row';
class DataGrid extends Component {
    rowRender = (data, columns) => {
        const { tabIndex, cellRender} = this.props;
        return data.map((item) => {
            return (
                <Row
                    cellRender={cellRender}
                    tabIndex={tabIndex}
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
    tabIndex: PropTypes.number,
    cellRender: PropTypes.any,
}

export default DataGrid;