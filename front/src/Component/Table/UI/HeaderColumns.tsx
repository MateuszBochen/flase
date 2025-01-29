import React, {forwardRef, useImperativeHandle, useState} from 'react';
import HeaderColumnsPropsInterface from '../Interface/HeaderColumnsPropsInterface';
import HeaderColumn from './HeaderColumn';
import HeaderColumnsRefInterface from '../Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';


export default forwardRef<HeaderColumnsRefInterface|null, HeaderColumnsPropsInterface>((props: HeaderColumnsPropsInterface, ref) => {

  const [columns, setColumns] = useState<ColumnInterface[]>([]);

  useImperativeHandle(ref, () => ({
    setColumns: (columns: ColumnInterface[]) => setColumns(columns),

  } as HeaderColumnsRefInterface));

  return (
    <div className="header-columns-row">
      {columns.map((column) => (<HeaderColumn
        column={column}
        onSort={props.onSort}
        key={column.name}
        gridRef={props.parentRef}
      />))}
    </div>
  );
});
