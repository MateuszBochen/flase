import {Request, Response} from 'express';
import ConnectionRequestInterface from './App/Connection/Interface/ConnectionRequestInterface';
import {parseDsnOrThrow} from '@soluble/dsn-parser';
import DriverFactory from './App/Driver/DriverFactory';
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');


/** Server start here */
const app = express();

app.use(cors());
app.use(bodyParser.json());


const driverFactory = new DriverFactory();

app.post('/api/login', (req:Request, res:Response) => {
  const data = req.body as ConnectionRequestInterface;
  console.log(data);

  const parsedDsn = parseDsnOrThrow(data.connectionData.dsn);
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
