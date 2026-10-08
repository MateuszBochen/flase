import {FC} from 'react';

interface TabInterface<T> {
  component: FC<T>;
  props: T;
  isActive: boolean;
  /** new tab is shown at once - for explicit actions, links opened "in new tab" stay in background */
  activate?: boolean;
  tabName: string;
}

export default TabInterface;
