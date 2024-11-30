import { Field } from 'formik';
import {TypeInputPros} from '../Control/Type/types';
import React from 'react';
import Input from '../Control/Input';

const FormikText = (props: TypeInputPros) => {
  return (
    <Field
      name={props.name}
      render={(inputProps:any) => {
        const {field, form} = inputProps;
        const isValid = !form.errors[field.name];
        const isInvalid = form.touched[field.name] && !isValid;

        const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          field.onChange(e);
          if (props?.onChange) {
            props?.onChange(e);
          }
        }

        return (
          <Input
            inputProps={{...field}}
            label={props.label}
            type={props.type}
            onChange={handleOnChange}
            name={props.name}
            isInvalid={isInvalid}
            errors={isInvalid ? [form.errors[field.name]] : []}
            marginBottom={props.marginBottom}
          />
        );
      }}
    />
  );
}

export default FormikText;
