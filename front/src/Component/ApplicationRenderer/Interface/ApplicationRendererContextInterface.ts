import TabInterface from './TabInterface';

interface RenderTabInterface<T> extends TabInterface<T> {
  id: string;
}

interface ApplicationRendererContextInterface {
  tabs: RenderTabInterface<any>[];

  currentTab: number;
  lastOpenTab: number;
}

export default ApplicationRendererContextInterface;
