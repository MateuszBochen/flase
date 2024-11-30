import HorizontalButtonListPropsInterface from './HorizontalButtonListPropsInterface';
import './style.css';

/** HorizontalButtonList */
export default (props: HorizontalButtonListPropsInterface) => {
  return (
    <div className="horizontal-button-list-root">
      {props.children}
    </div>
  );
}
