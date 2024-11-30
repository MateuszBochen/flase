import TabOpenerPropsInterface from './TabOpenerPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import {MouseEvent, useCallback} from 'react';
import EventBus from '../../Library/EventBus/EventBus';
import CurrentTabComponentWasSelected from '../ApplicationRenderer/Event/CurrentTabComponentWasSelected';
import NewTabComponentWasSelected from '../ApplicationRenderer/Event/NewTabComponentWasSelected';

/** TabOpener */
export default <T,>(props: TabOpenerPropsInterface<T>) => {

  const onSameTabHandler = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    console.log('onSameTabHandler');
    EventBus.emit(new CurrentTabComponentWasSelected(props.tab));
  }, [props.tab]);

  const onNewTabHandler = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    console.log('onNewTabHandler');
    EventBus.emit(new NewTabComponentWasSelected(props.tab));
  }, [props.tab]);

  return (
    <InvisibleButton
      onClickLeft={onSameTabHandler}
      onClickWheel={onNewTabHandler}
    >
      {props.children}
    </InvisibleButton>
  );
}
