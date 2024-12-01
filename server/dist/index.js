"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
/** Server start here */
const app = express();
/** enable websocket */
require('express-ws')(app);
app.use(cors());
app.use(bodyParser.json());
/**
 * list of all connection
 * Is a key value list where key is a jwt token and value is driver interface - which is a db connection
 */
const connections = {};
/**
 * login and Establish connection with db
 * @author Mateusz Bochen
 */
app.post('/api/login', (req, res) => {
    const data = req.body;
    const connector = new EstablishConnection_1.default();
    connector.connect(data).then((response) => {
        if (response.driver && response.userData) {
            connections[response.userData.token] = response.driver;
            res.send(response.userData);
            res.end();
        }
        else {
            console.log('login fail');
            res.status(401);
            res.send(response.userData);
            res.end();
        }
    }).catch((reason) => {
        console.log('login fail');
        res.status(401);
        res.send(reason.userData);
        res.end();
    });
});
/** handle disconnect request */
app.post('/api/disconnect', (req, res) => {
    const data = req.body;
    delete connections[data.token];
    res.send('ok');
    res.end();
});
app.ws('/ws/:token', (ws, req) => {
    console.info("New connection has opened d!", req.params.token);
    if (connections[req.params.token]) {
        console.info('Connection exist. Ok');
        ws.send('OK');
    }
    else {
        console.error('Connection not exist on server side. Close connection');
        ws.close(1008, 'Connection not exist on server side. Close connection');
    }
});
app.listen(3001, () => {
    console.log('Example app listening on port 3001!');
});
/** just print connection */
setInterval(() => {
    console.log(connections);
}, 1000 * 60);
/*
import {Request, Response} from 'express';
import MysqlAdapter from './Driver/Drivers/Mysql/MysqlAdapter';
import ConnectionDataType from './Driver/Type/ConnectionDataType';
import DriverInterface from './Driver/DriverInterface';

const express = require('express');
const app = express();
const mysql = require('mysql');
const cors = require('cors');
const bodyParser = require('body-parser')
const uuid = require('uuid');
const WebSocketOutMessage = require("./Server/WebSocketOutMessage");
const WebSocketInMessage = require("./Server/WebSocketInMessage");
const {ACTIONS} = require("./Server/ActionEnum");
const Application = require('./Application');
require('express-ws')(app);

app.use(cors());
app.use(bodyParser.json());

interface IConnection {
    [key:string]: DriverInterface
}

const connections: IConnection = {};
const driverName = 'mysql';

const driverFactory = new DriverFactory();

app.post('/api/login', (req:Request, res:Response) => {
    const {  host, login, password } = req.body;

    const loginData: ConnectionDataType = {
        password,
        user: login,
        host,
    }

    const driver = driverFactory.getDriver(driverName, loginData);

    driver.connect().then(() => {
        const token = uuid.v4();
        connections[token] = driver;
        res.send({'token': token});
    }).catch((error) => {
        console.log(401);
        console.log(error);
        res.status(401);
        res.send('invalid credentials');
        res.end();
    });
});

app.ws('/ws/:token', (ws:WebSocket, req: Request) => {
    console.log("New connection has opened!", req.params.token);

    try {
        if (!connections[req.params.token]) {
            const message = new WebSocketOutMessage(ACTIONS.LOGOUT, 401, 'connection token not found', []);
            ws.send(JSON.stringify(message));
            console.log('socket not found in connection list', req.params.token);
        } else {
            console.log('socket ok1', req.params.token);
            const application = new Application(connections[req.params.token], ws);
            const messageIn = new WebSocketInMessage(ACTIONS.DATABASE_LIST, []);
            application.dispatchAction(messageIn);
        }
    } catch (e) {
        console.log(e);
    }
});

app.listen(3001, () => {
    console.log('Example app listening on port 3001!');
});


*/
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHQSwrRkFBdUU7QUFHdkUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMxQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFJN0Isd0JBQXdCO0FBQ3hCLE1BQU0sR0FBRyxHQUFHLE9BQU8sRUFBRSxDQUFDO0FBRXRCLHVCQUF1QjtBQUN2QixPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFFM0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2hCLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFLM0I7OztHQUdHO0FBQ0gsTUFBTSxXQUFXLEdBQW9DLEVBQUUsQ0FBQztBQUl4RDs7O0dBR0c7QUFDSCxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQVcsRUFBRSxHQUFZLEVBQUUsRUFBRTtJQUNuRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBa0MsQ0FBQztJQUNwRCxNQUFNLFNBQVMsR0FBRyxJQUFJLDZCQUFtQixFQUFFLENBQUM7SUFDNUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUE0QyxFQUFFLEVBQUU7UUFDNUUsSUFBSSxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxRQUFRLEVBQUU7WUFDeEMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUN2RCxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QixHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7U0FDWDthQUFNO1lBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMxQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVCLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztTQUNYO0lBQ0gsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBMEMsRUFBRSxFQUFFO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQixHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxQixHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDWixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDO0FBRUgsZ0NBQWdDO0FBQ2hDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxHQUFXLEVBQUUsR0FBWSxFQUFFLEVBQUU7SUFDeEQsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQXVCLENBQUM7SUFDekMsT0FBTyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZixHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDWixDQUFDLENBQUMsQ0FBQztBQUdILEdBQUcsQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBWSxFQUFFLEdBQVksRUFBRSxFQUFFO0lBQ2xELE9BQU8sQ0FBQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvRCxJQUFJLFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNyQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2Y7U0FBTTtRQUNMLE9BQU8sQ0FBQyxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztRQUN2RSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSx1REFBdUQsQ0FBQyxDQUFDO0tBQ3pFO0FBRUgsQ0FBQyxDQUFDLENBQUM7QUFFSCxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7SUFDcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0FBQ3JELENBQUMsQ0FBQyxDQUFDO0FBR0gsNEJBQTRCO0FBQzVCLFdBQVcsQ0FBQyxHQUFHLEVBQUU7SUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQzNCLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFHZDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBOEVFIn0=