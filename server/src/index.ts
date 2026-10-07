import {Request, Response} from 'express';
import ConnectionRequestInterface from './App/Connection/Interface/ConnectionRequestInterface';
import DriverInterface from './App/Driver/DriverInterface';
import EstablishConnection from './App/Connection/EstablishConnection';
import EstablishConnectionResultInterface from './App/Connection/Interface/EstablishConnectionResultInterface';
import EstablishedUser from './App/Connection/Interface/EstablishedUser';
import WebsocketRequest from './App/Websocket/WebsocketRequest';
import JWT from './App/JWT/JWT';
import Settings from './App/Settings/Settings';
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
const connections: {[key:string]: DriverInterface} = {};

/** number of open websockets per token, database connections are released when it drops to 0 */
const openWebsockets: {[key:string]: number} = {};
const releaseTimers: {[key:string]: ReturnType<typeof setTimeout>} = {};

const cancelRelease = (token: string) => {
  clearTimeout(releaseTimers[token]);
  delete releaseTimers[token];
};

/** close database connections when no websocket of this login is open for a while */
const scheduleRelease = (token: string) => {
  cancelRelease(token);
  releaseTimers[token] = setTimeout(() => {
    delete releaseTimers[token];
    if (!openWebsockets[token]) {
      connections[token]?.releaseConnections();
    }
  }, Settings.getIdleConnectionReleaseMs());
};

const closeConnection = (token: string) => {
  cancelRelease(token);
  delete openWebsockets[token];
  if (connections[token]) {
    connections[token].disconnect();
    delete connections[token];
  }
};



/**
 * login and Establish connection with db
 * @author Mateusz Bochen
 */
app.post('/api/login', (req:Request, res:Response) => {
  const validationError = EstablishConnection.validate(req.body);
  if (validationError) {
    res.status(400).send({error: validationError});
    return;
  }

  const data = req.body as ConnectionRequestInterface;
  const connector = new EstablishConnection();
  connector.connect(data).then((response: EstablishConnectionResultInterface) => {
    if (response.driver && response.userData) {
      connections[response.userData.token] = response.driver;
      // released if client never opens websocket
      scheduleRelease(response.userData.token);
      res.send(response.userData);
    } else {
      console.log('login fail', response.error);
      res.status(401).send({error: response.error});
    }
  });
});

/** handle disconnect request */
app.post('/api/disconnect', (req:Request, res:Response) => {
  const data = req.body as EstablishedUser;
  if (typeof data?.token === 'string') {
    closeConnection(data.token);
  }
  res.send('ok');
});


app.ws('/ws/:token', (ws:WebSocket, req: Request) => {
  const token = req.params.token;

  if (!connections[token]) {
    console.error('Connection not exist on server side. Close connection');
    ws.close(1008, 'Connection not exist on server side. Close connection');
    return;
  }

  if (!JWT.verify(token)) {
    console.error('Token expired or invalid. Close connection');
    closeConnection(token);
    ws.close(1008, 'Token expired or invalid');
    return;
  }

  console.info('New websocket connection');
  cancelRelease(token);
  openWebsockets[token] = (openWebsockets[token] || 0) + 1;

  // browser tab closed - keep login, but do not hold database connections
  ws.addEventListener('close', () => {
    openWebsockets[token] = Math.max(0, (openWebsockets[token] || 1) - 1);
    if (openWebsockets[token] === 0 && connections[token]) {
      scheduleRelease(token);
    }
  });

  new WebsocketRequest(connections[token], ws).procedure();
});

app.listen(3001, () => {
  console.log('Example app listening on port 3001!');
});


/** close database connections of expired tokens */
setInterval(() => {
  Object.keys(connections)
    .filter((token) => !JWT.verify(token))
    .forEach((token) => closeConnection(token));

  console.log(`Active connections: ${Object.keys(connections).length}`);
}, 1000 * 60);
