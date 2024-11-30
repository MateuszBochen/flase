import './style.css';
import React, {useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
/**
 * ApplicationRender
 * @author Mateusz Bochen
 */
export default () => {
  const context = useContext(ApplicationRendererContext);
  return (
    <div className="application-render-root">
      {context.tabs.map((tabItem, index) => {
        return (
          <div className={`tab-wrapper ${index === context.currentTab ? 'active' : ''}`} key={tabItem.id}>
            {React.createElement(tabItem.component, { ...tabItem.props, key: tabItem.id})}
          </div>
        );
      })}
    </div>
  );
}
