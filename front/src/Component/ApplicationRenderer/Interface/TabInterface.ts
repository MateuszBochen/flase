import {FC} from 'react';

interface TabInterface<T> {
  component: FC<T>;
  props: T;
  isActive: boolean;
  tabName: string;
}

export default TabInterface;
