import React, {Component} from 'react';
import './style/style.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import InvisibleButton from './InvisibleButton';
import IconButtonInterface from './Interface/IconButtonInterface';

/** IconButton */
export default (props: IconButtonInterface) => {

  return (
    <InvisibleButton
      onClickLeft={props.onClick}
      onClickWheel={props.onClick}
      tooltip={"dfsdf"}
      className="icon-button"
    >
      <FontAwesomeIcon
        // aria-disabled={disabled}
        icon={props.icon}
      />
    </InvisibleButton>
  );

}

