import React, {Component} from 'react';
import EditInput from '../../EditInput';
import ApplicationManager from '../../Application/ApplicationManager';

class CustomCellRender extends Component {

  tabIndex = undefined;

  /** @type ApplicationManager */
  applicationManager = undefined;


  constructor(props) {
    super(props);
    const { column, rowItem, tabIndex} = this.props;

    this.tabIndex = tabIndex;
    this.applicationManager = ApplicationManager.getInstance(tabIndex);

    console.log(this.props);

    this.state = {
      cellValue: rowItem.rowValues[column.name],
      isEdit: false,
    }
  }

  approveEditHandler = () => {
    const { column, onUpdate, rowItem } = this.props;
    const { currentValue } = this.state;

    this.setState({
      isEdit: false,
      savedValue: currentValue,
    });
    onUpdate(column, currentValue, rowItem);
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

  renderEditValue = () => {
    const { currentValue } = this.state;
    return (
        <EditInput
            value={currentValue}
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


  /*shouldComponentUpdate(nextProps, nextState){
      const { id } = this.props;
      return id !== nextProps.id;
  }*/

  render () {
    return (
      <td>
        {this.renderValue()}
      </td>
    );
  }
}

export default CustomCellRender;
