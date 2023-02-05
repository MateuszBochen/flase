import React, {Component} from 'react';
import {ProgressBar} from "react-bootstrap";
import DataGrid from "./RecordsViewParts/DataGrid";

class DataContent extends Component {

    render() {
        const {
            columns,
            records,
            loadedRecords,
            possibleRecords,
            tabIndex,
        } = this.props;

        if (records.length) {
            return (
                <DataGrid
                    tabIndex={tabIndex}
                    columns={columns}
                    records={records}
                />
            );
        }

        const percent = (loadedRecords / possibleRecords * 100);

        return (
            <tbody>
            <tr>
                <td colSpan={columns.length}>
                    <ProgressBar striped bsStyle="info" now={percent} />
                </td>
            </tr>
            </tbody>
        );
    }

}

export default DataContent;
