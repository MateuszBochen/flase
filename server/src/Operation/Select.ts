import ColumnType from '../Driver/Type/Data/ColumnType';

const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const WebSocketClient = require('../WebSocketClient');
import DriverInterface from '../Driver/DriverInterface';
import TotalCountDto from '../Driver/Dto/TotalCountDto';
import {ACTIONS} from '../Server/ActionEnum';
import RowDto from '../Driver/Dto/RowDto';
import SelectFromType from '../Driver/Type/Data/SelectFromType';

class Select {
  webSocketClient: typeof WebSocketClient;
  tabIndex: string;

  constructor(databaseName:string, query:string, driver: DriverInterface, webSocketClient: typeof WebSocketClient, tabIndex:string)
  {
    this.webSocketClient = webSocketClient;
    this.tabIndex = tabIndex;

    driver.selectDatabase(databaseName)
      .then(() => {
        try {
          driver.countRecords(query)
            .then((totalCountDto) => {
              this.sendTotalCount(totalCountDto);
          }).catch((e) => {
            this.sendError(e.message);
          });

        } catch (e) {
          this.sendError(e.message);
          return;
        }

        let selectFromTypes:SelectFromType[] = [];
        try {
          selectFromTypes = driver.getSelectFromTypeFromQuery(query);
        } catch (e) {
          this.sendError(e.message);
          return;
        }

        selectFromTypes.forEach((selectFromType) => {
          driver.getColumnsOfTable(databaseName, selectFromType).then((listOfColumnTypes) => {
            this.sendColumns(listOfColumnTypes);
          });
        });

        driver.streamSelect(query).subscribe((subscriber) => {
          this.sendDataRow(subscriber);
        });
      })
      .catch((e) => {
        this.sendError(e.message);
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

  sendError = (e:any) => {
    const message = new WebSocketOutMessage(
      ACTIONS.SOCKET_SET_SELECT_QUERY_APPEND_DATA_ROW,
      406,
      null,
      {
        tabIndex: this.tabIndex,
        error: e,
      }
    );

    this.webSocketClient
      .sendMessage(message);
  }
}

export default Select;
