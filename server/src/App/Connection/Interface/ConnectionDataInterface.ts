

interface ConnectionDataInterface {
  dsn: string;
  username: string;
  changeConfirmationRequired: boolean;
  displayName: string;
  /** changes are refused, sessions are read only in database */
  readOnly?: boolean;
  /** PostgreSQL - database opened instead of the one of DSN (database chosen in tree) */
  database?: string;
}

export default ConnectionDataInterface;
