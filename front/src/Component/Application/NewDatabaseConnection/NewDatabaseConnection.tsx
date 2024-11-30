import React, {useCallback} from 'react';
import {Formik, FormikProps} from 'formik';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import FormikText from '../../../UI/Formik/FormikText';
import ValidationSchema from '../../../UI/Formik/ValidationSchema';
import Button from '../../../UI/Button/Button';
import toast from 'react-hot-toast';
import FormikSwitch from '../../../UI/Formik/FormikSwitch';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';


const yup = ValidationSchema.getBuilder();

const schema = yup.object({
  dsn: yup.string().required('DSN is required'),
  displayName: yup.string().required('Name is required'),
});

/** NewDatabaseConnection */
export default () => {
  const formikRef = React.useRef<FormikProps<any>>(null);

  const handleOnFormSubmit = useCallback((data: ConnectionDataInterface) => {
    ConnectionSettings.getInstance().addNewConnection(data);
  }, []);

  return (
    <div>
      <Formik<ConnectionDataInterface>
        innerRef={formikRef}
        onSubmit={handleOnFormSubmit}
        validationSchema={schema}
        initialValues={{
          dsn: '',
          username: '',
          changeConfirmationRequired: false,
          displayName: '',
        }}
      >
        {({errors}) => {
          return (
            <>
              <FormikText label="Conection name" name={'displayName'} />
              <FormikText label="Server DSN" name={'dsn'} />
              <FormikText label="Username" name={'username'} />
              <FormikSwitch label="Change confiramtion required?" name={'changeConfirmationRequired'} />
            </>
          );
        }}
      </Formik>
      <Button
        label="ADD!"
        onClick={() => {formikRef?.current?.submitForm()}}
        loading={false}
      />
    </div>
  );
}
