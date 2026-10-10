import {useCallback} from 'react';
import {TypePopupProps} from './Type/types';
import Box from '../Box/Box';
import ButtonGroup from '../Button/ButtonGroup';
import Button from '../Button/Button';
import './style/style.css';

const Popup = (props: TypePopupProps) => {
  const openClass = props.isOpen ? 'open' : '';

  const buttons = useCallback(() => {
    if (props.buttons) {
      return (
        <>
          {props.buttons}
        </>
      );
    }

    return <Button onClick={props.onClickOk} label={'OK'} />;
  }, [[props.buttons]]);

  if (!props.isOpen) {
    return null;
  }

  return (
    <div className={`popup-root light ${openClass}`}>
      <div className="popup-content">
        <div className="popup-name">
          {props.label}
        </div>
        <Box>
          <div className="popup-render-component">
            {props.children}
          </div>
          <div className="popup-buttons">
            <ButtonGroup>
              {buttons()}
            </ButtonGroup>
          </div>
        </Box>
      </div>
    </div>
  );
}

export default Popup;
