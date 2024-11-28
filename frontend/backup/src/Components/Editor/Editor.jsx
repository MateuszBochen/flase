import React, {Component} from "react";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { darcula } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import defaultMysqlKeyWords from '../../Library/DefaultAutocompleteKeywords';
import './style.css';
import InputHints from "../Autocomplete/InputHints";

class Editor extends Component {
    constructor(props) {
        super(props);
        this.inputReference = React.createRef();
    }
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
        const { hints } = this.props;
        return (
            <div className="editor-syntax-highlighter-wrapper">
                <SyntaxHighlighter language="sql" style={darcula} >
                    {this.props.children}
                </SyntaxHighlighter>
                <input
                    ref={this.inputReference}
                    spellCheck={false}
                    type="text"
                    value={this.props.children}
                    onChange={this.props.onChange}
                    onKeyDown={this.handleKeyPress}
                />
                <InputHints
                    hints={[...hints, ...defaultMysqlKeyWords]}
                    inputRef={this.inputReference}
                />
            </div>
        );
    }
}

export default Editor;
