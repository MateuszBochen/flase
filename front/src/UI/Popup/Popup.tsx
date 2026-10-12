import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {PopupRefInterface, TypePopupProps} from './Type/types';
import Box from '../Box/Box';
import ButtonGroup from '../Button/ButtonGroup';
import Button from '../Button/Button';
import './style/style.css';

/** open popups, the last one is on top - Escape closes only it */
const openPopups: object[] = [];

/**
 * Popup keeps its open state - parent opens it by ref (open / close), popup rendered only with data uses openOnMount.
 * Escape and click outside close it, onClose tells the parent.
 */
const Popup = forwardRef<PopupRefInterface, TypePopupProps>((props, ref) => {
  const [isOpen, setIsOpen] = useState<boolean>(!!props.openOnMount);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  /** click started on backdrop - text selection dragged out of popup does not close it */
  const pressedOnBackdrop = useRef<boolean>(false);

  const close = useCallback(() => {
    setIsOpen(false);
    onCloseRef.current?.();
  }, []);

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
    close,
  }), [close]);

  useEffect(() => {
    if (!isOpen) return;
    const id = {};
    openPopups.push(id);
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape handled inside of popup (editor, menu, suggestions) does not close it
      if (event.key !== 'Escape' || event.defaultPrevented || openPopups[openPopups.length - 1] !== id) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      openPopups.splice(openPopups.indexOf(id), 1);
    };
  }, [isOpen, close]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="popup-root light open"
      onMouseDown={(event) => pressedOnBackdrop.current = event.target === event.currentTarget}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) {
          close();
        }
        pressedOnBackdrop.current = false;
      }}
    >
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
              {props.buttons ? <>{props.buttons}</> : <Button onClick={props.onClickOk} label={'OK'} />}
            </ButtonGroup>
          </div>
        </Box>
      </div>
    </div>
  );
});

export default Popup;
