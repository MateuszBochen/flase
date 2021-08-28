import React, {Component} from "react";
import {Col, Row} from "react-bootstrap";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowAltCircleLeft, faArrowAltCircleRight} from "@fortawesome/fontawesome-free-solid";
import PropTypes from "prop-types";
import RecordsView from "../RecordsView";


class TableFooter extends Component {
    constructor(props) {
        super(props);

        this.state = {
            currentPage: this.props.page + 1,
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.page !== this.props.page) {
            this.setState({
                currentPage: this.props.page + 1,
            });
        }
    }

    onChangePageHandler = (newPage) => {
        const { onPageChange } = this.props;
        onPageChange(newPage);
    };

    render () {
        const { currentPage } = this.state;
        const { page, total, length, perPage} = this.props;
        return (
            <Row>
                <Col sm={2}>
                    <div className="cmp-records-view-pager-item pager">
                        <FontAwesomeIcon
                            role="button"
                            icon={faArrowAltCircleLeft}
                            onClick={() => this.onChangePageHandler(page - 1)}
                        />
                        <input
                            className="form-control"
                            type="number"
                            value={currentPage}
                            onChange={(e) => this.setState({currentPage: e.target.value})}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    this.onChangePageHandler(e.target.value - 1);
                                    e.target.select();
                                }
                            }}
                        />
                        <FontAwesomeIcon
                            onClick={() => this.onChangePageHandler(page + 1)}
                            role="button"
                            icon={faArrowAltCircleRight}
                        />
                    </div>
                </Col>
                <Col sm={2}>
                    Page: {page + 1}&nbsp;/&nbsp;{Math.ceil(total / perPage)}
                </Col>
                <Col sm={2}>
                    records: { page * perPage } - {length * (page+1)}
                    &nbsp;/&nbsp;{total}
                </Col>
                <Col sm={6}>

                </Col>
            </Row>
        );
    }
}

TableFooter.propTypes = {
    page: PropTypes.number,
    total: PropTypes.number,
    length: PropTypes.number,
    perPage: PropTypes.number,
    onPageChange: PropTypes.func,
}

export default TableFooter;
