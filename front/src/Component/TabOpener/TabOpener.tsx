import TabOpenerPropsInterface from './TabOpenerPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import {MouseEvent, useCallback} from 'react';

/** TabOpener */
export default <T,>(props: TabOpenerPropsInterface<T>) => {

  const onSameTabHandler = useCallback(() => {
    console.log('open on same tab');
  }, [props.tab]);

  const onNewTabHandler = useCallback(() => {
    console.log('open on new tab');
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
