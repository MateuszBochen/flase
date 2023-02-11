import React, {Component} from 'react';
import EditInput from '../../EditInput';
import ApplicationManager from '../../Application/ApplicationManager';

class CustomCellRender extends Component {

  tabIndex = undefined;
  tableCellWidth = -1;

  /** @type ApplicationManager */
  applicationManager = undefined;


  constructor(props) {
    super(props);
    const { column, rowItem, tabIndex} = this.props;
    this.tabIndex = tabIndex;
    this.applicationManager = ApplicationManager.getInstance(tabIndex);
    this.state = {
      cellValue: rowItem.rowValues[column.name],
      isEdit: false,
      tableCellWidth: this.tableCellWidth,
    }
  }

  approveEditHandler = () => {
    const { column, onUpdate, rowItem } = this.props;
    const { currentValue } = this.state;

    /*this.setState({
      isEdit: false,
      savedValue: currentValue,
    });*/
    // onUpdate(column, currentValue, rowItem);

    console.log(column);

  }

  handleDblclick = () => {
    this.setState({
      isEdit: true,
    });
  };

  changeValueHandler = (e) => {
    this.setState({
      currentValue: e.target.value,
    });
  }

  handleCancelValue = () => {
    const { savedValue } = this.state;
    this.setState({
      isEdit: false,
      currentValue: savedValue,
    });
  };

  renderEditValue = () => {
    const { cellValue } = this.state;
    return (
        <EditInput
            value={`${cellValue}`}
            onChange={this.changeValueHandler}
            cancelEdit={this.handleCancelValue}
            approveEdit={this.approveEditHandler}
        />
    );
  }

  /**
   * @param {MouseEvent} event
   * @param {Column} column
   * @param {any} value
   */
  relationClickHandler = (event, column, value) => {
    event.stopPropagation();
    event.preventDefault();

    if (event.button === 1) {
      this.applicationManager.referenceOpenNewTab(column, value);
      return;
    }

    if (event.button === 0) {
      this.applicationManager.referenceOpenSameTab(column, value);
    }
  }


  renderValue = () => {
    const { column } = this.props;
    const { cellValue, isEdit } = this.state;

    if (isEdit) {
      return this.renderEditValue();
    }

    if (column.reference) {
      return (
        <span
          className="reference"
            onMouseDown={(e) => this.relationClickHandler(e, column, cellValue)}
          >
            {cellValue}
          </span>
      );
    }

    return cellValue;
  }

  tableCellRefHandler = (node) => {
    if (this.tableCellWidth === -1 && node) {
      this.tableCellWidth = node.getBoundingClientRect().width;
      this.setState({tableCellWidth: this.tableCellWidth});
    }
  }

  /*shouldComponentUpdate(nextProps, nextState){
      const { id } = this.props;
      return id !== nextProps.id;
  }*/

  render () {
    return (
      <td
          ref={this.tableCellRefHandler}
      >
        <div
          className="cell-filed"
          onDoubleClick={this.handleDblclick}
          style={{width: `${this.state.tableCellWidth}px`}}
        >
          {this.renderValue()}
        </div>
      </td>
    );
  }
}

export default CustomCellRender;
