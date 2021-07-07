import React, {Component} from 'react';
import {Button, Spinner} from "react-bootstrap";
import './style.css';

class LoadingButton extends Component {
    render() {
        const {
            disabled,
            loading,
            variant,
            children
        } = this.props;
        return (
            <Button
                variant={variant}
                className="loading-button"
                disabled={loading || disabled}
                {...this.props}
            >
                {children}
                { loading ? <Spinner as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                 variant={variant}
                /> : ''}
            </Button>
        );
    }
}

export default LoadingButton;
