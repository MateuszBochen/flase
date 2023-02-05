import ColumnType from '../Driver/Type/Data/ColumnType';

const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const WebSocketClient = require('../WebSocketClient');
import DriverInterface from '../Driver/DriverInterface';
import TotalCountDto from '../Driver/Dto/TotalCountDto';
import {ACTIONS} from '../Server/ActionEnum';
import RowDto from '../Driver/Dto/RowDto';

class Select {
  webSocketClient: typeof WebSocketClient;
  tabIndex: string;

  constructor(databaseName:string, query:string, driver: DriverInterface, webSocketClient: typeof WebSocketClient, tabIndex:string)
  {
    this.webSocketClient = webSocketClient;
    this.tabIndex = tabIndex;

    driver.selectDatabase(databaseName)
      .then(() => {
        driver.countRecords(query).then((totalCountDto) => {
          this.sendTotalCount(totalCountDto);
        });

        const selectFromTypes = driver.getSelectFromTypeFromQuery(query);

        selectFromTypes.forEach((selectFromType) => {
          driver.getColumnsOfTable(databaseName, selectFromType).then((listOfColumnTypes) => {
            this.sendColumns(listOfColumnTypes);
          });
        });

        driver.streamSelect(query).subscribe((subscriber) => {
          this.sendDataRow(subscriber);
        });
      });
  }

  private sendTotalCount(totalCount: TotalCountDto): void {
    this.webSocketClient
      .sendMessage(new WebSocketOutMessage(
        ACTIONS.SOCKET_SET_SELECT_QUERY_TOTAL_ROWS,
        200,
        null,
        {
          tabIndex: this.tabIndex,
          totalRows: totalCount.totalCount,
        }
      )
    );
  }

  private sendColumns(columns: ColumnType[]): void {
    const message = new WebSocketOutMessage(
      ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS,
      200,
      null,
      {
        tabIndex: this.tabIndex,
        columns: columns,
      }
    );

    this.webSocketClient
      .sendMessage(message);
  }

  sendDataRow = (row:RowDto) => {
    const message = new WebSocketOutMessage(
      ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW,
      200,
      null,
      {
        tabIndex: this.tabIndex,
        row: row.row,
      }
    );

    this.webSocketClient
      .sendMessage(message);
  }
}

export default Select;
