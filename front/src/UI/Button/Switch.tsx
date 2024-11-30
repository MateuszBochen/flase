import {useCallback, useState} from 'react';
import {TypeButtonProps, TypeSwitchProps} from './Type/types';


const Switch = (props: TypeSwitchProps) => {
 const [checked, setChecked] = useState<boolean>(props.defaultChecked || false);

 const onClickHandler = useCallback(() => {
   const newStatus = !checked;
   setChecked(newStatus);
   props.onChange(newStatus);
 }, [checked, props.onChange]);



  return (
    <div className="button-switch-root">
      <button
        onClick={onClickHandler}
        className={`button-switch-switch ${checked ? 'checked' : ''}`}
      />
      <label>
        {props.label}
      </label>

    </div>
  );
}

export default Switch;
