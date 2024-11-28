import React, {Component} from 'react';
import PropTypes from 'prop-types';
import IconButton from '../../Buttons/IconButton';
import {faAngleUp, faAngleDown} from "@fortawesome/free-solid-svg-icons";
import Column from "../../../Library/DataTypes/Column";


class HeaderColumns extends Component {
    columnMountHandler = (index, ref) => {
        const { onColumnDidMount } = this.props;
        if (typeof onColumnDidMount === 'function') {
            if (ref) {
                const resizeObserver = new ResizeObserver(() => {
                    onColumnDidMount(index, ref);
                });
                resizeObserver.observe(ref);
            }
        }
    }

    renderSortIcons = (column) => {
        const { onSort } = this.props;

        if (typeof onSort !== 'function') {
            return null;
        }

        return (
            <div className="sort-box">
                <IconButton
                    icon={faAngleUp}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault()
                        onSort(column, 'ASC')
                    }}
                />
                <IconButton
                    icon={faAngleDown}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault()
                        onSort(column, 'DESC')
                    }}
                />
            </div>
        )
    }

    /**
     * @param {Column} column - column object
     */
    renderColumn = (column) => {
        return (
            <th
                key={column.name}
                ref={(node) => this.columnMountHandler(column, node)}
            >
                <div className="column-name-wrapper">
                    <div className="column-name">
                        {column.name}
                    </div>
                    {this.renderSortIcons(column)}
                </div>
            </th>
        );
    }

    render() {
        const {columns} = this.props;
        return (
            <tr>
                {columns.map((column) => this.renderColumn(column))}
            </tr>
        );
    }
}

HeaderColumns.propTypes = {
    columns: PropTypes.arrayOf(PropTypes.instanceOf(Column)),
    onColumnDidMount: PropTypes.func,
    onSort: PropTypes.func,
}

export default HeaderColumns;
