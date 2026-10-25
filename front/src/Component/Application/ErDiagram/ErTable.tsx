import React, {memo} from 'react';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import {HEADER_HEIGHT, ROW_HEIGHT} from './ErLayout';

/** callbacks of diagram - the same object for whole life of diagram, so memoized tables are not re-rendered by them */
export interface ErTableHandlersInterface {
  onMouseDown: (event: React.MouseEvent, table: string) => void;
  onHover: (table: string | null) => void;
  onClick: (table: TableInformationInterface) => void;
  onColumnClick: (event: React.MouseEvent, table: string, column: string) => void;
}

interface ErTablePropsInterface {
  table: TableInformationInterface;
  x: number;
  y: number;
  width: number;
  height: number;
  hovered: boolean;
  linkMode: boolean;
  /** column chosen as start of new relation in this table */
  selectedColumn: string | null;
  handlers: ErTableHandlersInterface;
}

/** ErTable - box of one table, re-rendered only when its own position, hover or selection changed */
export default memo((props: ErTablePropsInterface) => {
  const {table, handlers} = props;
  return (
    <g
      className={`er-table ${props.hovered ? 'hovered' : ''}`}
      transform={`translate(${props.x} ${props.y})`}
      onMouseDown={(event) => handlers.onMouseDown(event, table.tableName)}
      onMouseEnter={() => handlers.onHover(table.tableName)}
      onMouseLeave={() => handlers.onHover(null)}
      onClick={() => handlers.onClick(table)}
    >
      <rect className="er-table-bg" width={props.width} height={props.height} rx={4} />
      <rect className="er-header" width={props.width} height={HEADER_HEIGHT} rx={4} />
      <text className="er-title" x={8} y={17}>{table.tableName}</text>
      {table.columns.map((column, index) => (
        <g
          key={column.name}
          transform={`translate(0 ${HEADER_HEIGHT + index * ROW_HEIGHT})`}
          className={`er-column-row ${props.linkMode ? 'linkable' : ''}`}
          data-column={`${table.tableName}.${column.name}`}
          onClick={(event) => handlers.onColumnClick(event, table.tableName, column.name)}
        >
          <rect
            className={`er-column-hit ${props.selectedColumn === column.name ? 'selected' : ''}`}
            x={1}
            width={props.width - 2}
            height={ROW_HEIGHT}
          />
          <text className={column.primaryKey ? 'er-pk' : column.reference ? 'er-fk' : 'er-column'} x={8} y={13}>
            {column.primaryKey ? '🔑 ' : column.reference ? '↗ ' : '   '}{column.name}{column.nullable ? '' : ' *'}
          </text>
          <text className="er-type" x={props.width - 8} y={13} textAnchor="end">{column.type}</text>
        </g>
      ))}
    </g>
  );
});
