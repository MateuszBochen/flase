import Switch from '../Button/Switch';
import {Field} from 'formik';
import React from 'react';
import {TypeFormikSwitchProps} from './types';

const FormikSwitch = (props: TypeFormikSwitchProps) => {

  return (
    <Field
      name={props.name}
      render={(inputProps:any) => {
        const {field, form} = inputProps;
        const isValid = !form.errors[field.name];
        const isInvalid = form.touched[field.name] && !isValid;

        const handleOnChange = (isChecked: boolean) => {
          form.setFieldValue(props.name, isChecked);
          if (props?.onChange) {
            props?.onChange(isChecked);
          }
        }

        return (
          <Switch
            onChange={handleOnChange}
            defaultChecked={field.value}
            label={props.label}
          />
        );
      }}
    />
  );
}

export default FormikSwitch;
