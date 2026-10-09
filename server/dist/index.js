"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const WebsocketRequest_1 = __importDefault(require("./App/Websocket/WebsocketRequest"));
const SessionStore_1 = __importDefault(require("./App/Session/SessionStore"));
const TransferRegistry_1 = __importDefault(require("./App/Transfer/TransferRegistry"));
const Importers_1 = require("./App/Transfer/Importers");
const MessageType_1 = __importDefault(require("./App/Websocket/Enum/MessageType"));
const AbstractCommandHandler_1 = __importDefault(require("./App/Websocket/CommandHandler/AbstractCommandHandler"));
const PredefinedConnections_1 = __importDefault(require("./App/Settings/PredefinedConnections"));
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
const sessions = new SessionStore_1.default();
/**
 * login and Establish connection with db
 * @author Mateusz Bochen
 */
app.post('/api/login', (req, res) => {
    const validationError = EstablishConnection_1.default.validate(req.body);
    if (validationError) {
        res.status(400).send({ error: validationError });
        return;
    }
    const data = req.body;
    // predefined connection: address and read only come from server configuration, never from browser
    const predefined = PredefinedConnections_1.default.find(data.connectionData.id);
    if (predefined) {
        data.connectionData.dsn = predefined.dsn;
        data.connectionData.readOnly = data.connectionData.readOnly || predefined.readOnly;
    }
    else if (!PredefinedConnections_1.default.allowCustom()) {
        res.status(403).send({ error: 'Only connections defined by administrator are allowed' });
        return;
    }
    const connector = new EstablishConnection_1.default();
    connector.connect(data).then((response) => {
        if (response.driver && response.username !== null) {
            res.send(sessions.create(response.driver, response.username, { readOnly: !!(predefined === null || predefined === void 0 ? void 0 : predefined.readOnly) }));
        }
        else {
            console.log('login fail', response.error);
            res.status(401).send({ error: response.error });
        }
    });
});
/** connections defined by administrator and whether users can add own ones */
app.get('/api/config', (req, res) => {
    res.send(PredefinedConnections_1.default.forClient());
});
/** new token for the same session, client calls it before token expires */
app.post('/api/refresh', (req, res) => {
    const data = req.body;
    const refreshed = typeof (data === null || data === void 0 ? void 0 : data.token) === 'string' ? sessions.refresh(data.token) : null;
    if (!refreshed) {
        res.status(401).send({ error: 'Session expired or does not exist, log in again' });
        return;
    }
    res.send(refreshed);
});
/** handle disconnect request */
app.post('/api/disconnect', (req, res) => {
    const data = req.body;
    if (typeof (data === null || data === void 0 ? void 0 : data.token) === 'string') {
        sessions.closeByToken(data.token);
    }
    res.send('ok');
});
/** SQL dump download - ticket was created by websocket command */
app.get('/api/transfer/:ticket', async (req, res) => {
    const ticket = TransferRegistry_1.default.take(req.params.ticket);
    if (!ticket || ticket.request.kind !== 'dump') {
        res.status(404).send('Download link expired or is invalid');
        return;
    }
    const { options, gzip } = ticket.request;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const name = `${options.database}${options.tables.length === 1 ? `-${options.tables[0]}` : ''}-${stamp}.sql${gzip ? '.gz' : ''}`;
    res.setHeader('Content-Type', gzip ? 'application/gzip' : 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`);
    const output = gzip ? zlib.createGzip() : res;
    if (gzip)
        output.pipe(res);
    let bytes = 0;
    let aborted = false;
    // browser cancelled download - dump must stop, not wait for drain forever
    res.on('close', () => {
        if (!res.writableFinished) {
            aborted = true;
            output.emit('drain');
        }
    });
    const write = (text) => new Promise((resolve, reject) => {
        if (aborted)
            return reject(new Error('Download was cancelled'));
        bytes += Buffer.byteLength(text);
        if (output.write(text))
            return resolve();
        output.once('drain', () => aborted ? reject(new Error('Download was cancelled')) : resolve());
    });
    try {
        const summary = await ticket.driver.dump(options, write);
        ticket.notify(MessageType_1.default.DUMP_FINISHED, Object.assign(Object.assign({}, summary), { bytes }));
    }
    catch (e) {
        const error = AbstractCommandHandler_1.default.errorToString(e);
        if (!aborted) {
            output.write(`\n-- ERROR: dump is not complete: ${error}\n`);
        }
        ticket.notify(MessageType_1.default.DUMP_FINISHED, { tables: 0, rows: 0, bytes, error });
    }
    finally {
        output.end();
    }
});
/** import upload (SQL / CSV file as request body) - ticket was created by websocket command */
app.post('/api/transfer/:ticket', async (req, res) => {
    const ticket = TransferRegistry_1.default.take(req.params.ticket);
    if (!ticket || ticket.request.kind === 'dump') {
        res.status(404).send({ error: 'Upload link expired or is invalid' });
        return;
    }
    const request = ticket.request;
    let input = req;
    if (request.gzip) {
        const gunzip = zlib.createGunzip();
        req.pipe(gunzip);
        input = gunzip;
    }
    const onProgress = (progress) => ticket.notify(MessageType_1.default.IMPORT_PROGRESS, progress);
    try {
        const finished = request.kind === 'import-sql'
            ? await Importers_1.importSql(ticket.driver, request.database, ticket.tabId, request.stopOnError, input, onProgress)
            : await Importers_1.importCsv(ticket.driver, request.options, ticket.tabId, input, onProgress);
        ticket.notify(MessageType_1.default.IMPORT_FINISHED, finished);
        res.send(finished);
    }
    catch (e) {
        const error = AbstractCommandHandler_1.default.errorToString(e);
        ticket.notify(MessageType_1.default.IMPORT_FINISHED, { bytes: 0, statements: 0, rows: 0, errors: [{ statement: '', error }], cancelled: false, failed: true, durationMs: 0 });
        req.resume();
        res.status(500).send({ error });
    }
});
app.ws('/ws/:token', (ws, req) => {
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
    new WebsocketRequest_1.default(found.session.driver, ws, found.session.readOnly).procedure();
});
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
    console.log(`Flase server listening on port ${PORT}`);
});
/** close database connections of expired sessions */
setInterval(() => {
    console.log(`Active sessions: ${sessions.removeExpired()}`);
}, 1000 * 60);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrRkFBdUU7QUFHdkUsd0ZBQWdFO0FBQ2hFLDhFQUFzRDtBQUN0RCx1RkFBK0Q7QUFDL0Qsd0RBQThEO0FBQzlELG1GQUEyRDtBQUMzRCxtSEFBMkY7QUFFM0YsaUdBQXlFO0FBQ3pFLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3QixNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDbkMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUU3Qjs7O0dBR0c7QUFDSCxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQztBQUdyQyx3QkFBd0I7QUFDeEIsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUM7QUFFdEIsdUJBQXVCO0FBQ3ZCLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUUzQixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDaEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUczQixxQ0FBcUM7QUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBWSxFQUFFLENBQUM7QUFHcEM7OztHQUdHO0FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFXLEVBQUUsR0FBWSxFQUFFLEVBQUU7SUFDbkQsTUFBTSxlQUFlLEdBQUcsNkJBQW1CLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvRCxJQUFJLGVBQWUsRUFBRTtRQUNuQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcs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