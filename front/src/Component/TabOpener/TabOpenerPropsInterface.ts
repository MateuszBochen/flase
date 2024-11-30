import React from 'react';
import TabInterface from '../ApplicationRenderer/Interface/TabInterface';

interface TabOpenerPropsInterface<T> {
  children: React.ReactNode;
  tab: TabInterface<T>
}

export default TabOpenerPropsInterface;
