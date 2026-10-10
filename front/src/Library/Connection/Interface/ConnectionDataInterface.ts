

interface ConnectionDataInterface {
  dsn: string;
  username: string;
  changeConfirmationRequired: boolean;
  displayName: string;
  id: string;
  /** color of connection and its tabs, e.g. red for production */
  color?: string;
  /** changes are refused by server, sessions are read only in database */
  readOnly?: boolean;
  /** defined by administrator on server (FLASE_CONNECTIONS) - cannot be changed or deleted, address is taken by server */
  predefined?: boolean;
}

export default ConnectionDataInterface;
