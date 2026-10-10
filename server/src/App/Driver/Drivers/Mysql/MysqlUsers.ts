import {
  DbUserInterface,
  PrivilegeLevelInterface,
  UserChangeType,
  UserGrantInterface,
  UserManagerInterface,
  UserStatementInterface,
} from '../../Interface/Data/UserInterface';
const mysql = require('mysql');

const TABLE_PRIVILEGES = ['ALL PRIVILEGES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX',
  'REFERENCES', 'CREATE VIEW', 'SHOW VIEW', 'TRIGGER'];
const DATABASE_PRIVILEGES = [...TABLE_PRIVILEGES, 'EXECUTE', 'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'LOCK TABLES', 'CREATE TEMPORARY TABLES'];
const GLOBAL_PRIVILEGES = [...DATABASE_PRIVILEGES, 'PROCESS', 'RELOAD', 'SHOW DATABASES', 'CREATE USER', 'FILE', 'SUPER',
  'REPLICATION CLIENT', 'REPLICATION SLAVE', 'SHUTDOWN'];

const PASSWORD_MASK = "'********'";

/**
 * MySQL / MariaDB accounts - mysql.user, SHOW GRANTS, CREATE / ALTER / DROP USER, GRANT / REVOKE
 * @author Mateusz Bochen
 */
class MysqlUsers implements UserManagerInterface {
  constructor(private readonly query: (sql: string, params?: any[]) => Promise<any[]>) {
  }

  async getUsers(): Promise<DbUserInterface[]> {
    const rows = await this.query('SELECT * FROM `mysql`.`user` ORDER BY `User`, `Host`');
    return rows.map((row) => {
      const attributes: string[] = [];
      if (row.is_role === 'Y') attributes.push('role');
      if (row.Super_priv === 'Y') attributes.push('superuser');
      if (row.account_locked === 'Y') attributes.push('locked');
      if (row.password_expired === 'Y') attributes.push('password expired');
      if (row.plugin) attributes.push(row.plugin);
      return {name: row.User, host: row.Host, attributes};
    });
  }

  getPrivilegeLevels(): PrivilegeLevelInterface[] {
    return [
      {level: 'database', label: 'Database (db.*)', privileges: DATABASE_PRIVILEGES, needsDatabase: true, needsTable: false, needsRole: false},
      {level: 'table', label: 'Table (db.table)', privileges: TABLE_PRIVILEGES, needsDatabase: true, needsTable: true, needsRole: false},
      {level: 'global', label: 'Global (*.*)', privileges: GLOBAL_PRIVILEGES, needsDatabase: false, needsTable: false, needsRole: false},
    ];
  }

  async getGrants(user: {name: string, host: string | null}): Promise<UserGrantInterface[]> {
    const rows = await this.query('SHOW GRANTS FOR ?@?', [user.name, user.host ?? '%']);
    return rows.map((row) => {
      const grant = String(Object.values(row)[0]);
      return {grant, revoke: MysqlUsers.revokeOf(grant)};
    });
  }

  async buildChange(user: {name: string, host: string | null} | null, change: UserChangeType): Promise<UserStatementInterface[]> {
    if (change.kind === 'create') {
      const name = MysqlUsers.required(change.name, 'User name');
      const account = mysql.format('?@?', [name, change.host?.trim() || '%']);
      return [MysqlUsers.withPassword(`CREATE USER ${account} IDENTIFIED BY`, change.password)];
    }
    if (!user?.name) {
      throw new Error('User is required');
    }
    const account = mysql.format('?@?', [user.name, user.host ?? '%']);

    switch (change.kind) {
      case 'drop':
        return [MysqlUsers.plain(`DROP USER ${account}`)];
      case 'password':
        return [MysqlUsers.withPassword(`ALTER USER ${account} IDENTIFIED BY`, change.password)];
      case 'grant': {
        const level = this.getPrivilegeLevels().find((item) => item.level === change.level);
        if (!level) {
          throw new Error(`Unknown privilege level ${change.level}`);
        }
        if (!change.privileges?.length || change.privileges.some((privilege) => !level.privileges.includes(privilege))) {
          throw new Error('Select privileges from the list');
        }
        let target = '*.*';
        if (level.needsDatabase) {
          const database = mysql.escapeId(MysqlUsers.required(change.database, 'Database'));
          target = level.needsTable ? `${database}.${mysql.escapeId(MysqlUsers.required(change.table, 'Table'))}` : `${database}.*`;
        }
        const privileges = change.privileges.includes('ALL PRIVILEGES') ? 'ALL PRIVILEGES' : change.privileges.join(', ');
        return [MysqlUsers.plain(`GRANT ${privileges} ON ${target} TO ${account}${change.withGrantOption ? ' WITH GRANT OPTION' : ''}`)];
      }
      case 'revoke': {
        // only grants which the user really has - REVOKE is built from server text, not from client
        const grant = (await this.getGrants(user)).find((item) => item.grant === change.grant);
        if (!grant?.revoke) {
          throw new Error('This grant cannot be revoked (it was changed meanwhile or it is basic USAGE)');
        }
        return grant.revoke.map(MysqlUsers.plain);
      }
      default:
        throw new Error(`Unknown user change ${(change as UserChangeType).kind}`);
    }
  }

  /** GRANT ... TO user -> REVOKE ... FROM user (and grant option separately) */
  private static revokeOf(grant: string): string[] | null {
    if (/^GRANT USAGE ON \*\.\* TO /i.test(grant)) {
      return null;
    }
    const withGrantOption = /\s+WITH (GRANT|ADMIN) OPTION\s*$/i.exec(grant);
    const base = grant
      .replace(/\s+IDENTIFIED (BY|VIA|WITH) .*$/i, '')
      .replace(/\s+WITH (GRANT|ADMIN) OPTION\s*$/i, '');
    const to = base.lastIndexOf(' TO ');
    if (!/^GRANT\s/i.test(base) || to === -1) {
      return null;
    }
    const revoke = `REVOKE ${base.slice(6, to)} FROM ${base.slice(to + 4)}`;
    if (withGrantOption && /\sON\s/i.test(base)) {
      const on = base.slice(base.search(/\sON\s/i), to);
      return [revoke, `REVOKE GRANT OPTION${on} FROM ${base.slice(to + 4)}`];
    }
    return [revoke];
  }

  private static withPassword(prefix: string, password: string): UserStatementInterface {
    if (typeof password !== 'string' || !password) {
      throw new Error('Password is required');
    }
    return {sql: `${prefix} ${mysql.escape(password)}`, display: `${prefix} ${PASSWORD_MASK}`};
  }

  private static plain(sql: string): UserStatementInterface {
    return {sql, display: sql};
  }

  private static required(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is required`);
    }
    return value.trim();
  }
}

export default MysqlUsers;
