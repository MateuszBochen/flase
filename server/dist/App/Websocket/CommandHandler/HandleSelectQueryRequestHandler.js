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
                // first count the records
                this.countRecords(data.query);
                // send info about columns of table
                this.sendColumnsFromSelect(data.query);
                // return records
                this.streamQueries(data.query);
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
            this.driver.countRecords(query).then((totalCountDto) => {
                // dispatch information about query total records
                const message = new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SELECT_TOTAL_COUNT, {
                    tabId: this.command.payload.tabId,
                    totalCount: totalCountDto.totalCount,
                });
                this.clientWebsocket.send(message);
            });
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
            try {
                selectFromTypes = this.driver.getSelectFromTypeFromQuery(query);
            }
            catch (e) {
                console.error(HandleSelectQueryRequestHandler.name, 'sendColumnsFromSelect', e);
                return;
            }
            selectFromTypes.forEach((selectFromType) => {
                this.driver.getColumnsOfTable(selectFromType.db || this.command.payload.database.name, selectFromType)
                    .then((listOfColumnTypes) => {
                    const payload = {
                        tabId: this.command.payload.tabId,
                        columns: listOfColumnTypes,
                    };
                    const message = new WsMessage_1.default(this.command.connectionData.connection, MessageType_1.default.SINGLE_SELECT_COLUMN, payload);
                    this.clientWebsocket.send(message);
                });
            });
        };
    }
}
exports.default = HandleSelectQueryRequestHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGFuZGxlU2VsZWN0UXVlcnlSZXF1ZXN0SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BcHAvV2Vic29ja2V0L0NvbW1hbmRIYW5kbGVyL0hhbmRsZVNlbGVjdFF1ZXJ5UmVxdWVzdEhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzRkFBOEQ7QUFFOUQsaUVBQXlDO0FBQ3pDLHNFQUE4QztBQVM5Qzs7O0dBR0c7QUFDSCxNQUFNLCtCQUFnQyxTQUFRLGdDQUFpRDtJQUEvRjs7UUFFRSxXQUFNLEdBQUcsQ0FBQyxJQUErQixFQUFRLEVBQUU7WUFFakQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUN2RCwwQkFBMEI7Z0JBQzFCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUU5QixtQ0FBbUM7Z0JBQ25DLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRXZDLGlCQUFpQjtnQkFDakIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFakMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDWixPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDM0MsQ0FBQyxDQUFDLENBQUM7WUFFSDs7Ozs7OztxQ0FPeUI7UUFDM0IsQ0FBQyxDQUFBO1FBR08saUJBQVksR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQ3ZDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQTRCLEVBQUUsRUFBRTtnQkFDcEUsaURBQWlEO2dCQUNqRCxNQUFNLE9BQU8sR0FB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