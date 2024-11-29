import {useCallback, useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
import TabLabelList from '../../../UI/TabLabelList/TabLabelList';


export default () => {
  const context = useContext(ApplicationRendererContext);

  const getListOfLabels = useCallback(():string[] => {
    return context.tabs.map((tabItem) => tabItem.tabName);
  }, [context.tabs]);

  return (
    <TabLabelList
      labels={getListOfLabels()}
      activeIndex={0}
      onLabelClick={() => {}}
      onLabelClose={() => {}}
    />
  );
}

