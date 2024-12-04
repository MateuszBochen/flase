import InvisibleButtonPropsInterface from '../InvisibleButtonPropsInterface';
import {IconDefinition} from '@fortawesome/free-solid-svg-icons';
import {MouseEvent} from 'react';

interface IconButtonInterface {
  icon: IconDefinition;
  disabled?: boolean;
  buttonProps?: InvisibleButtonPropsInterface;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export default IconButtonInterface;
