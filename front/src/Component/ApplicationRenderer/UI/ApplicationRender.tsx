import './style.css';
import React, {useContext, useRef} from 'react';
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
  /**
   * content of tabs in order of opening - moved tab is not moved in DOM (it would lose scroll positions,
   * editors would be reset), only its label
   */
  const order = useRef<string[]>([]);
  const ids = context.tabs.map((tabItem) => tabItem.id);
  order.current = [...order.current.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.current.includes(id))];
  return (
    <Box className="application-render-root">
      {order.current.map((id) => {
        const index = ids.indexOf(id);
        const tabItem = context.tabs[index];
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
