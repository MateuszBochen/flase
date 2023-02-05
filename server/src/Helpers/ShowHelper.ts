import ColumnType from '../Driver/Type/Data/ColumnType';
const WebSocketOutMessage = require('../Server/WebSocketOutMessage');
const SqlClient = require('../SqlClient');
const WebSocketClient = require('../WebSocketClient');
import { ACTIONS } from '../Server/ActionEnum';


class ShowHelper {
    query;
    sqlClient;
    webSocketClient;
    tabIndex;
    columns:Array<ColumnType> = [];

    constructor(query:string, sqlClient: typeof SqlClient, webSocketClient: typeof WebSocketClient, tabIndex:string) {
        this.sqlClient = sqlClient;
        this.webSocketClient = webSocketClient;
        this.query = query;
        this.tabIndex = tabIndex;

        this.sqlClient
            .streamQueryResults(
                this.query,
                this.fetchData,
                (row:any) => console.log(row),
            );
    }

    fetchData = (row:any) => {
        console.log("sendDataRow fetching data");
        if (!this.columns.length) {
            console.log("sendDataRow fetching columns");
            this.getColumnsFromSelectRecord(row);
        }

        // this.sendDataRow(row);
    }

    getColumnsFromSelectRecord = (row:any) => {

        const columns = Object.keys(row);

        columns.forEach((column) => {
            const columnType: ColumnType = {
                table: {databaseName: '', name: '', alias: ''},
                autoIncrement: false,
                defaultValue: false,
                name: column,
                nullable: false,
                primaryKey: false,
                referenceColumn: '',
                referenceTable: '',
            }
            this.columns.push(columnType);
        });

        console.log(this.columns);
    }

    sendColumns = () => {
        const message = new WebSocketOutMessage(
            ACTIONS.SOCKET_SET_SELECT_QUERY_COLUMNS,
            200,
            null,
            {
                tabIndex: this.tabIndex,
                columns: this.columns,
            }
        );

        this.webSocketClient
            .sendMessage(message);
    };

}

export default ShowHelper;
