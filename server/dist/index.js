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
    const connector = new EstablishConnection_1.default();
    connector.connect(data).then((response) => {
        if (response.driver && response.username !== null) {
            res.send(sessions.create(response.driver, response.username));
        }
        else {
            console.log('login fail', response.error);
            res.status(401).send({ error: response.error });
        }
    });
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
    new WebsocketRequest_1.default(found.session.driver, ws).procedure();
});
app.listen(3001, () => {
    console.log('Example app listening on port 3001!');
});
/** close database connections of expired sessions */
setInterval(() => {
    console.log(`Active sessions: ${sessions.removeExpired()}`);
}, 1000 * 60);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrRkFBdUU7QUFHdkUsd0ZBQWdFO0FBQ2hFLDhFQUFzRDtBQUN0RCx1RkFBK0Q7QUFDL0Qsd0RBQThEO0FBQzlELG1GQUEyRDtBQUMzRCxtSEFBMkY7QUFFM0YsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzdCLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNuQyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDMUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRTdCOzs7R0FHRztBQUNILE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDO0FBR3JDLHdCQUF3QjtBQUN4QixNQUFNLEdBQUcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUV0Qix1QkFBdUI7QUFDdkIsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRTNCLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUNoQixHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRzNCLHFDQUFxQztBQUNyQyxNQUFNLFFBQVEsR0FBRyxJQUFJLHNCQUFZLEVBQUUsQ0FBQztBQUdwQzs7O0dBR0c7QUFDSCxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLEdBQVcsRUFBRSxHQUFZLEVBQUUsRUFBRTtJQUNuRCxNQUFNLGVBQWUsR0FBRyw2QkFBbUIsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9ELElBQUksZUFBZSxFQUFFO1FBQ25CLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFB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