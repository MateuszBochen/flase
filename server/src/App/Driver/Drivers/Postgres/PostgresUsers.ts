import {
  DbUserInterface,
  PrivilegeLevelInterface,
  UserChangeType,
  UserGrantInterface,
  UserManagerInterface,
  UserStatementInterface,
} from '../../Interface/Data/UserInterface';
import PostgresSql from './PostgresSql';

const TABLE_PRIVILEGES = ['ALL PRIVILEGES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const SCHEMA_PRIVILEGES = ['ALL PRIVILEGES', 'USAGE', 'CREATE'];
const DATABASE_PRIVILEGES = ['ALL PRIVILEGES', 'CONNECT', 'CREATE', 'TEMPORARY'];

const PASSWORD_MASK = "'********'";

/** object kind of pg_class.relkind in GRANT */
const OBJECT_KIND: {[kind: string]: string} = {r: 'TABLE', p: 'TABLE', v: 'TABLE', m: 'TABLE', f: 'TABLE', S: 'SEQUENCE'};

/**
 * PostgreSQL roles - pg_roles, privileges from ACL of database, schemas, tables and sequences, role membership
 * @author Mateusz Bochen
 */
class PostgresUsers implements UserManagerInterface {
  constructor(private readonly query: (sql: string, params?: any[]) => Promise<any[]>) {
  }

  async getUsers(): Promise<DbUserInterface[]> {
    const rows = await this.query(
      `SELECT r.rolname, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolvaliduntil,
              array(SELECT b.rolname::text FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of
       FROM pg_roles r WHERE r.rolname !~ '^pg_' ORDER BY r.rolname`,
    );
    return rows.map((row) => {
      const attributes: string[] = [];
      if (row.rolsuper) attributes.push('superuser');
      attributes.push(row.rolcanlogin ? 'login' : 'no login (group role)');
      if (row.rolcreatedb) attributes.push('create database');
      if (row.rolcreaterole) attributes.push('create role');
      if (row.rolreplication) attributes.push('replication');
      if (row.rolvaliduntil) attributes.push(`valid until ${new Date(row.rolvaliduntil).toISOString().slice(0, 10)}`);
      if (row.member_of?.length) attributes.push(`member of ${row.member_of.join(', ')}`);
      return {name: row.rolname, host: null, attributes};
    });
  }

  getPrivilegeLevels(): PrivilegeLevelInterface[] {
    return [
      {level: 'schema', label: 'Schema', privileges: SCHEMA_PRIVILEGES, needsDatabase: true, needsTable: false, needsRole: false},
      {level: 'allTables', label: 'All tables in schema', privileges: TABLE_PRIVILEGES, needsDatabase: true, needsTable: false, needsRole: false},
      {level: 'table', label: 'Table', privileges: TABLE_PRIVILEGES, needsDatabase: true, needsTable: true, needsRole: false},
      {level: 'database', label: 'Database (connected one)', privileges: DATABASE_PRIVILEGES, needsDatabase: false, needsTable: false, needsRole: false},
      {level: 'role', label: 'Membership of role', privileges: [], needsDatabase: false, needsTable: false, needsRole: true},
    ];
  }

  async getGrants(user: {name: string, host: string | null}): Promise<UserGrantInterface[]> {
    const role = PostgresSql.identifier(user.name);
    const rows = await this.query(
      `WITH target AS (SELECT oid FROM pg_roles WHERE rolname = $1)
       SELECT 'DATABASE' AS kind, NULL AS schema, d.datname AS name, a.privilege_type, a.is_grantable, 0 AS sort
         FROM pg_database d, aclexplode(d.datacl) a WHERE d.datname = current_database() AND a.grantee = (SELECT oid FROM target)
       UNION ALL
       SELECT 'SCHEMA', NULL, n.nspname, a.privilege_type, a.is_grantable, 1
         FROM pg_namespace n, aclexplode(n.nspacl) a
         WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND a.grantee = (SELECT oid FROM target)
       UNION ALL
       SELECT c.relkind::text, n.nspname, c.relname, a.privilege_type, a.is_grantable, 2
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a
         WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
           AND a.grantee = (SELECT oid FROM target)
       ORDER BY sort, schema NULLS FIRST, name, privilege_type`,
      [user.name],
    );

    // privileges of one object in one GRANT
    const objects = new Map<string, {target: string, privileges: string[], grantable: boolean}>();
    rows.forEach((row) => {
      const kind = row.kind === 'DATABASE' || row.kind === 'SCHEMA' ? row.kind : OBJECT_KIND[row.kind];
      const name = row.schema ? PostgresSql.table(row.schema, row.name) : PostgresSql.identifier(row.name);
      const target = `${kind} ${name}`;
      if (!objects.has(target)) {
        objects.set(target, {target, privileges: [], grantable: true});
      }
      objects.get(target)!.privileges.push(row.privilege_type);
      objects.get(target)!.grantable = objects.get(target)!.grantable && row.is_grantable;
    });

    const grants: UserGrantInterface[] = Array.from(objects.values()).map((object) => {
      const privileges = object.privileges.join(', ');
      return {
        grant: `GRANT ${privileges} ON ${object.target} TO ${role}${object.grantable ? ' WITH GRANT OPTION' : ''}`,
        revoke: [`REVOKE ${privileges} ON ${object.target} FROM ${role}`],
      };
    });

    const memberships = await this.query(
      `SELECT b.rolname, m.admin_option FROM pg_auth_members m
       JOIN pg_roles b ON b.oid = m.roleid JOIN pg_roles u ON u.oid = m.member
       WHERE u.rolname = $1 ORDER BY b.rolname`,
      [user.name],
    );
    memberships.forEach((row) => grants.push({
      grant: `GRANT ${PostgresSql.identifier(row.rolname)} TO ${role}${row.admin_option ? ' WITH ADMIN OPTION' : ''}`,
      revoke: [`REVOKE ${PostgresSql.identifier(row.rolname)} FROM ${role}`],
    }));
    return grants;
  }

  async buildChange(user: {name: string, host: string | null} | null, change: UserChangeType): Promise<UserStatementInterface[]> {
    if (change.kind === 'create') {
      const name = PostgresSql.identifier(PostgresUsers.required(change.name, 'Role name'));
      return [PostgresUsers.withPassword(`CREATE ROLE ${name} WITH LOGIN PASSWORD`, change.password)];
    }
    if (!user?.name) {
      throw new Error('Role is required');
    }
    const role = PostgresSql.identifier(user.name);

    switch (change.kind) {
      case 'drop':
        return [PostgresUsers.plain(`DROP ROLE ${role}`)];
      case 'password':
        return [PostgresUsers.withPassword(`ALTER ROLE ${role} WITH PASSWORD`, change.password)];
      case 'grant': {
        const level = this.getPrivilegeLevels().find((item) => item.level === change.level);
        if (!level) {
          throw new Error(`Unknown privilege level ${change.level}`);
        }
        if (level.needsRole) {
          const member = PostgresSql.identifier(PostgresUsers.required(change.role, 'Role'));
          return [PostgresUsers.plain(`GRANT ${member} TO ${role}${change.withGrantOption ? ' WITH ADMIN OPTION' : ''}`)];
        }
        if (!change.privileges?.length || change.privileges.some((privilege) => !level.privileges.includes(privilege))) {
          throw new Error('Select privileges from the list');
        }
        let target: string;
        switch (change.level) {
          case 'database': {
            const [database] = await this.query('SELECT current_database() AS name');
            target = `DATABASE ${PostgresSql.identifier(database.name)}`;
            break;
          }
          case 'schema':
            target = `SCHEMA ${PostgresSql.identifier(PostgresUsers.required(change.database, 'Schema'))}`;
            break;
          case 'allTables':
            target = `ALL TABLES IN SCHEMA ${PostgresSql.identifier(PostgresUsers.required(change.database, 'Schema'))}`;
            break;
          default:
            target = `TABLE ${PostgresSql.table(PostgresUsers.required(change.database, 'Schema'), PostgresUsers.required(change.table, 'Table'))}`;
        }
        const privileges = change.privileges.includes('ALL PRIVILEGES') ? 'ALL PRIVILEGES' : change.privileges.join(', ');
        return [PostgresUsers.plain(`GRANT ${privileges} ON ${target} TO ${role}${change.withGrantOption ? ' WITH GRANT OPTION' : ''}`)];
      }
      case 'revoke': {
        // only grants which the role really has - REVOKE is built from catalog, not from client
        const grant = (await this.getGrants(user)).find((item) => item.grant === change.grant);
        if (!grant?.revoke) {
          throw new Error('This grant cannot be revoked (it was changed meanwhile)');
        }
        return grant.revoke.map(PostgresUsers.plain);
      }
      default:
        throw new Error(`Unknown role change ${(change as UserChangeType).kind}`);
    }
  }

  private static withPassword(prefix: string, password: string): UserStatementInterface {
    if (typeof password !== 'string' || !password) {
      throw new Error('Password is required');
    }
    return {sql: `${prefix} ${PostgresSql.literal(password)}`, display: `${prefix} ${PASSWORD_MASK}`};
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

export default PostgresUsers;
