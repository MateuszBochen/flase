import ApplicationRendererPropsInterface from './Interface/ApplicationRendererPropsInterface';
import {ApplicationRendererContext} from './API/Context/ApplicationRendererContext';
import TabRender from './UI/TabRender';
import {useEffect, useState} from 'react';
import ApplicationRendererContextInterface from './Interface/ApplicationRendererContextInterface';
import defaultApplicationRendererContext from './API/Context/defaultApplicationRendererContext';

/**
 * ApplicationRenderer
 * @author Mateusz Bochen
 */
export default (props: ApplicationRendererPropsInterface) => {
  const [context, setContext] = useState<ApplicationRendererContextInterface>(defaultApplicationRendererContext);



  return (
    <div className="application-renderer-root">
      <ApplicationRendererContext.Provider value={context}>
          <TabRender/>
      </ApplicationRendererContext.Provider>
    </div>
  );
}
