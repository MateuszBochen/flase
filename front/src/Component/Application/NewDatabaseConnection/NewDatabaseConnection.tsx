import React, {useCallback} from 'react';
import {Formik, FormikProps} from 'formik';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import FormikText from '../../../UI/Formik/FormikText';
import ValidationSchema from '../../../UI/Formik/ValidationSchema';
import Button from '../../../UI/Button/Button';
import FormikSwitch from '../../../UI/Formik/FormikSwitch';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import {v4 as uuidv4} from 'uuid';

const yup = ValidationSchema.getBuilder();

const schema = yup.object({
  dsn: yup.string().required('DSN is required')
    .matches(/^(mysql|mariadb|postgresql|postgres|pgsql):\/\//i, 'Supported: mysql://, mariadb://, postgresql://'),
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
          id: uuidv4(),
        }}
      >
        {({errors}) => {
          return (
            <>
              <FormikText label="Conection name" name={'displayName'} />
              <FormikText
                label="Server DSN"
                name={'dsn'}
                inputProps={{placeholder: 'mysql://host:3306 · mariadb://host:3306 · postgresql://host:5432/database'}}
              />
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
