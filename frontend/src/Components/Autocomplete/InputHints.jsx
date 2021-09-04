import React, {Component} from "react";
import './style.css';


class InputHints extends Component {
    inputRect = {};

    constructor(props) {
        super(props);

        this.state = {
            word: '',
            selectedHint: -1,
            hints: [],
        }

        // this.props.inputRef.onload = () => console.log('pizda z makiem');
    }

    componentDidMount() {

        const { inputRef } = this.props;



        if (inputRef.current) {
            inputRef.current.onkeyup = this.onKeyUpReferenceHandler;
            inputRef.current.onkeydown = this.onKeyDownReferenceHandler;
            this.inputRect = inputRef.current.getBoundingClientRect();
            console.log(this.inputRect);
        }
    }

    onKeyDownReferenceHandler = (e) => {
        const { selectedHint } = this.state;

        if (e.keyCode === 13 && selectedHint !== -1) {
            console.log('key UP! - zapobiegnij');
            e.stopPropagation();
            e.preventDefault();
            this.insertSelectedToInput(e);
            return;
        }

        if (e.keyCode === 27) {
            e.stopPropagation();
            e.preventDefault();

            this.setState({
                hints: [],
                selectedHint: -1,
            });

            return;
        }


        if (e.keyCode === 40) {
            e.stopPropagation();
            e.preventDefault();

            const { selectedHint, hints } = this.state;

            this.setState({
                selectedHint: +selectedHint + 1 >= hints.length ? hints.length-1 : +selectedHint + 1,
            });
            return;
        }

        if (e.keyCode === 38) {
            e.stopPropagation();
            e.preventDefault();

            const { selectedHint } = this.state;

            this.setState({
                selectedHint: selectedHint-1 < 0 ? 0 : selectedHint-1,
            });
            return;
        }
    }

    onKeyUpReferenceHandler = (e) => {
        const inputValue = e.target.value;
        const cutString = inputValue.slice(0, e.target.selectionStart);
        const words = cutString.split(' ');
        const lastWord = words.pop();

        if (lastWord) {
           this.hintsMatcher(lastWord);
        } else {
            this.setState({
                hints: [],
            });
        }
    }

    hintsMatcher = (word) => {
        const { hints } = this.props;
        const matchHints = hints.filter((hint) => {
            return hint.startsWith(word)
        });

        if (matchHints.length) {
            this.setState({
                hints: matchHints,
            });
        }
    }

    insertSelectedToInput = (e) => {
        const { hints, selectedHint } = this.state;

        if (selectedHint === -1) {
            return;
        }

        if (selectedHint >= hints.length) {
            return;
        }

        const caretPosition = e.target.selectionStart;

        const { inputRef } = this.props;
        const currentValueOfInput = inputRef.current.value;
        const currentValueOfInputLength = inputRef.current.value.length;
        const cutString = currentValueOfInput.slice(0, caretPosition);
        const words = cutString.split(' ');
        const lastWord = words.pop();
        const lengthOfLastWord = lastWord.length;
        const stringBeforeInsertion = currentValueOfInput.slice(0, (caretPosition - lengthOfLastWord)).trim();
        const stringAfterInsertion = currentValueOfInput.slice((caretPosition), currentValueOfInputLength).trim();
        const newString = `${stringBeforeInsertion} ${hints[selectedHint]} ${stringAfterInsertion}`;


        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(inputRef.current, newString);
        const ev2 = new Event('input', { bubbles: true});
        inputRef.current.dispatchEvent(ev2);

        this.setState({
            hints: [],
            selectedHint: -1,
        });

        const newCaretPosition = caretPosition + (hints[selectedHint].length - lengthOfLastWord) + 1;
        inputRef.current.setSelectionRange(newCaretPosition, newCaretPosition);
    }

    render() {
        const { selectedHint, hints } = this.state;

        if (!hints.length) {
            return null;
        }

        const { inputRef } = this.props;
        let style = {};
        if (inputRef.current && this.inputRect && this.inputRect.x) {
            const cursorPos = inputRef.current.selectionStart;
            style = {
                left: this.inputRect.x + (cursorPos * 8),
                top: this.inputRect.y + (this.inputRect.height * 0.75),
            }
        }




        return (
            <div className="input-hint-wrapper" style={style}>
                <ul
                >
                    {hints.map((hint, index) => {
                        return (
                            <li
                                className={index === selectedHint ? 'selected' : ''}
                                key={hint}
                            >
                                {hint}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }
}

export default InputHints;
