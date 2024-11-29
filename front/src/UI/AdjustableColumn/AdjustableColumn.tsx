import './style.css';
import AdjustableColumnPropsInterface from './AdjustableColumnPropsInterface';

export default (props: AdjustableColumnPropsInterface) => {
  return (
    <div className="adjustable-column-root">
      {props.children}
    </div>
  );
}
