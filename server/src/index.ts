import {Request, Response} from 'express';
import ConnectionRequestInterface from './App/Connection/Interface/ConnectionRequestInterface';
import EstablishConnection from './App/Connection/EstablishConnection';
import EstablishConnectionResultInterface from './App/Connection/Interface/EstablishConnectionResultInterface';
import EstablishedUser from './App/Connection/Interface/EstablishedUser';
import WebsocketRequest from './App/Websocket/WebsocketRequest';
import SessionStore from './App/Session/SessionStore';
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

/**
 * websocket close code when session does not exist or token expired.
 * Client must log in again, reconnecting would not help.
 */
const CLOSE_SESSION_NOT_FOUND = 4001;


/** Server start here */
const app = express();

/** enable websocket */
require('express-ws')(app);

app.use(cors());
app.use(bodyParser.json());


/** logged in database connections */
const sessions = new SessionStore();


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
    if (response.driver && response.username !== null) {
      res.send(sessions.create(response.driver, response.username));
    } else {
      console.log('login fail', response.error);
      res.status(401).send({error: response.error});
    }
  });
});

/** new token for the same session, client calls it before token expires */
app.post('/api/refresh', (req:Request, res:Response) => {
  const data = req.body as EstablishedUser;
  const refreshed = typeof data?.token === 'string' ? sessions.refresh(data.token) : null;
  if (!refreshed) {
    res.status(401).send({error: 'Session expired or does not exist, log in again'});
    return;
  }
  res.send(refreshed);
});

/** handle disconnect request */
app.post('/api/disconnect', (req:Request, res:Response) => {
  const data = req.body as EstablishedUser;
  if (typeof data?.token === 'string') {
    sessions.closeByToken(data.token);
  }
  res.send('ok');
});


app.ws('/ws/:token', (ws:WebSocket, req: Request) => {
  const found = sessions.findByToken(req.params.token);

  if (!found) {
    // session itself is not closed - old token may be expired while session was refreshed with newer one
    console.error('Session not found or token expired. Close connection');
    ws.close(CLOSE_SESSION_NOT_FOUND, 'Session expired or does not exist, log in again');
    return;
  }

  console.info('New websocket connection');
  sessions.websocketOpened(found.sessionId);
  ws.addEventListener('close', () => sessions.websocketClosed(found.sessionId));

  new WebsocketRequest(found.session.driver, ws).procedure();
});

app.listen(3001, () => {
  console.log('Example app listening on port 3001!');
});


/** close database connections of expired sessions */
setInterval(() => {
  console.log(`Active sessions: ${sessions.removeExpired()}`);
}, 1000 * 60);
