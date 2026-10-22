import SortIconsPropsInterface from '../Interface/SortIconsPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faAngleDown, faAngleUp} from '@fortawesome/free-solid-svg-icons';
import {DirectionOrder} from '../Enum/DirectionOrder';
import React from 'react';

const HINT = 'Ctrl + click: add to sort by other columns';

/** SortIcons - arrow of current direction is active, number shows order when more columns are sorted */
export default (props: SortIconsPropsInterface) => {
  const sort = (event: React.MouseEvent, direction: DirectionOrder) => {
    event.stopPropagation();
    event.preventDefault();
    // Cmd on macOS - Ctrl + click opens context menu there
    props.onSort(props.column, direction, event.ctrlKey || event.metaKey);
  };
  const active = props.order?.direction;

  return (
    <div className={`sort-box ${active ? 'sorted' : ''}`}>
      {props.order?.position && <span className="sort-position" title={`Sorted as ${props.order.position}.`}>{props.order.position}</span>}
      <IconButton
        icon={faAngleUp}
        active={active === DirectionOrder.ASC}
        tooltip={`Sort ascending - ${HINT}`}
        onClick={(e) => sort(e, DirectionOrder.ASC)}
      />
      <IconButton
        icon={faAngleDown}
        active={active === DirectionOrder.DESC}
        tooltip={`Sort descending - ${HINT}`}
        onClick={(e) => sort(e, DirectionOrder.DESC)}
      />
    </div>
  );
}
