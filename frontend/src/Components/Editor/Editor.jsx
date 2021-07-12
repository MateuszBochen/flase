import React, {Component} from "react";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { darcula } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import './style.css';

class Editor extends Component {

    handleSearch = () => {
        const { onSearch } = this.props;
        if (typeof onSearch === 'function') {
            onSearch();
        }
    }

    handleKeyPress = (event) => {
        if(event.key === 'Enter'){
            this.handleSearch();
        }
    }

    render() {
        return (
            <div className="editor-syntax-highlighter-wrapper">
                <SyntaxHighlighter language="sql" style={darcula} >
                    {this.props.children}
                </SyntaxHighlighter>
                <input
                    spellCheck={false}
                    type="text"
                    value={this.props.children}
                    onChange={this.props.onChange}
                    onKeyPress={this.handleKeyPress}
                />
            </div>
        );
    }
}

export default Editor;
