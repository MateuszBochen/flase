import './style.css';
import TabItem from './TabItem';
import TabLabelListPropsInterface from './Interface/TabLabelListPropsInterface';

/**
 * TabLabelList
 */
export default  (props: TabLabelListPropsInterface) => {
  return (
    <div className="tab-label-list-root">
      <ul className="tab-label-list">
        {props.labels.map((label, index) => {
          return (
            <TabItem
              label={label}
              isActive={index === props.activeIndex}
              onClick={props.onLabelClick}
              onClose={props.onLabelClose}
              index={index}
              key={index}
            />
          );
        })}
      </ul>
    </div>
  );
}

