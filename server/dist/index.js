"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const WebsocketRequest_1 = __importDefault(require("./App/Websocket/WebsocketRequest"));
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
        const command = req.body;
        new WebsocketRequest_1.default(connections[req.params.token], ws).procedure();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHQSwrRkFBdUU7QUFJdkUsd0ZBQWdFO0FBQ2hFLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNuQyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDMUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBSTdCLHdCQUF3QjtBQUN4QixNQUFNLEdBQUcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUV0Qix1QkFBdUI7QUFDdkIsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRTNCLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUNoQixHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBSzNCOzs7R0FHRztBQUNILE1BQU0sV0FBVyxHQUFvQyxFQUFFLENBQUM7QUFJeEQ7OztHQUdHO0FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFXLEVBQUUsR0FBWSxFQUFFLEVBQUU7SUFDbkQsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQWtDLENBQUM7SUFDcEQsTUFBTSxTQUFTLEdBQUcsSUFBSSw2QkFBbUIsRUFBRSxDQUFDO0lBQzVDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBNEMsRUFBRSxFQUFFO1FBQzVFLElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQ3hDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDdkQsR0FBRyxDQUFDLElBQUks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