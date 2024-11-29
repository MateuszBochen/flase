import ViewPortPropsInterface from './ViewPortPropsInterface';
import './style.css';

/**
 * View port object - is kind of mian coiner.
 * @author Mateusz Bochen
 */
export default (props: ViewPortPropsInterface) => {
  return (
    <div className="view-port-root">
      {props.children}
    </div>
  );
}

