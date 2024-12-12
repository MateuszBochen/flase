import SortIconsPropsInterface from '../Interface/SortIconsPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faAngleDown, faAngleUp} from '@fortawesome/free-solid-svg-icons';
import {DirectionOrder} from '../Enum/DirectionOrder';

/** SortIcons */
export default (props: SortIconsPropsInterface) => {
  return (
    <div className="sort-box">
      <IconButton
        icon={faAngleUp}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault()
          props.onSort(props.column, DirectionOrder.ASC)
        }}
      />
      <IconButton
        icon={faAngleDown}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault()
          props.onSort(props.column, DirectionOrder.DESC)
        }}
      />
    </div>
  );
}
