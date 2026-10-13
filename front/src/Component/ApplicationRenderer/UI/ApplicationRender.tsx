import './style.css';
import React, {useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
import Box from '../../../UI/Box/Box';
import TabErrorBoundary from '../../../UI/ErrorBoundary/TabErrorBoundary';
import EventBus from '../../../Library/EventBus/EventBus';
import TabWasClosed from '../Event/TabWasClosed';
/**
 * ApplicationRender
 * @author Mateusz Bochen
 */
export default () => {
  const context = useContext(ApplicationRendererContext);
  return (
    <Box className="application-render-root">
      {context.tabs.map((tabItem, index) => {
        return (
          <Box className={`tab-wrapper ${index === context.currentTab ? 'active' : ''}`} key={tabItem.id}>
            <TabErrorBoundary tabName={tabItem.tabName} onClose={() => EventBus.emit(new TabWasClosed(index))}>
              {React.createElement(tabItem.component, { ...tabItem.props, key: tabItem.id, tabId: tabItem.id})}
            </TabErrorBoundary>
          </Box>
        );
      })}
    </Box>
  );
}
