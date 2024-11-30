"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dsn_parser_1 = require("@soluble/dsn-parser");
const DriverFactory_1 = __importDefault(require("./App/Driver/DriverFactory"));
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
/** Server start here */
const app = express();
app.use(cors());
app.use(bodyParser.json());
const driverFactory = new DriverFactory_1.default();
app.post('/api/login', (req, res) => {
    const data = req.body;
    console.log(data);
    const parsedDsn = dsn_parser_1.parseDsnOrThrow(data.connectionData.dsn);
    console.log(parsedDsn);
    const driver = driverFactory.getDriver(parsedDsn.driver, data);
    driver.connect().then(() => {
        console.log('login ok');
        res.send('ok');
    }).catch(() => {
        console.log('login fail');
        res.status(401);
        res.send('invalid credentials');
        res.end();
    });
    /*const {  host, login, password } = req.body;
  
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
    });*/
});
app.listen(3001, () => {
    console.log('Example app listening on port 3001!');
});
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSxvREFBb0Q7QUFDcEQsK0VBQXVEO0FBQ3ZELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNuQyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDMUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRzdCLHdCQUF3QjtBQUN4QixNQUFNLEdBQUcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUV0QixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDaEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUczQixNQUFNLGFBQWEsR0FBRyxJQUFJLHVCQUFhLEVBQUUsQ0FBQztBQUUxQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQVcsRUFBRSxHQUFZLEVBQUUsRUFBRTtJQUNuRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsSUFBa0MsQ0FBQztJQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWxCLE1BQU0sU0FBUyxHQUFHLDRCQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzRCxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRXZCLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUUvRCxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtRQUN6QixPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNaLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQixHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDaEMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ1osQ0FBQyxDQUFDLENBQUM7SUFJSDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FvQks7QUFDUCxDQUFDLENBQUMsQ0FBQztBQUdILEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtJQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7QUFDckQsQ0FBQyxDQUFDLENBQUM7QUFJSDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBOEVFIn0=