import TabInterface from './TabInterface';

interface ApplicationRendererContextInterface {
  tabs: TabInterface<any>[];
  currentTab: number;
  lastOpenTab: number;
}

export default ApplicationRendererContextInterface;
