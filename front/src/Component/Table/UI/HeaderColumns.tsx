import React, {forwardRef, useImperativeHandle, useState} from 'react';
import HeaderColumnsPropsInterface from '../Interface/HeaderColumnsPropsInterface';
import HeaderColumn from './HeaderColumn';
import HeaderColumnsRefInterface from '../Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import HeaderSkeleton from './Skeleton/HeaderSkeleton';


export default forwardRef<HeaderColumnsRefInterface|null, HeaderColumnsPropsInterface>((props: HeaderColumnsPropsInterface, ref) => {

  const [columns, setColumns] = useState<ColumnInterface[]>([]);

  useImperativeHandle(ref, () => ({
    setColumns: (columns: ColumnInterface[]) => setColumns(columns),
    reset: () => setColumns([]),
  } as HeaderColumnsRefInterface));

  if (columns.length === 0) {
    return <HeaderSkeleton />
  }

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
