import React, {Component} from "react";
import './style.css'

class LoaderSquare extends Component {
    render() {
        return (
            <div className="loader-wrapper">
                <div className="lds-grid">
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                    <div/>
                </div>
            </div>
        );
    }
}

export default LoaderSquare;
