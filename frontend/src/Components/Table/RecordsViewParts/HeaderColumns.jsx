import React, {Component} from 'react';
import IconButton from '../../Buttons/IconButton';
import {faAngleUp, faAngleDown} from "@fortawesome/free-solid-svg-icons";

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

    renderColumn = (column) => {
        if (typeof column === 'string') {
            return (
                <th
                    key={column}
                >
                    <div className="column-name">
                        {column}
                    </div>
                    {this.renderSortIcons(column)}
                </th>
            );
        }

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

export default HeaderColumns;
