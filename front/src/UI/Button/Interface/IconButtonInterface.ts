import InvisibleButtonPropsInterface from '../InvisibleButtonPropsInterface';
import {IconDefinition} from '@fortawesome/free-solid-svg-icons';
import {MouseEvent} from 'react';

interface IconButtonInterface {
  icon: IconDefinition;
  disabled?: boolean;
  buttonProps?: InvisibleButtonPropsInterface;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  tooltip?: string;
  /** e.g. selected view */
  active?: boolean;
  /** action which removes data */
  danger?: boolean;
}

export default IconButtonInterface;
