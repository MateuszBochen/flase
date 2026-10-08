import DriverInterface from '../../Driver/DriverInterface';
import ColumnInterface from '../../Driver/Interface/Data/ColumnInterface';
import ResultFieldInterface from '../../Driver/Interface/Data/ResultFieldInterface';
import EditableResultInterface from '../../Driver/Interface/Data/EditableResultInterface';

/** key is `database.table` */
type TablesMetadata = Map<string, ColumnInterface[]>;

export type ResultColumnsType = {
  columns: ColumnInterface[];
  editable: EditableResultInterface | null;
  readOnlyReason?: string;
};

/**
 * Columns of query result: description of result fields completed with structure of tables used in query
 * (types, primary keys, references) and with information whether rows can be edited.
 * @author Mateusz Bochen
 */
class ResultColumnsBuilder {
  private metadata: TablesMetadata = new Map();

  constructor(
    private readonly driver: DriverInterface,
    /** database selected for the query - tables without database belong to it */
    private readonly databaseName: string | null,
    private readonly query: string,
  ) {
  }

  /** structure of tables used in FROM, missing when query is not parsable or table does not exist */
  async loadMetadata(): Promise<void> {
    let selectFromTypes;
    try {
      selectFromTypes = this.driver.getSelectFromTypeFromQuery(this.query).filter((selectFromType) => !!selectFromType.table);
    } catch (e) {
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
  build(fields: ResultFieldInterface[], withEditable: boolean = true): ResultColumnsType {
    const columns = fields.map((field) => {
      const tableColumn = field.orgTable
        ? this.metadata.get(`${field.db}.${field.orgTable}`)?.find((column) => column.name === field.orgName)
        : undefined;

      if (!tableColumn) {
        return ResultColumnsBuilder.expressionColumn(field);
      }

      return {...tableColumn, name: field.name, key: field.key, orgName: field.orgName, alias: field.table};
    });

    const {editable, readOnlyReason} = withEditable
      ? this.resolveEditable(columns)
      : {editable: null, readOnlyReason: 'Results of SQL console are read only'};
    if (!editable) {
      columns.forEach((column) => column.editable = false);
    }

    return {columns, editable, readOnlyReason};
  }

  /** rows are editable when they come from single table and the row can be identified */
  private resolveEditable(columns: ColumnInterface[]): {editable: EditableResultInterface | null, readOnlyReason?: string} {
    const analysis = this.driver.getEditableTableOfQuery(this.query);
    if (!analysis.table) {
      return {editable: null, readOnlyReason: analysis.reason};
    }

    const databaseName = analysis.table.db || this.databaseName;
    const tableColumns = databaseName ? this.metadata.get(`${databaseName}.${analysis.table.table}`) : undefined;
    if (!databaseName || !tableColumns) {
      return {editable: null, readOnlyReason: 'Table structure is unknown'};
    }

    const primaryKey = tableColumns.filter((column) => column.primaryKey);
    const primaryKeyInResult = primaryKey.map((keyColumn) => {
      return columns.find((column) => column.orgName === keyColumn.name && column.table.name === analysis.table!.table)?.key;
    });

    if (primaryKeyInResult.some((name) => name === undefined)) {
      return {
        editable: null,
        readOnlyReason: `Select primary key column (${primaryKey.map((column) => column.name).join(', ')}) to edit rows`,
      };
    }

    return {
      editable: {
        table: {databaseName, name: analysis.table.table},
        primaryKey: primaryKeyInResult as string[],
      },
    };
  }

  /** column which is not a table column - expression, function, alias of sub query */
  private static expressionColumn(field: ResultFieldInterface): ColumnInterface {
    return {
      table: {databaseName: field.db, name: field.orgTable, alias: field.table},
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

export default ResultColumnsBuilder;
