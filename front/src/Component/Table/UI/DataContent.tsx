import React from 'react';
import DataGrid from './DataGrid';
import DataContentPropsInterface from '../Interface/DataContentPropsInterface';


/** DataContent */
export default (props: DataContentPropsInterface) => {
  return (
    <DataGrid
      cellRender={props.cellRender}
      tabIndex={props.tabIndex}
      columns={props.columns}
      records={props.records}
    />
  );
}
