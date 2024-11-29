import {FC} from 'react';

interface TabInterface<T> {
  component: FC<T>;
  props: T;
  isActive: boolean;
}

export default TabInterface;
