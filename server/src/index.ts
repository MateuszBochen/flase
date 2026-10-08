import {Request, Response} from 'express';
import ConnectionRequestInterface from './App/Connection/Interface/ConnectionRequestInterface';
import EstablishConnection from './App/Connection/EstablishConnection';
import EstablishConnectionResultInterface from './App/Connection/Interface/EstablishConnectionResultInterface';
import EstablishedUser from './App/Connection/Interface/EstablishedUser';
import WebsocketRequest from './App/Websocket/WebsocketRequest';
import SessionStore from './App/Session/SessionStore';
import TransferRegistry from './App/Transfer/TransferRegistry';
import {importCsv, importSql} from './App/Transfer/Importers';
import MessageType from './App/Websocket/Enum/MessageType';
import AbstractCommandHandler from './App/Websocket/CommandHandler/AbstractCommandHandler';
import {Readable} from 'stream';
const zlib = require('zlib');
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


/** SQL dump download - ticket was created by websocket command */
app.get('/api/transfer/:ticket', async (req: Request, res: Response) => {
  const ticket = TransferRegistry.take(req.params.ticket);
  if (!ticket || ticket.request.kind !== 'dump') {
    res.status(404).send('Download link expired or is invalid');
    return;
  }
  const {options, gzip} = ticket.request;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `${options.database}${options.tables.length === 1 ? `-${options.tables[0]}` : ''}-${stamp}.sql${gzip ? '.gz' : ''}`;
  res.setHeader('Content-Type', gzip ? 'application/gzip' : 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`);

  const output = gzip ? zlib.createGzip() : res;
  if (gzip) output.pipe(res);
  let bytes = 0;
  let aborted = false;
  // browser cancelled download - dump must stop, not wait for drain forever
  res.on('close', () => {
    if (!res.writableFinished) {
      aborted = true;
      output.emit('drain');
    }
  });
  const write = (text: string) => new Promise<void>((resolve, reject) => {
    if (aborted) return reject(new Error('Download was cancelled'));
    bytes += Buffer.byteLength(text);
    if (output.write(text)) return resolve();
    output.once('drain', () => aborted ? reject(new Error('Download was cancelled')) : resolve());
  });

  try {
    const summary = await ticket.driver.dump(options, write);
    ticket.notify(MessageType.DUMP_FINISHED, {...summary, bytes});
  } catch (e) {
    const error = AbstractCommandHandler.errorToString(e);
    if (!aborted) {
      output.write(`\n-- ERROR: dump is not complete: ${error}\n`);
    }
    ticket.notify(MessageType.DUMP_FINISHED, {tables: 0, rows: 0, bytes, error});
  } finally {
    output.end();
  }
});

/** import upload (SQL / CSV file as request body) - ticket was created by websocket command */
app.post('/api/transfer/:ticket', async (req: Request, res: Response) => {
  const ticket = TransferRegistry.take(req.params.ticket);
  if (!ticket || ticket.request.kind === 'dump') {
    res.status(404).send({error: 'Upload link expired or is invalid'});
    return;
  }
  const request = ticket.request;
  let input: Readable = req;
  if (request.gzip) {
    const gunzip = zlib.createGunzip();
    req.pipe(gunzip);
    input = gunzip;
  }
  const onProgress = (progress: any) => ticket.notify(MessageType.IMPORT_PROGRESS, progress);

  try {
    const finished = request.kind === 'import-sql'
      ? await importSql(ticket.driver, request.database, ticket.tabId, request.stopOnError, input, onProgress)
      : await importCsv(ticket.driver, request.options, ticket.tabId, input, onProgress);
    ticket.notify(MessageType.IMPORT_FINISHED, finished);
    res.send(finished);
  } catch (e) {
    const error = AbstractCommandHandler.errorToString(e);
    ticket.notify(MessageType.IMPORT_FINISHED, {bytes: 0, statements: 0, rows: 0, errors: [{statement: '', error}], cancelled: false, failed: true, durationMs: 0});
    req.resume();
    res.status(500).send({error});
  }
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
