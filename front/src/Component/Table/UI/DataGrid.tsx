import React, {Component, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import DataGridPropsInterface from '../Interface/DataGridPropsInterface';
import Row from './Row';
/*import Column from '../../../Library/DataTypes/Column';
import Row from './Row';*/
import {FixedSizeList as List, ListChildComponentProps} from 'react-window';

/** DataGrid */
export default (props: DataGridPropsInterface) => {
  const mainTableContentContainer = useRef<HTMLDivElement|null>(null);
  const [sizeTableContent, setSizeTableContent] = useState({width: 0, height: 0});
  const rowHeight = 21;

   // useLayoutEffect(() => { //*/
   useEffect(() => { // */
    if (mainTableContentContainer.current) {
      setSizeTableContent({
        width: mainTableContentContainer.current.getBoundingClientRect().width,
        height: mainTableContentContainer.current.getBoundingClientRect().height
      });
    }
  }, []);

  const displayRow: React.FC<ListChildComponentProps> = useCallback(({ index, style }) => (
    <div style={style}>
      <Row
        cellRender={props.cellRender}
        tabIndex={props.tabIndex}
        rowItem={props.records[index]}
        columns={props.columns}
      />
    </div>
  ), [props]);

  const reWidthElements = useCallback(() => {
    props.columns.forEach((column) => {

      const keyName = `${column.alias}-${column.name}`;
      const cellClassName = `.cmp-data-data-cell-${keyName}`;
      const columnClassName = `.cmp-data-data-header-cell-${keyName}`;


      const headerElements = document.querySelectorAll<HTMLDivElement>(columnClassName);

      headerElements.forEach((headerElement) => {
        console.log(column.name, headerElement.getBoundingClientRect().width)
        const cellElements = document.querySelectorAll<HTMLDivElement>(cellClassName);
        cellElements.forEach(element => {
          if (headerElement) {
            element.style.width = `${Math.ceil(headerElement.getBoundingClientRect().width) - 9}px`;
          }
        });
      });



    });

  }, [props.columns]);





  return (
    <div className="data-table-content" ref={mainTableContentContainer}>
      <List
        height={sizeTableContent.height}
        width={sizeTableContent.width}
        itemCount={props.records.length}
        itemSize={rowHeight}
        onItemsRendered={reWidthElements}
      >
        {displayRow}
      </List>
    </div>
  );
}


/*
class DataGrid extends Component {
    rowRender = (data, columns) => {
        const { tabIndex, cellRender} = this.props;
        return data.map((item) => {
            return (
                <Row
                    cellRender={cellRender}
                    tabIndex={tabIndex}
                    key={`row_${item.id}`}
                    rowItem={item}
                    columns={columns}
                />
            );
        });
    }

    render() {
        const { columns, records} = this.props;

        return (
            <tbody>
                {this.rowRender(records, columns)}
            </tbody>
        );
    }

}

DataGrid.propTypes = {
    columns: PropTypes.arrayOf(PropTypes.instanceOf(Column)),
    records: PropTypes.array,
    tabIndex: PropTypes.number,
    cellRender: PropTypes.any,
}

export default DataGrid;*/
