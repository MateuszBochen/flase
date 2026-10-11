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
import PasswordVault from '../../Library/Connection/PasswordVault';
import './style.css';

const yup = ValidationSchema.getBuilder();

const schema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required'),
});

/** ConnectionForm */
export default (props: ConnectionFormPropsInterface) => {
  const formikRef = React.useRef<FormikProps<any>>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const vaultAvailable = PasswordVault.isAvailable();
  const [remember, setRemember] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);

  // remembered password is filled in
  useEffect(() => {
    let active = true;
    PasswordVault.load(props.connectionData.id).then((credentials) => {
      if (!active || !credentials) return;
      setSaved(true);
      setRemember(true);
      formikRef.current?.setFieldValue('username', credentials.username || props.connectionData.username);
      formikRef.current?.setFieldValue('password', credentials.password);
    });
    return () => {
      active = false;
    };
  }, [props.connectionData.id]);

  const handleOnFormSubmit = useCallback((data: ConnectionUserDataInterface) => {
    const requestData:ConnectionRequestInterface = {
      userData: data,
      connectionData: props.connectionData,
      // remembered / forgotten after successful login only
      rememberPassword: vaultAvailable ? remember : undefined,
    };
    setLoading(true);
    EventBus.emit(new ConnectionFormWasSubmitted(requestData));

  }, [props, remember, vaultAvailable]);


  useEffect(() => {
    const connectionWasEstablishedSubscriber = EventBus.subscribe(ConnectionWasEstablished.name, () => {
      setLoading(false);
    });

    const connectionRequestWasRejectedSubscriber = EventBus.subscribe(ConnectionRequestWasRejected.name, () => {
      setLoading(false);
    });

    return () => {
      EventBus.unSub(connectionWasEstablishedSubscriber);
      EventBus.unSub(connectionRequestWasRejectedSubscriber);
    }

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
              <label className={`connection-form-remember ${vaultAvailable ? '' : 'unavailable'}`}>
                <input type="checkbox" checked={remember} disabled={!vaultAvailable} onChange={(e) => setRemember(e.target.checked)} />
                <span>
                  Remember password in this browser
                  <small>
                    {vaultAvailable
                      ? (saved ? 'Password is saved (encrypted in this browser). Uncheck to forget it.' : 'Encrypted with a key of this browser, never sent anywhere else.')
                      : 'Available only over HTTPS (or localhost) - browser does not allow encryption on plain HTTP.'}
                  </small>
                </span>
              </label>
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
