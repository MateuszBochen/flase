import ApplicationRendererPropsInterface from './Interface/ApplicationRendererPropsInterface';
import {ApplicationRendererContext} from './API/Context/ApplicationRendererContext';
import TabRender from './UI/TabRender';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import ApplicationRendererContextInterface from './Interface/ApplicationRendererContextInterface';
import defaultApplicationRendererContext from './API/Context/defaultApplicationRendererContext';
import ApplicationRender from './UI/ApplicationRender';
import Box from '../../UI/Box/Box';

/**
 * ApplicationRenderer
 * @author Mateusz Bochen
 */
export default (props: ApplicationRendererPropsInterface) => {
  const [context, setContext] = useState<ApplicationRendererContextInterface>({
    ...defaultApplicationRendererContext,
    tabs: [props.defaultTab],
  });

  /**
   * Handing function for change font
   */
  const getApplicationForIndex = useCallback((number: number) => {
    if (!context.renderedTabs[number]) {
      context.renderedTabs[number] = React.createElement(context.tabs[number].component, context.tabs[number].props);
    }

    return context.renderedTabs[number];

  }, [context.tabs]);

  const value = useMemo(() => {
    return {
      ...context,
      getApplicationForIndex,
    }
  }, [context]);


  return (
    <ApplicationRendererContext.Provider value={value}>
      <Box>
        <TabRender/>
        <ApplicationRender/>
      </Box>
    </ApplicationRendererContext.Provider>
  );
}
