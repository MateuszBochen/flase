import BoxPropsInterface from './BoxPropsInterface';
import './style.css';

/**
 * Just box
 * @author Mateusz Bochen
 */
export default (props: BoxPropsInterface) => {
  return (
    <div className="box-root">
      {props.children}
    </div>
  );
}
