import React, {Component} from 'react';
import { Button } from 'react-bootstrap';
import './style.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

class IconButton extends Component {
    render() {
        const {
            disabled,
            icon,
            onClick
        } = this.props;
        return (
            <Button
                variant="link"
                className="icon-button"
                disabled={disabled}
                {...this.props}
            >
                <FontAwesomeIcon
                    aria-disabled={disabled}
                    icon={icon}
                    onClick={onClick}
                />
            </Button>
        );
    }
}

export default IconButton;
