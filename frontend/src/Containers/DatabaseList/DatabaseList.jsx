import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import {Spinner} from "react-bootstrap";
import './style.css';
import DataBaseRequest from "../../API/DataBaseRequest";
import DataBaseAction from '../../Actions/DataBaseAction';
import DatabaseListItem from "./DatabaseListItem";

class DatabaseList extends Component {
    constructor(props) {
        super(props);
        this.dataBaseRequest = new DataBaseRequest();
        this.dataBaseAction = new DataBaseAction();
        this.state = {
            request: false,
        };
    }


    list = () => {
        const { databaseList } = this.props;
        if (!databaseList.listIsLoaded) {
            return (
                <ul className="data-base-names-list nice-scrollbar">
                    <li className="loading-item">
                        <Spinner as="span"
                             animation="border"
                             size="sm"
                             role="status"
                             aria-hidden="true"
                             variant="secondary"
                        />
                    </li>
                </ul>
            );
        }

        return (
            <ul className="data-base-names-list nice-scrollbar">
                {databaseList.list.map((item) => <DatabaseListItem databaseItem={item} key={item.name} />)}
            </ul>
        );
    }

    render() {
        return (
            <div className="databases-list">
                <h6>Data bases list:</h6>
                {this.list()}
            </div>
        );
    }
}

const mapStateToProps = state => ({
    databaseList: { ...state.databaseList },
});

export default connect(mapStateToProps)(DatabaseList);
