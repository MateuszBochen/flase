"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
const TABLE_PRIVILEGES = ['ALL PRIVILEGES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const SCHEMA_PRIVILEGES = ['ALL PRIVILEGES', 'USAGE', 'CREATE'];
const DATABASE_PRIVILEGES = ['ALL PRIVILEGES', 'CONNECT', 'CREATE', 'TEMPORARY'];
const PASSWORD_MASK = "'********'";
/** object kind of pg_class.relkind in GRANT */
const OBJECT_KIND = { r: 'TABLE', p: 'TABLE', v: 'TABLE', m: 'TABLE', f: 'TABLE', S: 'SEQUENCE' };
/**
 * PostgreSQL roles - pg_roles, privileges from ACL of database, schemas, tables and sequences, role membership
 * @author Mateusz Bochen
 */
class PostgresUsers {
    constructor(query) {
        this.query = query;
    }
    async getUsers() {
        const rows = await this.query(`SELECT r.rolname, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolvaliduntil,
              array(SELECT b.rolname::text FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of
       FROM pg_roles r WHERE r.rolname !~ '^pg_' ORDER BY r.rolname`);
        return rows.map((row) => {
            var _a;
            const attributes = [];
            if (row.rolsuper)
                attributes.push('superuser');
            attributes.push(row.rolcanlogin ? 'login' : 'no login (group role)');
            if (row.rolcreatedb)
                attributes.push('create database');
            if (row.rolcreaterole)
                attributes.push('create role');
            if (row.rolreplication)
                attributes.push('replication');
            if (row.rolvaliduntil)
                attributes.push(`valid until ${new Date(row.rolvaliduntil).toISOString().slice(0, 10)}`);
            if ((_a = row.member_of) === null || _a === void 0 ? void 0 : _a.length)
                attributes.push(`member of ${row.member_of.join(', ')}`);
            return { name: row.rolname, host: null, attributes };
        });
    }
    getPrivilegeLevels() {
        return [
            { level: 'schema', label: 'Schema', privileges: SCHEMA_PRIVILEGES, needsDatabase: true, needsTable: false, needsRole: false },
            { level: 'allTables', label: 'All tables in schema', privileges: TABLE_PRIVILEGES, needsDatabase: true, needsTable: false, needsRole: false },
            { level: 'table', label: 'Table', privileges: TABLE_PRIVILEGES, needsDatabase: true, needsTable: true, needsRole: false },
            { level: 'database', label: 'Database (connected one)', privileges: DATABASE_PRIVILEGES, needsDatabase: false, needsTable: false, needsRole: false },
            { level: 'role', label: 'Membership of role', privileges: [], needsDatabase: false, needsTable: false, needsRole: true },
        ];
    }
    async getGrants(user) {
        const role = PostgresSql_1.default.identifier(user.name);
        const rows = await this.query(`WITH target AS (SELECT oid FROM pg_roles WHERE rolname = $1)
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
       ORDER BY sort, schema NULLS FIRST, name, privilege_type`, [user.name]);
        // privileges of one object in one GRANT
        const objects = new Map();
        rows.forEach((row) => {
            const kind = row.kind === 'DATABASE' || row.kind === 'SCHEMA' ? row.kind : OBJECT_KIND[row.kind];
            const name = row.schema ? PostgresSql_1.default.table(row.schema, row.name) : PostgresSql_1.default.identifier(row.name);
            const target = `${kind} ${name}`;
            if (!objects.has(target)) {
                objects.set(target, { target, privileges: [], grantable: true });
            }
            objects.get(target).privileges.push(row.privilege_type);
            objects.get(target).grantable = objects.get(target).grantable && row.is_grantable;
        });
        const grants = Array.from(objects.values()).map((object) => {
            const privileges = object.privileges.join(', ');
            return {
                grant: `GRANT ${privileges} ON ${object.target} TO ${role}${object.grantable ? ' WITH GRANT OPTION' : ''}`,
                revoke: [`REVOKE ${privileges} ON ${object.target} FROM ${role}`],
            };
        });
        const memberships = await this.query(`SELECT b.rolname, m.admin_option FROM pg_auth_members m
       JOIN pg_roles b ON b.oid = m.roleid JOIN pg_roles u ON u.oid = m.member
       WHERE u.rolname = $1 ORDER BY b.rolname`, [user.name]);
        memberships.forEach((row) => grants.push({
            grant: `GRANT ${PostgresSql_1.default.identifier(row.rolname)} TO ${role}${row.admin_option ? ' WITH ADMIN OPTION' : ''}`,
            revoke: [`REVOKE ${PostgresSql_1.default.identifier(row.rolname)} FROM ${role}`],
        }));
        return grants;
    }
    async buildChange(user, change) {
        var _a;
        if (change.kind === 'create') {
            const name = PostgresSql_1.default.identifier(PostgresUsers.required(change.name, 'Role name'));
            return [PostgresUsers.withPassword(`CREATE ROLE ${name} WITH LOGIN PASSWORD`, change.password)];
        }
        if (!(user === null || user === void 0 ? void 0 : user.name)) {
            throw new Error('Role is required');
        }
        const role = PostgresSql_1.default.identifier(user.name);
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
                    const member = PostgresSql_1.default.identifier(PostgresUsers.required(change.role, 'Role'));
                    return [PostgresUsers.plain(`GRANT ${member} TO ${role}${change.withGrantOption ? ' WITH ADMIN OPTION' : ''}`)];
                }
                if (!((_a = change.privileges) === null || _a === void 0 ? void 0 : _a.length) || change.privileges.some((privilege) => !level.privileges.includes(privilege))) {
                    throw new Error('Select privileges from the list');
                }
                let target;
                switch (change.level) {
                    case 'database': {
                        const [database] = await this.query('SELECT current_database() AS name');
                        target = `DATABASE ${PostgresSql_1.default.identifier(database.name)}`;
                        break;
                    }
                    case 'schema':
                        target = `SCHEMA ${PostgresSql_1.default.identifier(PostgresUsers.required(change.database, 'Schema'))}`;
                        break;
                    case 'allTables':
                        target = `ALL TABLES IN SCHEMA ${PostgresSql_1.default.identifier(PostgresUsers.required(change.database, 'Schema'))}`;
                        break;
                    default:
                        target = `TABLE ${PostgresSql_1.default.table(PostgresUsers.required(change.database, 'Schema'), PostgresUsers.required(change.table, 'Table'))}`;
                }
                const privileges = change.privileges.includes('ALL PRIVILEGES') ? 'ALL PRIVILEGES' : change.privileges.join(', ');
                return [PostgresUsers.plain(`GRANT ${privileges} ON ${target} TO ${role}${change.withGrantOption ? ' WITH GRANT OPTION' : ''}`)];
            }
            case 'revoke': {
                // only grants which the role really has - REVOKE is built from catalog, not from client
                const grant = (await this.getGrants(user)).find((item) => item.grant === change.grant);
                if (!(grant === null || grant === void 0 ? void 0 : grant.revoke)) {
                    throw new Error('This grant cannot be revoked (it was changed meanwhile)');
                }
                return grant.revoke.map(PostgresUsers.plain);
            }
            default:
                throw new Error(`Unknown role change ${change.kind}`);
        }
    }
    static withPassword(prefix, password) {
        if (typeof password !== 'string' || !password) {
            throw new Error('Password is required');
        }
        return { sql: `${prefix} ${PostgresSql_1.default.literal(password)}`, display: `${prefix} ${PASSWORD_MASK}` };
    }
    static plain(sql) {
        return { sql, display: sql };
    }
    static required(value, label) {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`${label} is required`);
        }
        return value.trim();
    }
}
exports.default = PostgresUsers;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNVc2Vycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9BcHAvRHJpdmVyL0RyaXZlcnMvUG9zdGdyZXMvUG9zdGdyZXNVc2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQVFBLGdFQUF3QztBQUV4QyxNQUFNLGdCQUFnQixHQUFHLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDekgsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUNoRSxNQUFNLG1CQUFtQixHQUFHLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUVqRixNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUM7QUFFbkMsK0NBQStDO0FBQy9DLE1BQU0sV0FBVyxHQUE2QixFQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFDLENBQUM7QUFFMUg7OztHQUdHO0FBQ0gsTUFBTSxhQUFhO0lBQ2pCLFlBQTZCLEtBQXNEO1FBQXRELFVBQUssR0FBTCxLQUFLLENBQWlEO0lBQ25GLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUTtRQUNaLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FDM0I7O29FQUU4RCxDQUMvRCxDQUFDO1FBQ0YsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7O1lBQ3RCLE1BQU0sVUFBVSxHQUFhLEVBQUUsQ0FBQztZQUNoQyxJQUFJLEdBQUcsQ0FBQyxRQUFR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