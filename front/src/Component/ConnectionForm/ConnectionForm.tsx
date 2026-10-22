import {Field, Formik, FormikProps} from 'formik';
import FormikText from '../../UI/Formik/FormikText';
import Button from '../../UI/Button/Button';
import React, {useCallback, useEffect, useState} from 'react';
import ConnectionFormPropsInterface from './Interface/ConnectionFormPropsInterface';
import ValidationSchema from '../../UI/Formik/ValidationSchema';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionFormWasSubmitted from './Event/ConnectionFormWasSubmitted';
import ConnectionRequestInterface from '../../Library/Connection/Interface/ConnectionRequestInterface';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import ConnectionRequestWasRejected from '../../Library/Connection/Event/ConnectionRequestWasRejected';
import PasswordVault from '../../Library/Connection/PasswordVault';
import SshKeyInput from '../SshTunnel/SshKeyInput';
import {sshAddress, sshSecretsOf} from '../../Library/Connection/Ssh/SshTunnelInterface';
import './style.css';

const yup = ValidationSchema.getBuilder();

const schema = yup.object({
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required'),
});

type FormValuesType = {username: string, password: string, sshPassword: string, sshPrivateKey: string, sshPassphrase: string};

/** ConnectionForm - user and password of database, secrets of SSH tunnel */
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
      formikRef.current?.setFieldValue('sshPassword', credentials.ssh?.password || '');
      formikRef.current?.setFieldValue('sshPrivateKey', credentials.ssh?.privateKey || '');
      formikRef.current?.setFieldValue('sshPassphrase', credentials.ssh?.passphrase || '');
    });
    return () => {
      active = false;
    };
  }, [props.connectionData.id]);

  const ssh = props.connectionData.ssh;

  const handleOnFormSubmit = useCallback((data: FormValuesType) => {
    const requestData:ConnectionRequestInterface = {
      userData: {
        username: data.username,
        password: data.password,
        ...(ssh ? {ssh: sshSecretsOf(ssh.auth, {password: data.sshPassword, privateKey: data.sshPrivateKey, passphrase: data.sshPassphrase})} : {}),
      },
      connectionData: props.connectionData,
      // remembered / forgotten after successful login only
      rememberPassword: vaultAvailable ? remember : undefined,
    };
    setLoading(true);
    EventBus.emit(new ConnectionFormWasSubmitted(requestData));

  }, [props, remember, vaultAvailable, ssh]);


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
      <Formik<FormValuesType>
        innerRef={formikRef}
        onSubmit={handleOnFormSubmit}
        validationSchema={schema}
        initialValues={{
          username: props.connectionData.username,
          password: '',
          sshPassword: '',
          sshPrivateKey: '',
          sshPassphrase: '',
        }}
      >
        {({setFieldValue}) => {
          return (
            <>
              <FormikText label="Username" name={'username'} />
              <FormikText label="Password" name={'password'} type={'password'}/>
              {ssh && (
                <div className="connection-form-ssh">
                  <div className="connection-form-ssh-title">SSH tunnel <code>{sshAddress(ssh)}</code></div>
                  {ssh.auth === 'password' && <FormikText label="SSH password" name={'sshPassword'} type={'password'}/>}
                  {ssh.auth === 'key' && (
                    <Field name="sshPrivateKey">
                      {({field}: any) => (
                        <label className="connection-form-ssh-key">
                          <span>Private key</span>
                          <SshKeyInput value={field.value} onChange={(value) => setFieldValue('sshPrivateKey', value)} />
                        </label>
                      )}
                    </Field>
                  )}
                  {ssh.auth === 'keyFile' && <div className="connection-form-ssh-hint">Key file <code>{ssh.keyFile}</code> on Flase server</div>}
                  {ssh.auth !== 'password' && <FormikText label="Key passphrase (only for encrypted key)" name={'sshPassphrase'} type={'password'}/>}
                </div>
              )}
              <label className={`connection-form-remember ${vaultAvailable ? '' : 'unavailable'}`}>
                <input type="checkbox" checked={remember} disabled={!vaultAvailable} onChange={(e) => setRemember(e.target.checked)} />
                <span>
                  {ssh ? 'Remember passwords (and SSH key) in this browser' : 'Remember password in this browser'}
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
