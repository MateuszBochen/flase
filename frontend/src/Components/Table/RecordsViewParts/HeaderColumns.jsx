import React, {Component} from 'react';


class HeaderColumns extends Component {
    clickHandler = (e, column) => {

    }

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

    renderColumn = (column) => {
        if (typeof column === 'string') {
            return (
                <th key={column}>
                    {column}
                </th>
            );
        }

        return (
            <th
                key={column.name}
                ref={(node) => this.columnMountHandler(column, node)}
            >
                {column.name}
                <span
                    onClick={(e) => this.clickHandler(e, column)}
                >
                    x
                </span>
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
