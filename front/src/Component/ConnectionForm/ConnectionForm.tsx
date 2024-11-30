import {Formik, FormikProps} from 'formik';
import FormikText from '../../UI/Formik/FormikText';
import Button from '../../UI/Button/Button';
import React, {useCallback, useEffect, useState} from 'react';
import ConnectionFormPropsInterface from './Interface/ConnectionFormPropsInterface';
import ConnectionUserDataInterface from '../../Library/Connection/Interface/ConnectionUserDataInterface';
import ValidationSchema from '../../UI/Formik/ValidationSchema';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionFormWasSubmitted from './Event/ConnectionFormWasSubmitted';
import ConnectionRequestInterface from '../../Library/Connection/Interface/ConnectionRequestInterface';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import ConnectionRequestWasRejected from '../../Library/Connection/Event/ConnectionRequestWasRejected';

const yup = ValidationSchema.getBuilder();

const schema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required'),
});

/** ConnectionForm */
export default (props: ConnectionFormPropsInterface) => {
  const formikRef = React.useRef<FormikProps<any>>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleOnFormSubmit = useCallback((data: ConnectionUserDataInterface) => {
    const requestData:ConnectionRequestInterface = {
      userData: data,
      connectionData: props.connectionData,
    };
    setLoading(true);
    EventBus.emit(new ConnectionFormWasSubmitted(requestData));

  }, [props]);


  useEffect(() => {
    EventBus.subscribe(ConnectionWasEstablished.name, () => {
      setLoading(false);
    });
    EventBus.subscribe(ConnectionRequestWasRejected.name, () => {
      setLoading(false);
    });
  }, [loading]);

  return (
    <div>
      <Formik<ConnectionUserDataInterface>
        innerRef={formikRef}
        onSubmit={handleOnFormSubmit}
        validationSchema={schema}
        initialValues={{
          username: props.connectionData.username,
          password: '',
        }}
      >
        {({errors}) => {
          return (
            <>
              <FormikText label="Username" name={'username'} />
              <FormikText label="Password" name={'password'} type={'password'}/>
            </>
          );
        }}
      </Formik>
      <Button
        label="Connect"
        onClick={() => {formikRef?.current?.submitForm()}}
        loading={loading}
      />
    </div>
  );
}
