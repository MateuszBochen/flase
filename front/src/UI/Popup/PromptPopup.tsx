import React, {useState} from 'react';
import Popup from './Popup';
import Button from '../Button/Button';

interface PromptPopupPropsInterface {
  label: string;
  /** label of the text field */
  field: string;
  initialValue?: string;
  submitLabel?: string;
  /** called with trimmed, not empty value */
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** PromptPopup - one text value asked in popup of the application (instead of window.prompt of the browser) */
export default (props: PromptPopupPropsInterface) => {
  const [value, setValue] = useState<string>(props.initialValue ?? '');
  const submit = () => {
    if (value.trim()) props.onSubmit(value.trim());
  };

  return (
    <Popup
      openOnMount
      label={props.label}
      onClickOk={submit}
      onClose={props.onCancel}
      buttons={[
        <Button key="submit" size="small" colorVariant="success" label={props.submitLabel ?? 'OK'} onClick={submit} disabled={!value.trim()} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label>{props.field}<input value={value} onChange={(event) => setValue(event.target.value)} onFocus={(event) => event.target.select()} autoFocus /></label>
      </form>
    </Popup>
  );
};
