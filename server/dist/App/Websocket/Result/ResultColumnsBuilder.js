"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Columns of query result: description of result fields completed with structure of tables used in query
 * (types, primary keys, references) and with information whether rows can be edited.
 * @author Mateusz Bochen
 */
class ResultColumnsBuilder {
    constructor(driver, 
    /** database selected for the query - tables without database belong to it */
    databaseName, query) {
        this.driver = driver;
        this.databaseName = databaseName;
        this.query = query;
        this.metadata = new Map();
    }
    /** structure of tables used in FROM, missing when query is not parsable or table does not exist */
    async loadMetadata() {
        let selectFromTypes;
        try {
            selectFromTypes = this.driver.getSelectFromTypeFromQuery(this.query).filter((selectFromType) => !!selectFromType.table);
        }
        catch (e) {
            return;
        }
        await Promise.all(selectFromTypes.map((selectFromType) => {
            const databaseName = selectFromType.db || this.databaseName;
            if (!databaseName) {
                return Promise.resolve();
            }
            return this.driver.getColumnsOfTable(databaseName, selectFromType)
                .then((columns) => {
                this.metadata.set(`${databaseName}.${selectFromType.table}`, columns);
            })
                // query itself will report missing table
                .catch(() => undefined);
        }));
    }
    /** withEditable - false: result is always read only (e.g. SQL console) */
    build(fields, withEditable = true) {
        const columns = fields.map((field) => {
            var _a;
            const tableColumn = field.orgTable
                ? (_a = this.metadata.get(`${field.db}.${field.orgTable}`)) === null || _a === void 0 ? void 0 : _a.find((column) => column.name === field.orgName)
                : undefined;
            if (!tableColumn) {
                return ResultColumnsBuilder.expressionColumn(field);
            }
            return Object.assign(Object.assign({}, tableColumn), { name: field.name, key: field.key, orgName: field.orgName, alias: field.table });
        });
        const { editable, readOnlyReason } = withEditable
            ? this.resolveEditable(columns)
            : { editable: null, readOnlyReason: 'Results of SQL console are read only' };
        if (!editable) {
            columns.forEach((column) => column.editable = false);
        }
        return { columns, editable, readOnlyReason };
    }
    /** rows are editable when they come from single table and the row can be identified */
    resolveEditable(columns) {
        const analysis = this.driver.getEditableTableOfQuery(this.query);
        if (!analysis.table) {
            return { editable: null, readOnlyReason: analysis.reason };
        }
        const databaseName = analysis.table.db || this.databaseName;
        const tableColumns = databaseName ? this.metadata.get(`${databaseName}.${analysis.table.table}`) : undefined;
        if (!databaseName || !tableColumns) {
            return { editable: null, readOnlyReason: 'Table structure is unknown' };
        }
        const primaryKey = tableColumns.filter((column) => column.primaryKey);
        const primaryKeyInResult = primaryKey.map((keyColumn) => {
            var _a;
            return (_a = columns.find((column) => column.orgName === keyColumn.name && column.table.name === analysis.table.table)) === null || _a === void 0 ? void 0 : _a.key;
        });
        if (primaryKeyInResult.some((name) => name === undefined)) {
            return {
                editable: null,
                readOnlyReason: `Select primary key column (${primaryKey.map((column) => column.name).join(', ')}) to edit rows`,
            };
        }
        return {
            editable: {
                table: { databaseName, name: analysis.table.table },
                primaryKey: primaryKeyInResult,
            },
        };
    }
    /** column which is not a table column - expression, function, alias of sub query */
    static expressionColumn(field) {
        return {
            table: { databaseName: field.db, name: field.orgTable, alias: field.table },
            alias: field.table,
            autoIncrement: false,
            defaultValue: null,
            name: field.name,
            key: field.key,
            orgName: field.orgName,
            editable: false,
            nullable: true,
            primaryKey: false,
        };
    }
}
exports.default = ResultColumnsBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUmVzdWx0Q29sdW1uc0J1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL1dlYnNvY2tldC9SZXN1bHQvUmVzdWx0Q29sdW1uc0J1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFjQTs7OztHQUlHO0FBQ0gsTUFBTSxvQkFBb0I7SUFHeEIsWUFDbUIsTUFBdUI7SUFDeEMsNkVBQTZFO0lBQzVELFlBQTJCLEVBQzNCLEtBQWE7UUFIYixXQUFNLEdBQU4sTUFBTSxDQUFpQjtRQUV2QixpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUMzQixVQUFLLEdBQUwsS0FBSyxDQUFRO1FBTnhCLGFBQVEsR0FBbUIsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQVE3QyxDQUFDO0lBRUQsbUdBQW1HO0lBQ25HLEtBQUssQ0FBQyxZQUFZO1FBQ2hCLElBQUksZUFBZSxDQUFDO1FBQ3BCLElBQUk7WUFDRixlQUFlLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3pIO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixPQUFPO1NBQ1I7UUFFRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDLGNBQWMsRUFBRSxFQUFFO1lBQ3ZELE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxFQUFFLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQztZQUM1RCxJQUFJLENBQUMsWUFBWSxFQUFFO2dCQUNqQixPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQzthQUMxQjtZQUNELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDO2lCQUMvRCxJQUFJLENBQUMs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