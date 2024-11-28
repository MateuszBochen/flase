import React, {Component} from 'react';

import PropTypes from 'prop-types';
import Column from '../../Library/DataTypes/Column';
import EditInput from "./EditInput";

class CellValue extends Component {
    constructor(props) {
        super(props);
        const { column, rowItem } = this.props;
        this.state = {
            isEdit: false,
            savedValue: rowItem[column.name],
            currentValue: rowItem[column.name],
        }
    }

    handleCancelValue = () => {
        const { savedValue } = this.state;
        this.setState({
            isEdit: false,
            currentValue: savedValue,
        });
    };

    approveEditHandler = () => {
        const { column, onUpdate, rowItem } = this.props;
        const { currentValue } = this.state;

        this.setState({
            isEdit: false,
            savedValue: currentValue,
        });
        onUpdate(column, currentValue, rowItem);
    }

    handleDblclick = () => {
        this.setState({
            isEdit: true,
        });
    };

    changeValueHandler = (e) => {
        this.setState({
            currentValue: e.target.value,
        });
    }

    renderEditValue = () => {
        const { currentValue } = this.state;
        return (
            <EditInput
                value={currentValue}
                onChange={this.changeValueHandler}
                cancelEdit={this.handleCancelValue}
                approveEdit={this.approveEditHandler}
            />
        );
    }

    renderValue = () => {
        const { column, onRelationClick } = this.props;
        const { currentValue } = this.state;
        const { isEdit } = this.state;

        if (isEdit) {
            return this.renderEditValue();
        }

        if (column.referenceColumn && column.referenceTable) {
            return (
                <span
                    className="reference"
                    onMouseDown={(e) => onRelationClick(e, column, currentValue)}
                >
                    {currentValue}
                </span>
            );
        }

        return currentValue;
    }

    render() {
        const { isEdit } = this.state;
        const { hasPrimary } = this.props;
        console.log(hasPrimary);
        return (
            <div
                className="cell-filed"
                onDoubleClick={hasPrimary && this.handleDblclick || null}
            >
                {this.renderValue()}
            </div>
        );
    }
}

CellValue.propTypes = {
    column: PropTypes.instanceOf(Column),
    rowItem: PropTypes.object,
    onRelationClick: PropTypes.func,
    onUpdate: PropTypes.func,
    hasPrimary: PropTypes.bool,
}

export default CellValue;
