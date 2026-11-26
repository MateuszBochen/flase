import React, {ReactNode} from 'react';
import Popup from './Popup';
import Button from '../Button/Button';

interface ConfirmPopupPropsInterface {
  label: string;
  confirmLabel: string;
  /** destructive action - red button */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** ConfirmPopup - yes / no question in popup of the application (instead of window.confirm of the browser) */
export default (props: ConfirmPopupPropsInterface) => (
  <Popup
    openOnMount
    label={props.label}
    onClickOk={props.onConfirm}
    onClose={props.onCancel}
    buttons={[
      <Button key="confirm" size="small" colorVariant={props.danger ? 'danger' : 'success'} dangerDelay={false} label={props.confirmLabel} onClick={props.onConfirm} />,
      <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
    ]}
  >
    {props.children && <div className="confirm-popup-text">{props.children}</div>}
  </Popup>
);
