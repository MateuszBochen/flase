import {ACTIONS} from '../Server/ActionEnum';
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const WebSocketClient = require('../WebSocketClient');
import DriverInterface from '../Driver/DriverInterface';
import UpdateResultType from '../Driver/Type/UpdateResultType';


class Update {
  tabIndex:string;
  webSocketClient:typeof WebSocketClient;

  constructor(databaseName:string, query:string, driver: DriverInterface, webSocketClient: typeof WebSocketClient, tabIndex:string) {
    this.tabIndex = tabIndex;
    this.webSocketClient = webSocketClient;
    driver.selectDatabase(databaseName)
      .then(() => {
        driver.updateQuery(query).then((message) => {
          this.sendOk(message);
        })
          .catch((error) => {
          this.sendNotOk(error);
        });
      })
      .catch((error) => {
        this.sendNotOk(error);
      });
  }


  private sendOk = (updateResult: UpdateResultType) => {
    const message = new WebSocketOutMessage(
      ACTIONS.SOCKET_UPDATE_QUERY,
      200,
      null,
      {
        tabIndex: this.tabIndex,
        message: updateResult.message,
      }
    );

    this.webSocketClient
      .sendMessage(message);
  }

  private sendNotOk = (error:any) => {
    const message = new WebSocketOutMessage(
      ACTIONS.SOCKET_UPDATE_QUERY,
      506,
      null,
      {
        tabIndex: this.tabIndex,
        error: error,
      }
    );

    this.webSocketClient
      .sendMessage(message);
  }
}

export default Update;
