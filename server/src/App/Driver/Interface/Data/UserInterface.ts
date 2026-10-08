
/** account of database server - MySQL user@host, PostgreSQL role (host is null) */
export interface DbUserInterface {
  name: string;
  host: string | null;
  /** e.g. superuser, login, locked, plugin, member of ... */
  attributes: string[];
}

export type PrivilegeLevelType = 'global' | 'database' | 'schema' | 'allTables' | 'table' | 'role';

/** where privileges can be granted and which privileges */
export interface PrivilegeLevelInterface {
  level: PrivilegeLevelType;
  label: string;
  privileges: string[];
  needsDatabase: boolean;
  needsTable: boolean;
  needsRole: boolean;
}

/** GRANT statement of user, revoke is null when grant cannot be revoked (basic USAGE) */
export interface UserGrantInterface {
  grant: string;
  revoke: string[] | null;
}

export type UserChangeType =
  | {kind: 'create', name: string, host: string | null, password: string}
  | {kind: 'drop'}
  | {kind: 'password', password: string}
  | {kind: 'grant', level: PrivilegeLevelType, privileges: string[], database?: string, table?: string, role?: string, withGrantOption: boolean}
  /** grant text as listed - server builds REVOKE from current grants */
  | {kind: 'revoke', grant: string};

/** statement and its text for preview (passwords hidden) */
export interface UserStatementInterface {
  sql: string;
  display: string;
}

/** user accounts and privileges of server */
export interface UserManagerInterface {
  getUsers(): Promise<DbUserInterface[]>;
  getPrivilegeLevels(): PrivilegeLevelInterface[];
  getGrants(user: {name: string, host: string | null}): Promise<UserGrantInterface[]>;
  /** user is null for create */
  buildChange(user: {name: string, host: string | null} | null, change: UserChangeType): Promise<UserStatementInterface[]>;
}

export interface UsersRequestInterface {
  tabId?: string;
}

export interface UserGrantsRequestInterface {
  tabId?: string;
  user: {name: string, host: string | null};
}

export interface UserChangeRequestInterface {
  tabId?: string;
  user: {name: string, host: string | null} | null;
  change: UserChangeType;
  dryRun: boolean;
}
