

interface ConnectionDataInterface {
  dsn: string;
  username: string;
  changeConfirmationRequired: boolean;
  displayName: string;
  /** changes are refused, sessions are read only in database */
  readOnly?: boolean;
}

export default ConnectionDataInterface;
