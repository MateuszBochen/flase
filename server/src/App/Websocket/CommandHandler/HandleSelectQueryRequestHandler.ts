import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryRequestDataInterface from '../../Connection/Interface/QueryRequestDataInterface';
import TotalCountInterface from '../../Driver/Interface/Data/TotalCountInterface';
import RowDto from '../../../Driver/Dto/RowDto';
import SingleSelectRecordInterface from '../../Driver/Interface/Data/SingleSelectRecordInterface';
import SingleSelectColumnInterface from '../../Driver/Interface/Data/SingleSelectColumnInterface';
import ColumnInterface from '../../Driver/Interface/Data/ColumnInterface';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';
import QueryFinishedInterface from '../../Driver/Interface/Data/QueryFinishedInterface';
import ResultFieldInterface from '../../Driver/Interface/Data/ResultFieldInterface';
import EditableResultInterface from '../../Driver/Interface/Data/EditableResultInterface';

/** key is `database.table` */
type TablesMetadata = Map<string, ColumnInterface[]>;

/**
 * command handler for select query request
 * Message order for client: total count -> columns -> records -> finished (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = async (data: QueryRequestDataInterface): Promise<void> => {
    let session: DriverSessionInterface;
    try {
      session = await this.driver.openSession(data.database.name);
    } catch (e) {
      this.sendError(e, data.tabId);
      return;
    }

    try {
      // table structure (types, primary keys, references) of tables used in query
      const metadata = await this.loadTablesMetadata(data);

      // count is queued on the same connection before select, so it does not slow down rows
      const counting = this.countRecords(session, data);
      const rows = await this.streamQueries(session, data, metadata);
      await counting;

      this.clientWebsocket.send<QueryFinishedInterface>(new WsMessage<QueryFinishedInterface>(
        this.command.connectionData.connection,
        MessageType.QUERY_FINISHED,
        {tabId: data.tabId, rows},
      ));
    } catch (e) {
      this.sendError(e, data.tabId);
    } finally {
      session.release();
    }
  }

  /** count failure is not fatal - the select itself reports the sql error */
  private countRecords = (session: DriverSessionInterface, data: QueryRequestDataInterface): Promise<void> => {
    return session.countRecords(data.query).then((totalCountDto) => {
      this.clientWebsocket.send<TotalCountInterface>(new WsMessage<TotalCountInterface>(
        this.command.connectionData.connection,
        MessageType.SELECT_TOTAL_COUNT,
        {
          tabId: data.tabId,
          totalCount: totalCountDto.totalCount,
        },
      ));
    }).catch((e) => {
      console.warn(HandleSelectQueryRequestHandler.name, 'countRecords', AbstractCommandHandler.errorToString(e));
    });
  }

  /** resolves with number of sent rows */
  private streamQueries = (session: DriverSessionInterface, data: QueryRequestDataInterface, metadata: TablesMetadata): Promise<number> => {
    let rows = 0;

    // columns are sent when the result description arrives, so they match the result exactly
    const onFields = (fields: ResultFieldInterface[]) => this.sendColumns(data, fields, metadata);

    return new Promise((resolve, reject) => {
      session.streamSelect(data.query, onFields).subscribe({
        next: (rowItem: RowDto) => {
          rows++;
          this.clientWebsocket.send<SingleSelectRecordInterface>(new WsMessage<SingleSelectRecordInterface>(
            this.command.connectionData.connection,
            MessageType.SINGLE_SELECT_RECORD,
            {
              tabId: data.tabId,
              rowDataValue: rowItem.row,
            },
          ));
        },
        error: reject,
        complete: () => resolve(rows),
      });
    });
  }

  /** metadata of tables used in FROM, missing when query is not parsable or table does not exist */
  private loadTablesMetadata = async (data: QueryRequestDataInterface): Promise<TablesMetadata> => {
    const metadata: TablesMetadata = new Map();

    let selectFromTypes;
    try {
      selectFromTypes = this.driver.getSelectFromTypeFromQuery(data.query).filter((selectFromType) => !!selectFromType.table);
    } catch (e) {
      console.warn(HandleSelectQueryRequestHandler.name, 'loadTablesMetadata', AbstractCommandHandler.errorToString(e));
      return metadata;
    }

    await Promise.all(selectFromTypes.map((selectFromType) => {
      const databaseName = selectFromType.db || data.database.name;
      return this.driver.getColumnsOfTable(databaseName, selectFromType)
        .then((columns) => metadata.set(`${databaseName}.${selectFromType.table}`, columns))
        // query itself will report missing table
        .catch(() => undefined);
    }));

    return metadata;
  }

  private sendColumns(data: QueryRequestDataInterface, fields: ResultFieldInterface[], metadata: TablesMetadata): void {
    const columns = fields.map((field) => {
      const tableColumn = field.orgTable
        ? metadata.get(`${field.db}.${field.orgTable}`)?.find((column) => column.name === field.orgName)
        : undefined;

      if (!tableColumn) {
        return HandleSelectQueryRequestHandler.expressionColumn(field);
      }

      return {...tableColumn, name: field.name, key: field.key, orgName: field.orgName, alias: field.table};
    });

    const {editable, readOnlyReason} = this.resolveEditable(data, columns, metadata);
    if (!editable) {
      columns.forEach((column) => column.editable = false);
    }

    this.clientWebsocket.send<SingleSelectColumnInterface>(new WsMessage<SingleSelectColumnInterface>(
      this.command.connectionData.connection,
      MessageType.SINGLE_SELECT_COLUMN,
      {
        tabId: data.tabId,
        columns,
        editable,
        readOnlyReason,
      },
    ));
  }

  /** rows are editable when they come from single table and the row can be identified */
  private resolveEditable(
    data: QueryRequestDataInterface,
    columns: ColumnInterface[],
    metadata: TablesMetadata,
  ): {editable: EditableResultInterface | null, readOnlyReason?: string} {
    const analysis = this.driver.getEditableTableOfQuery(data.query);
    if (!analysis.table) {
      return {editable: null, readOnlyReason: analysis.reason};
    }

    const databaseName = analysis.table.db || data.database.name;
    const tableColumns = metadata.get(`${databaseName}.${analysis.table.table}`);
    if (!tableColumns) {
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

export default HandleSelectQueryRequestHandler;
