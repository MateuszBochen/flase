"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const WebsocketRequest_1 = __importDefault(require("./App/Websocket/WebsocketRequest"));
const JWT_1 = __importDefault(require("./App/JWT/JWT"));
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
const closeConnection = (token) => {
    if (connections[token]) {
        connections[token].disconnect();
        delete connections[token];
    }
};
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
        if (response.driver && response.userData) {
            connections[response.userData.token] = response.driver;
            res.send(response.userData);
        }
        else {
            console.log('login fail', response.error);
            res.status(401).send({ error: response.error });
        }
    });
});
/** handle disconnect request */
app.post('/api/disconnect', (req, res) => {
    const data = req.body;
    if (typeof (data === null || data === void 0 ? void 0 : data.token) === 'string') {
        closeConnection(data.token);
    }
    res.send('ok');
});
app.ws('/ws/:token', (ws, req) => {
    const token = req.params.token;
    if (!connections[token]) {
        console.error('Connection not exist on server side. Close connection');
        ws.close(1008, 'Connection not exist on server side. Close connection');
        return;
    }
    if (!JWT_1.default.verify(token)) {
        console.error('Token expired or invalid. Close connection');
        closeConnection(token);
        ws.close(1008, 'Token expired or invalid');
        return;
    }
    console.info('New websocket connection');
    new WebsocketRequest_1.default(connections[token], ws).procedure();
});
app.listen(3001, () => {
    console.log('Example app listening on port 3001!');
});
/** close database connections of expired tokens */
setInterval(() => {
    Object.keys(connections)
        .filter((token) => !JWT_1.default.verify(token))
        .forEach((token) => closeConnection(token));
    console.log(`Active connections: ${Object.keys(connections).length}`);
}, 1000 * 60);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHQSwrRkFBdUU7QUFHdkUsd0ZBQWdFO0FBQ2hFLHdEQUFnQztBQUNoQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDbkMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUk3Qix3QkFBd0I7QUFDeEIsTUFBTSxHQUFHLEdBQUcsT0FBTyxFQUFFLENBQUM7QUFFdEIsdUJBQXVCO0FBQ3ZCLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUUzQixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDaEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUszQjs7O0dBR0c7QUFDSCxNQUFNLFdBQVcsR0FBb0MsRUFBRSxDQUFDO0FBRXhELE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBYSxFQUFFLEVBQUU7SUFDeEMsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDdEIsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLE9BQU8sV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQzNCO0FBQ0gsQ0FBQyxDQUFDO0FBSUY7OztHQUdHO0FBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxHQUFXLEVBQUUsR0FBWSxFQUFFLEVBQUU7SUFDbkQsTUFBTSxlQUFlLEdBQUcsNkJBQW1CLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvRCxJQUFJLGVBQWUsRUFBRTtRQUNuQixHQUFHLENBQUMsTUFB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