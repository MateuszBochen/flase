import './style.css';
import React, {useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
import Box from '../../../UI/Box/Box';
/**
 * ApplicationRender
 * @author Mateusz Bochen
 */
export default () => {
  const context = useContext(ApplicationRendererContext);
  return (
    <Box className="application-render-root" maxPossibleHeight={true}>
      {context.tabs.map((tabItem, index) => {
        return (
          <Box maxPossibleHeight={true} className={`tab-wrapper ${index === context.currentTab ? 'active' : ''}`} key={tabItem.id}>
            {React.createElement(tabItem.component, { ...tabItem.props, key: tabItem.id})}
          </Box>
        );
      })}
    </Box>
  );
}
