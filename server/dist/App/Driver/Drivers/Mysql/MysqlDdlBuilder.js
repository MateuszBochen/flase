"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = require('mysql');
/** CURRENT_TIMESTAMP family is allowed without parentheses, also on older servers */
const TIMESTAMP_EXPRESSION = /^(current_timestamp|now|localtime|localtimestamp)(\(\s*\d*\s*\))?$/i;
/**
 * Builds DDL for MySQL / MariaDB. Names and values are escaped,
 * column type and default expression are written as they are - they are validated not to contain statement breaks.
 * @author Mateusz Bochen
 */
class MysqlDdlBuilder {
    /** copyColumns - columns copied with data, generated columns are left out */
    static build(table, change, copyColumns) {
        var _a;
        const tableName = MysqlDdlBuilder.tableName(table);
        switch (change.kind) {
            case 'alter':
                if (!((_a = change.operations) === null || _a === void 0 ? void 0 : _a.length)) {
                    throw new Error('Nothing to change');
                }
                return [`ALTER TABLE ${tableName}\n  ${change.operations.map(MysqlDdlBuilder.alterOperation).join(',\n  ')}`];
            case 'truncate':
                return [`TRUNCATE TABLE ${tableName}`];
            case 'drop':
                return [`DROP TABLE ${tableName}`];
            case 'rename':
                return [`RENAME TABLE ${tableName} TO ${MysqlDdlBuilder.tableName(Object.assign(Object.assign({}, table), { name: MysqlDdlBuilder.requireName(change.newName, 'New table name') }))}`];
            case 'copy': {
                const copy = MysqlDdlBuilder.tableName(Object.assign(Object.assign({}, table), { name: MysqlDdlBuilder.requireName(change.newName, 'New table name') }));
                const statements = [`CREATE TABLE ${copy} LIKE ${tableName}`];
                if (change.withData) {
                    const columns = (copyColumns === null || copyColumns === void 0 ? void 0 : copyColumns.length) ? mysql.escapeId(copyColumns) : null;
                    statements.push(columns
                        ? `INSERT INTO ${copy} (${columns}) SELECT ${columns} FROM ${tableName}`
                        : `INSERT INTO ${copy} SELECT * FROM ${tableName}`);
                }
                return statements;
            }
            default:
                throw new Error(`Unknown structure change ${change.kind}`);
        }
    }
    static alterOperation(operation) {
        var _a, _b;
        switch (operation.op) {
            case 'addColumn':
                return `ADD COLUMN ${MysqlDdlBuilder.columnDefinition(operation.column)}${MysqlDdlBuilder.position(operation.position)}`;
            case 'changeColumn':
                return `CHANGE COLUMN ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Column name'))} `
                    + `${MysqlDdlBuilder.columnDefinition(operation.column)}${MysqlDdlBuilder.position(operation.position)}`;
            case 'dropColumn':
                return `DROP COLUMN ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Column name'))}`;
            case 'addIndex': {
                if (!((_a = operation.columns) === null || _a === void 0 ? void 0 : _a.length)) {
                    throw new Error('Index needs at least one column');
                }
                const columns = operation.columns.map((column) => {
                    const length = column.length ? `(${MysqlDdlBuilder.positiveInteger(column.length, 'Index length')})` : '';
                    return `${mysql.escapeId(MysqlDdlBuilder.requireName(column.name, 'Index column'))}${length}`;
                }).join(', ');
                if (operation.kind === 'PRIMARY') {
                    return `ADD PRIMARY KEY (${columns})`;
                }
                const kind = { INDEX: 'INDEX', UNIQUE: 'UNIQUE INDEX', FULLTEXT: 'FULLTEXT INDEX' }[operation.kind];
                if (!kind) {
                    throw new Error(`Unknown index kind ${operation.kind}`);
                }
                const name = ((_b = operation.name) === null || _b === void 0 ? void 0 : _b.trim()) ? ` ${mysql.escapeId(operation.name.trim())}` : '';
                return `ADD ${kind}${name} (${columns})`;
            }
            case 'dropIndex':
                return operation.name === 'PRIMARY'
                    ? 'DROP PRIMARY KEY'
                    : `DROP INDEX ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Index name'))}`;
            default:
                throw new Error(`Unknown operation ${operation.op}`);
        }
    }
    static columnDefinition(column) {
        const parts = [
            mysql.escapeId(MysqlDdlBuilder.requireName(column === null || column === void 0 ? void 0 : column.name, 'Column name')),
            MysqlDdlBuilder.rawPart(column.type, 'Column type'),
        ];
        if (column.collation) {
            if (!/^[A-Za-z0-9_]+$/.test(column.collation)) {
                throw new Error(`Invalid collation ${column.collation}`);
            }
            parts.push(`COLLATE ${column.collation}`);
        }
        parts.push(column.nullable ? 'NULL' : 'NOT NULL');
        const defaultValue = column.defaultValue || { kind: 'none' };
        switch (defaultValue.kind) {
            case 'null':
                parts.push('DEFAULT NULL');
                break;
            case 'value':
                parts.push(`DEFAULT ${mysql.escape(defaultValue.value)}`);
                break;
            case 'expression': {
                const expression = MysqlDdlBuilder.rawPart(defaultValue.value, 'Default expression');
                // MySQL 8 / MariaDB need other expressions in parentheses
                parts.push(`DEFAULT ${TIMESTAMP_EXPRESSION.test(expression) ? expression : `(${expression})`}`);
                break;
            }
        }
        if (column.onUpdateCurrentTimestamp) {
            parts.push('ON UPDATE CURRENT_TIMESTAMP');
        }
        if (column.autoIncrement) {
            parts.push('AUTO_INCREMENT');
        }
        if (column.comment) {
            parts.push(`COMMENT ${mysql.escape(column.comment)}`);
        }
        return parts.join(' ');
    }
    static position(position) {
        if (!position || position.kind === 'end') {
            return '';
        }
        if (position.kind === 'first') {
            return ' FIRST';
        }
        return ` AFTER ${mysql.escapeId(MysqlDdlBuilder.requireName(position.column, 'Column'))}`;
    }
    static tableName(table) {
        return `${mysql.escapeId(MysqlDdlBuilder.requireName(table.databaseName, 'Database'))}.${mysql.escapeId(MysqlDdlBuilder.requireName(table.name, 'Table name'))}`;
    }
    static requireName(name, label) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error(`${label} is required`);
        }
        return name.trim();
    }
    static positiveInteger(value, label) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${label} must be positive number`);
        }
        return value;
    }
    /** type / expression is written into sql as it is - must stay one part of one statement */
    static rawPart(value, label) {
        const text = MysqlDdlBuilder.requireName(value, label);
        // strings in type (enum values) may contain anything, check only the rest
        const withoutStrings = text.replace(/'(?:[^'\\]|''|\\.)*'/g, "''");
        if (/[;`]|--|\/\*|#/.test(withoutStrings) || /'/.test(withoutStrings.replace(/''/g, ''))) {
            throw new Error(`${label} contains not allowed characters: ${text}`);
        }
        let depth = 0;
        for (const char of withoutStrings) {
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
exports.default = MysqlDdlBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxEZGxCdWlsZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbERkbEJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFPQSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFL0IscUZBQXFGO0FBQ3JGLE1BQU0sb0JBQW9CLEdBQUcscUVBQXFFLENBQUM7QUFFbkc7Ozs7R0FJRztBQUNILE1BQU0sZUFBZTtJQUVuQiw2RUFBNkU7SUFDN0UsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFxQixFQUFFLE1BQTJCLEVBQUUsV0FBc0I7O1FBQ3JGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkQsUUFBUSxNQUFNLENBQUMsSUFBSSxFQUFFO1lBQ25CLEtBQUssT0FBTztnQkFDVixJQUFJLENBQUMsQ0FBQSxNQUFBLE1BQU0sQ0FBQyxVQUFVLDBDQUFFLE1BQU0sQ0FBQSxFQUFFO29CQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7aUJBQ3RDO2dCQUNELE9BQU8sQ0FBQyxlQUFlLFNBQVMsT0FBTyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNoSCxLQUFLLFVBQVU7Z0JBQ2IsT0FBTyxDQUFDLGtCQUFrQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLEtBQUssTUFBTTtnQkFDVCxPQUFPLENBQUMsY0FBYyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3JDLEtBQUssUUFBUTtnQkFDWCxPQUFPLENBQUMsZ0JBQWdCLFNBQVMsT0FBTyxlQUFlLENBQUMsU0FBUyxpQ0FBSyxLQUFLLEtBQUUsSUFBSSxFQUFFLGVBQWUsQ0FB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