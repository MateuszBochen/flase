import './style.css';
import {useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
/**
 * ApplicationRender
 * @author Mateusz Bochen
 */
export default () => {
  const context = useContext(ApplicationRendererContext);

  return (
    <div className="application-render-root">
      {context.getApplicationForIndex(context.currentTab)}
    </div>
  );
}
