import React from 'react';
import './style/style.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import InvisibleButton from './InvisibleButton';
import IconButtonInterface from './Interface/IconButtonInterface';

/** IconButton */
export default (props: IconButtonInterface) => {
  const className = `icon-button ${props.active ? 'active' : ''} ${props.danger ? 'danger' : ''}`;

  return (
    <InvisibleButton
      onClickLeft={props.onClick}
      onClickWheel={props.onClick}
      tooltip={props.tooltip || ''}
      disabled={props.disabled}
      className={className}
    >
      <FontAwesomeIcon icon={props.icon} />
    </InvisibleButton>
  );
}
