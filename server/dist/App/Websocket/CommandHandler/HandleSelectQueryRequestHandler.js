"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractCommandHandler_1 = __importDefault(require("./AbstractCommandHandler"));
const WsMessage_1 = __importDefault(require("../Dto/WsMessage"));
const MessageType_1 = __importDefault(require("../Enum/MessageType"));
/**
 * command handler for select query request
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler_1.default {
    constructor() {
        super(...arguments);
        this.handle = (data) => {
            this.driver.selectDatabase(data.database.name).then(() => {
                // send info about columns of table
                this.sendColumnsFromSelect(data.query).then(() => {
                    // first count the records
                    this.countRecords(data.query);
                    // return records
                    this.streamQueries(data.query);
                }).catch((e) => {
                    console.error(e);
                });
            }).catch(() => {
                console.log('unable to switch database');
            });
            /*this.driver.getListOfDatabases().subscribe((databaseItem: DatabaseInterface) => {
              this.clientWebsocket.send<DatabaseInterface>(new WsMessage<DatabaseInterface>(
                this.command.connectionData.connection,
                MessageType.DATABASE_BASE_ITEM,
                databaseItem,
              ));
            });
            console.log('handled');*/
        };
        this.countRecords = (query) => {
            try {
                this.driver.countRecords(query).then((totalCountDto) => {
                    // dispatch information about query total records
                    const message = new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SELECT_TOTAL_COUNT, {
                        tabId: this.command.payload.tabId,
                        totalCount: totalCountDto.totalCount,
                    });
                    this.clientWebsocket.send(message);
                });
            }
            catch (e) {
                console.error(HandleSelectQueryRequestHandler.name, 'countRecords', e);
            }
        };
        this.streamQueries = (query) => {
            this.driver.streamSelect(query).subscribe((rowItem) => {
                const message = new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_RECORD, {
                    tabId: this.command.payload.tabId,
                    rowDataValue: rowItem.row,
                });
                this.clientWebsocket.send(message);
            });
        };
        /** to test maybe will be done on front */
        this.sendColumnsFromSelect = (query) => {
            let selectFromTypes = [];
            return new Promise((resolve, reject) => {
                try {
                    selectFromTypes = this.driver.getSelectFromTypeFromQuery(query);
                }
                catch (e) {
                    console.error(HandleSelectQueryRequestHandler.name, 'sendColumnsFromSelect', e);
                    reject();
                    return;
                }
                if (!selectFromTypes) {
                    console.error(HandleSelectQueryRequestHandler.name, 'Where exception?');
                    reject();
                    return;
                }
                selectFromTypes.forEach((selectFromType, index, array) => {
                    this.driver.getColumnsOfTable(selectFromType.db || this.command.payload.database.name, selectFromType)
                        .then((listOfColumnTypes) => {
                        const payload = {
                            tabId: this.command.payload.tabId,
                            columns: listOfColumnTypes,
                        };
                        const message = new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_COLUMN, payload);
                        this.clientWebsocket.send(message);
                        if (index === array.length - 1) {
                            resolve();
                        }
                    });
                });
            });
        };
    }
}
exports.default = HandleSelectQueryRequestHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFFOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVM5Qzs7O0dBR0c7QUFDSCxNQUFNLCtCQUFnQyxTQUFRLGdDQUFpRDtJQUEvRjs7UUFFRSxXQUFNLEdBQUcsQ0FBQyxJQUErQixFQUFRLEVBQUU7WUFDakQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUV2RCxtQ0FBbUM7Z0JBQ25DLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFFL0MsMEJBQTBCO29CQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFOUIsaUJBQWlCO29CQUNqQixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFFakMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7b0JBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbkIsQ0FBQyxDQUFDLENBQUM7WUFFTCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFO2dCQUNaLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUMzQyxDQUFDLENBQUMsQ0FBQztZQUVIOzs7Ozs7O3FDQU95QjtRQUMzQixDQUFDLENBQUE7UUFHTyxpQkFBWSxHQUFHLENB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