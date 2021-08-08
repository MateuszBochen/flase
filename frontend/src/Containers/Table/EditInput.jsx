import React, {Component} from "react";
import onClickOutside from 'react-onclickoutside';
import PropTypes from 'prop-types';

class EditInput extends Component {
    handleClickOutside = () => {
        this.props.cancelEdit();
    };

    keyDownHandler = (event) => {
        const { cancelEdit, approveEdit } = this.props;
        switch (event.keyCode) {
            case 27: { // esc
                cancelEdit();
                break;
            }
            case 13: { // enter
                approveEdit();
                break;
            }
            default:
                return null;
        }
    }

    renderChangeInputHandler = (node) => {

        if (node) {
            node.focus();
            node.addEventListener("keydown", this.keyDownHandler, false);
        }
    }

    render() {
        const { value, onChange } = this.props;
        return (
            <input
                type="text"
                className="form-control"
                value={value}
                onChange={onChange}
                ref={this.renderChangeInputHandler}
            />
        );
    }
}

EditInput.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    approveEdit: PropTypes.func,
    cancelEdit: PropTypes.func,
}

export default onClickOutside(EditInput);
