import {Request, Response} from 'express';
import ConnectionRequestInterface from './App/Connection/Interface/ConnectionRequestInterface';
import EstablishConnection from './App/Connection/EstablishConnection';
import EstablishConnectionResultInterface from './App/Connection/Interface/EstablishConnectionResultInterface';
import EstablishedUser from './App/Connection/Interface/EstablishedUser';
import WebsocketRequest from './App/Websocket/WebsocketRequest';
import SessionStore, {CLOSE_SESSION_NOT_FOUND} from './App/Session/SessionStore';
import TransferRegistry from './App/Transfer/TransferRegistry';
import {importCsv, importSql} from './App/Transfer/Importers';
import MessageType from './App/Websocket/Enum/MessageType';
import AbstractCommandHandler from './App/Websocket/CommandHandler/AbstractCommandHandler';
import {Readable} from 'stream';
import PredefinedConnections from './App/Settings/PredefinedConnections';
import Settings from './App/Settings/Settings';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');



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
  // predefined connection: address and read only come from server configuration, never from browser
  const predefined = PredefinedConnections.find((data.connectionData as any).id);
  if (predefined) {
    data.connectionData.dsn = predefined.dsn;
    // tunnel of predefined connection only from configuration, browser does not know its secrets
    data.connectionData.ssh = predefined.ssh?.config || null;
    data.userData.ssh = predefined.ssh?.secrets;
    data.connectionData.readOnly = data.connectionData.readOnly || predefined.readOnly;
  } else if (!PredefinedConnections.allowCustom()) {
    res.status(403).send({error: 'Only connections defined by administrator are allowed'});
    return;
  }

  const connector = new EstablishConnection();
  connector.connect(data).then((response: EstablishConnectionResultInterface) => {
    if (response.driver && response.username !== null) {
      res.send(sessions.create(response.driver, response.username, {readOnly: !!predefined?.readOnly, request: data}));
    } else {
      console.log('login fail', response.error);
      // unknown host key of SSH server is confirmed by user, of predefined connection by administrator
      const sshHostKey = response.sshHostKey && !predefined ? {sshHostKey: response.sshHostKey} : {};
      res.status(401).send({error: predefined && response.sshHostKey
        ? `${response.error} - administrator has to set ssh.hostKey of the connection`
        : response.error, ...sshHostKey});
    }
  });
});

/**
 * other database of PostgreSQL server - new session with login of given session (password is not sent again),
 * read only of the session is kept
 */
app.post('/api/login/database', (req: Request, res: Response) => {
  const found = typeof req.body?.token === 'string' ? sessions.findByToken(req.body.token) : null;
  const database = req.body?.database;
  if (!found || !found.session.request) {
    res.status(401).send({error: 'Session expired or does not exist, log in again'});
    return;
  }
  if (found.session.driver.dialect !== 'postgresql') {
    res.status(400).send({error: 'Only PostgreSQL connection has databases above schemas'});
    return;
  }
  if (typeof database !== 'string' || !database.trim() || database.length > 63) {
    res.status(400).send({error: 'Database name is required'});
    return;
  }
  const parent = found.session.request;
  const request: ConnectionRequestInterface = {...parent, connectionData: {...parent.connectionData, database}};
  new EstablishConnection().connect(request).then((response: EstablishConnectionResultInterface) => {
    if (response.driver && response.username !== null) {
      res.send(sessions.create(response.driver, response.username, {readOnly: found.session.readOnly, request}));
    } else {
      res.status(401).send({error: response.error});
    }
  });
});

/** connections defined by administrator and whether users can add own ones */
app.get('/api/config', (req: Request, res: Response) => {
  res.send(PredefinedConnections.forClient());
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
    ticket.notify(MessageType.DUMP_FINISHED, {tables: 0, rows: 0, bytes, error});
    if (!bytes && !aborted && !res.headersSent) {
      // failed before first line (missing database / table) - error status instead of empty file
      if (gzip) {
        output.unpipe(res);
        output.destroy();
      }
      res.removeHeader('Content-Disposition');
      res.status(400).type('text/plain').send(`Dump failed: ${error}`);
      return;
    }
    if (!aborted) {
      output.write(`\n-- ERROR: dump is not complete: ${error}\n`);
    }
    output.end();
    return;
  }
  output.end();
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
    // corrupted / truncated gzip: importer gets the error from the stream, unhandled 'error' event would stop the server
    // (zlib may emit it after the input ended, so stream.pipeline is not enough)
    gunzip.on('error', () => undefined);
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
  sessions.websocketOpened(found.sessionId, ws);
  ws.addEventListener('close', () => sessions.websocketClosed(found.sessionId, ws));

  new WebsocketRequest(found.session.driver, ws, found.session.readOnly).procedure();
});

/** production image: application is served by this server (FLASE_FRONT_DIR), API and websocket on the same address */
const frontDirectory = Settings.getFrontDirectory();
if (frontDirectory && fs.existsSync(path.join(frontDirectory, 'index.html'))) {
  // hashed assets can be cached, index.html must be loaded again after update
  app.use(express.static(frontDirectory, {
    index: false,
    setHeaders: (res: Response, file: string) => {
      if (/[\\/]static[\\/]/.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get(/^\/(?!api\/|ws\/).*/, (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontDirectory, 'index.html'));
  });
  console.log(`Serving application from ${frontDirectory}`);
} else if (frontDirectory) {
  console.error(`FLASE_FRONT_DIR ${frontDirectory} does not contain index.html - application is not served`);
}

/** invalid JSON body and other errors of middlewares - JSON like other errors of API, never HTML page with stack trace */
app.use((error: any, req: Request, res: Response, next: (error?: any) => void) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = Number(error?.status || error?.statusCode) || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).send({
    error: error?.type === 'entity.parse.failed' ? 'Invalid JSON in request body' : status >= 500 ? 'Internal server error' : String(error?.message || error),
  });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Flase server listening on port ${PORT}`);
});


/** close database connections of expired sessions */
setInterval(() => {
  console.log(`Active sessions: ${sessions.removeExpired()}`);
}, 1000 * 60);
