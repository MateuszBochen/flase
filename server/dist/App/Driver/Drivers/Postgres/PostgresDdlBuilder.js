"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
/**
 * Builds DDL for PostgreSQL. Names and values are escaped,
 * column type and default expression are written as they are - they are validated not to contain statement breaks.
 * Current structure is read from catalog - change of column is written as difference to it.
 * @author Mateusz Bochen
 */
class PostgresDdlBuilder {
    constructor(catalog) {
        this.catalog = catalog;
    }
    async build(table, change) {
        const tableName = PostgresDdlBuilder.tableName(table);
        switch (change.kind) {
            case 'alter':
                return this.alter(table, change.operations);
            case 'truncate':
                // the same as MySQL - auto increment starts again
                return [`TRUNCATE TABLE ${tableName} RESTART IDENTITY`];
            case 'drop': {
                const kind = await this.relationKind(table);
                const object = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : kind === 'f' ? 'FOREIGN TABLE' : 'TABLE';
                return [`DROP ${object} ${tableName}`];
            }
            case 'rename': {
                const newName = PostgresDdlBuilder.requireName(change.newName, 'New table name');
                const kind = await this.relationKind(table);
                const object = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : 'TABLE';
                return [`ALTER ${object} ${tableName} RENAME TO ${PostgresSql_1.default.identifier(newName)}`];
            }
            case 'copy':
                return this.copy(table, PostgresDdlBuilder.requireName(change.newName, 'New table name'), change.withData);
            default:
                throw new Error(`Unknown structure change ${change.kind}`);
        }
    }
    /** one ALTER TABLE for column changes, renames and comments after it (DDL is transactional) */
    async alter(table, operations) {
        var _a, _b;
        if (!(operations === null || operations === void 0 ? void 0 : operations.length)) {
            throw new Error('Nothing to change');
        }
        const tableName = PostgresDdlBuilder.tableName(table);
        const columns = await this.catalog.columns(table.databaseName, [table.name]);
        const clauses = [];
        const before = [];
        const after = [];
        for (const operation of operations) {
            switch (operation.op) {
                case 'addColumn': {
                    PostgresDdlBuilder.checkPosition(operation.position);
                    const column = operation.column;
                    clauses.push(`ADD COLUMN ${PostgresDdlBuilder.columnDefinition(column)}`);
                    if (column.comment) {
                        after.push(PostgresDdlBuilder.comment(tableName, column.name, column.comment));
                    }
                    break;
                }
                case 'changeColumn': {
                    PostgresDdlBuilder.checkPosition(operation.position);
                    const name = PostgresDdlBuilder.requireName(operation.name, 'Column name');
                    const current = columns.find((column) => column.name === name);
                    if (!current) {
                        throw new Error(`Column ${name} does not exist`);
                    }
                    const changes = PostgresDdlBuilder.columnChanges(current, operation.column);
                    clauses.push(...changes.clauses);
                    const newName = PostgresDdlBuilder.requireName(operation.column.name, 'Column name');
                    if (newName !== name) {
                        after.push(`ALTER TABLE ${tableName} RENAME COLUMN ${PostgresSql_1.default.identifier(name)} TO ${PostgresSql_1.default.identifier(newName)}`);
                    }
                    if ((operation.column.comment || '') !== current.comment) {
                        after.push(PostgresDdlBuilder.comment(tableName, newName, operation.column.comment));
                    }
                    break;
                }
                case 'dropColumn':
                    clauses.push(`DROP COLUMN ${PostgresSql_1.default.identifier(PostgresDdlBuilder.requireName(operation.name, 'Column name'))}`);
                    break;
                case 'addIndex': {
                    if (!((_a = operation.columns) === null || _a === void 0 ? void 0 : _a.length)) {
                        throw new Error('Index needs at least one column');
                    }
                    if (operation.columns.some((column) => column.length)) {
                        throw new Error('PostgreSQL does not support prefix length of index columns - use expression index in SQL console');
                    }
                    const indexColumns = operation.columns.map((column) => PostgresSql_1.default.identifier(PostgresDdlBuilder.requireName(column.name, 'Index column'))).join(', ');
                    if (operation.kind === 'PRIMARY') {
                        clauses.push(`ADD PRIMARY KEY (${indexColumns})`);
                        break;
                    }
                    if (operation.kind === 'FULLTEXT') {
                        throw new Error('FULLTEXT index is not supported in PostgreSQL - use GIN index on to_tsvector() in SQL console');
                    }
                    if (operation.kind !== 'INDEX' && operation.kind !== 'UNIQUE') {
                        throw new Error(`Unknown index kind ${operation.kind}`);
                    }
                    const indexName = ((_b = operation.name) === null || _b === void 0 ? void 0 : _b.trim()) ? ` ${PostgresSql_1.default.identifier(operation.name.trim())}` : '';
                    after.push(`CREATE ${operation.kind === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX${indexName} ON ${tableName} (${indexColumns})`);
                    break;
                }
                case 'dropIndex': {
                    const name = PostgresDdlBuilder.requireName(operation.name, 'Index name');
                    const index = (await this.catalog.indexes(table.databaseName, table.name)).find((item) => item.name === name);
                    if (!index) {
                        throw new Error(`Index ${name} does not exist`);
                    }
                    // index of primary key / unique constraint is removed with the constraint
                    if (index.constraint) {
                        clauses.push(`DROP CONSTRAINT ${PostgresSql_1.default.identifier(index.constraint)}`);
                    }
                    else {
                        before.push(`DROP INDEX ${PostgresSql_1.default.table(table.databaseName, name)}`);
                    }
                    break;
                }
                default:
                    throw new Error(`Unknown operation ${operation.op}`);
            }
        }
        const statements = [...before];
        if (clauses.length) {
            statements.push(`ALTER TABLE ${tableName}\n  ${clauses.join(',\n  ')}`);
        }
        statements.push(...after);
        if (!statements.length) {
            throw new Error('Nothing to change');
        }
        return statements;
    }
    /** ALTER COLUMN clauses for differences between current column and new definition */
    static columnChanges(current, column) {
        var _a, _b, _c;
        if (column.onUpdateCurrentTimestamp) {
            throw new Error('ON UPDATE CURRENT_TIMESTAMP is not supported in PostgreSQL - use trigger');
        }
        const name = PostgresSql_1.default.identifier(current.name);
        const clauses = [];
        const type = PostgresDdlBuilder.rawPart(column.type, 'Column type');
        if (current.generated) {
            // only name and comment of generated column can be changed here
            return { clauses };
        }
        if (type.toLowerCase() !== current.type.toLowerCase() || (column.collation || null) !== (current.collation || null)) {
            const collation = column.collation ? ` COLLATE ${PostgresSql_1.default.identifier(column.collation)}` : '';
            // explicit cast - text to number etc. is not converted automatically
            clauses.push(`ALTER COLUMN ${name} TYPE ${type}${collation} USING ${name}::${type}`);
        }
        if (column.nullable !== current.nullable) {
            clauses.push(`ALTER COLUMN ${name} ${column.nullable ? 'DROP' : 'SET'} NOT NULL`);
        }
        const wasAuto = !!current.identity || current.serial;
        if (column.autoIncrement && !wasAuto) {
            clauses.push(`ALTER COLUMN ${name} ADD GENERATED BY DEFAULT AS IDENTITY`);
        }
        else if (!column.autoIncrement && current.identity) {
            clauses.push(`ALTER COLUMN ${name} DROP IDENTITY`);
        }
        // default of identity column is the sequence
        if (!column.autoIncrement || current.serial) {
            const wanted = PostgresDdlBuilder.defaultSql(column.defaultValue);
            const now = current.defaultExpression === null ? null : current.defaultExpression;
            const currentKind = now === null ? 'none' : current.defaultLiteral !== null ? 'value' : 'expression';
            const sameDefault = (wanted === null && now === null)
                || (((_a = column.defaultValue) === null || _a === void 0 ? void 0 : _a.kind) === 'value' && currentKind === 'value' && column.defaultValue.value === current.defaultLiteral)
                || (((_b = column.defaultValue) === null || _b === void 0 ? void 0 : _b.kind) === 'expression' && currentKind === 'expression' && column.defaultValue.value.trim() === now)
                || (((_c = column.defaultValue) === null || _c === void 0 ? void 0 : _c.kind) === 'null' && now === null);
            if (!sameDefault) {
                clauses.push(wanted === null ? `ALTER COLUMN ${name} DROP DEFAULT` : `ALTER COLUMN ${name} SET DEFAULT ${wanted}`);
            }
        }
        return { clauses };
    }
    /** CREATE TABLE ... (LIKE ... INCLUDING ALL), data are copied with new identity values continuing after copied ones */
    async copy(table, newName, withData) {
        const source = PostgresDdlBuilder.tableName(table);
        const copy = PostgresDdlBuilder.tableName(Object.assign(Object.assign({}, table), { name: newName }));
        const statements = [`CREATE TABLE ${copy} (LIKE ${source} INCLUDING ALL)`];
        if (!withData) {
            return statements;
        }
        const columns = (await this.catalog.columns(table.databaseName, [table.name])).filter((column) => !column.generated);
        const list = PostgresSql_1.default.identifiers(columns.map((column) => column.name));
        const overriding = columns.some((column) => column.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
        statements.push(`INSERT INTO ${copy} (${list})${overriding} SELECT ${list} FROM ${source}`);
        // LIKE creates new sequence for identity columns - it would start at 1
        columns.filter((column) => column.identity).forEach((column) => {
            const id = PostgresSql_1.default.identifier(column.name);
            statements.push(`SELECT setval(pg_get_serial_sequence(${PostgresSql_1.default.literal(copy)}, ${PostgresSql_1.default.literal(column.name)}), COALESCE(MAX(${id}), 0) + 1, false) FROM ${copy}`);
        });
        return statements;
    }
    static columnDefinition(column) {
        if (column.onUpdateCurrentTimestamp) {
            throw new Error('ON UPDATE CURRENT_TIMESTAMP is not supported in PostgreSQL - use trigger');
        }
        const parts = [
            PostgresSql_1.default.identifier(PostgresDdlBuilder.requireName(column === null || column === void 0 ? void 0 : column.name, 'Column name')),
            PostgresDdlBuilder.rawPart(column.type, 'Column type'),
        ];
        if (column.collation) {
            parts.push(`COLLATE ${PostgresSql_1.default.identifier(column.collation)}`);
        }
        if (column.autoIncrement) {
            parts.push('GENERATED BY DEFAULT AS IDENTITY');
        }
        else {
            const defaultSql = PostgresDdlBuilder.defaultSql(column.defaultValue);
            if (defaultSql !== null) {
                parts.push(`DEFAULT ${defaultSql}`);
            }
        }
        parts.push(column.nullable && !column.autoIncrement ? 'NULL' : 'NOT NULL');
        return parts.join(' ');
    }
    static defaultSql(value) {
        const defaultValue = value || { kind: 'none' };
        switch (defaultValue.kind) {
            case 'null':
                return 'NULL';
            case 'value':
                return PostgresSql_1.default.literal(defaultValue.value);
            case 'expression':
                return PostgresDdlBuilder.rawPart(defaultValue.value, 'Default expression');
            default:
                return null;
        }
    }
    static comment(tableName, column, comment) {
        return `COMMENT ON COLUMN ${tableName}.${PostgresSql_1.default.identifier(column)} IS ${comment ? PostgresSql_1.default.literal(comment) : 'NULL'}`;
    }
    /** PostgreSQL keeps columns in order of creation */
    static checkPosition(position) {
        if (position && position.kind !== 'end') {
            throw new Error('PostgreSQL cannot place column at chosen position - columns are always added at the end');
        }
    }
    async relationKind(table) {
        const relation = (await this.catalog.relations(table.databaseName)).find((item) => item.name === table.name);
        if (!relation) {
            throw new Error(`Table ${table.databaseName}.${table.name} does not exist`);
        }
        return relation.kind;
    }
    static tableName(table) {
        return PostgresSql_1.default.table(PostgresDdlBuilder.requireName(table.databaseName, 'Schema'), PostgresDdlBuilder.requireName(table.name, 'Table name'));
    }
    static requireName(name, label) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error(`${label} is required`);
        }
        return name.trim();
    }
    /** type / expression is written into sql as it is - must stay one part of one statement */
    static rawPart(value, label) {
        const text = PostgresDdlBuilder.requireName(value, label);
        // strings and quoted names may contain anything, check only the rest
        const withoutQuoted = text.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
        if (/;|--|\/\*|\$/.test(withoutQuoted) || /['"]/.test(withoutQuoted.replace(/''|""/g, ''))) {
            throw new Error(`${label} contains not allowed characters: ${text}`);
        }
        let depth = 0;
        for (const char of withoutQuoted) {
            depth += char === '(' ? 1 : char === ')' ? -1 : 0;
            if (depth < 0)
                break;
        }
        if (depth !== 0) {
            throw new Error(`${label} has unbalanced parentheses: ${text}`);
        }
        return text;
    }
}
exports.default = PostgresDdlBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNEZGxCdWlsZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc0RkbEJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFRQSxnRUFBd0M7QUFHeEM7Ozs7O0dBS0c7QUFDSCxNQUFNLGtCQUFrQjtJQUN0QixZQUE2QixPQUF3QjtRQUF4QixZQUFPLEdBQVAsT0FBTyxDQUFpQjtJQUNyRCxDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFxQixFQUFFLE1BQTJCO1FBQzVELE1BQU0sU0FBUyxHQUFHLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV0RCxRQUFRLE1BQU0sQ0FBQyxJQUFJLEVBQUU7WUFDbkIsS0FBSyxPQUFPO2dCQUNWLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlDLEtBQUssVUFBVTtnQkFDYixrREFBa0Q7Z0JBQ2xELE9BQU8sQ0FBQyxrQkFBa0IsU0FBUyxtQkFBbUIsQ0FBQyxDQUFDO1lBQzFELEtBQUssTUFBTSxDQUFDLENBQUM7Z0JBQ1gsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLE1BQU0sR0FBRyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDckgsT0FBTyxDQUFDLFFBQVEsTUFBTSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7YUFDeEM7WUFDRCxLQUFLLFFB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