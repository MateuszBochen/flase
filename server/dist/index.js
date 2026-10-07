"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const WebsocketRequest_1 = __importDefault(require("./App/Websocket/WebsocketRequest"));
const SessionStore_1 = __importDefault(require("./App/Session/SessionStore"));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrRkFBdUU7QUFHdkUsd0ZBQWdFO0FBQ2hFLDhFQUFzRDtBQUN0RCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDbkMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUU3Qjs7O0dBR0c7QUFDSCxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQztBQUdyQyx3QkFBd0I7QUFDeEIsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUM7QUFFdEIsdUJBQXVCO0FBQ3ZCLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUUzQixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDaEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUczQixxQ0FBcUM7QUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBWSxFQUFFLENBQUM7QUFHcEM7OztHQUdHO0FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFXLEVBQUUsR0FBWSxFQUFFLEVBQUU7SUFDbkQsTUFBTSxlQUFlLEdBQUcsNkJBQW1CLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvRCxJQUFJLGVBQWUsRUFBRTtRQUNuQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFDLEtBQUssRUFBRSxlQUFlLEVBQUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU87S0FDUjtJQUVELE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFrQyxDQUFD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