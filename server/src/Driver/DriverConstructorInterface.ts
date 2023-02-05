import ConnectionDataType from './Type/ConnectionDataType';

interface DriverConstructorInterface {
  new(connectionData: ConnectionDataType): {connectionData: ConnectionDataType}
}

export default DriverConstructorInterface;
