import TabInterface from './TabInterface';
import React from 'react';

interface ApplicationRendererContextInterface {
  tabs: TabInterface<any>[];
  renderedTabs: React.ReactNode[]
  currentTab: number;
  lastOpenTab: number;
  getApplicationForIndex: (index: number) => React.ReactNode;
}

export default ApplicationRendererContextInterface;
