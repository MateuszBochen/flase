"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EstablishConnection_1 = __importDefault(require("./App/Connection/EstablishConnection"));
const WebsocketRequest_1 = __importDefault(require("./App/Websocket/WebsocketRequest"));
const JWT_1 = __importDefault(require("./App/JWT/JWT"));
const Settings_1 = __importDefault(require("./App/Settings/Settings"));
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
/** number of open websockets per token, database connections are released when it drops to 0 */
const openWebsockets = {};
const releaseTimers = {};
const cancelRelease = (token) => {
    clearTimeout(releaseTimers[token]);
    delete releaseTimers[token];
};
/** close database connections when no websocket of this login is open for a while */
const scheduleRelease = (token) => {
    cancelRelease(token);
    releaseTimers[token] = setTimeout(() => {
        var _a;
        delete releaseTimers[token];
        if (!openWebsockets[token]) {
            (_a = connections[token]) === null || _a === void 0 ? void 0 : _a.releaseConnections();
        }
    }, Settings_1.default.getIdleConnectionReleaseMs());
};
const closeConnection = (token) => {
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
            // released if client never opens websocket
            scheduleRelease(response.userData.token);
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
    cancelRelease(token);
    openWebsockets[token] = (openWebsockets[token] || 0) + 1;
    // browser tab closed - keep login, but do not hold database connections
    ws.addEventListener('close', () => {
        openWebsockets[token] = Math.max(0, (openWebsockets[token] || 1) - 1);
        if (openWebsockets[token] === 0 && connections[token]) {
            scheduleRelease(token);
        }
    });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFHQSwrRkFBdUU7QUFHdkUsd0ZBQWdFO0FBQ2hFLHdEQUFnQztBQUNoQyx1RUFBK0M7QUFDL0MsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMxQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFJN0Isd0JBQXdCO0FBQ3hCLE1BQU0sR0FBRyxHQUFHLE9BQU8sRUFBRSxDQUFDO0FBRXRCLHVCQUF1QjtBQUN2QixPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFFM0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2hCLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFLM0I7OztHQUdHO0FBQ0gsTUFBTSxXQUFXLEdBQW9DLEVBQUUsQ0FBQztBQUV4RCxnR0FBZ0c7QUFDaEcsTUFBTSxjQUFjLEdBQTJCLEVBQUUsQ0FBQztBQUNsRCxNQUFNLGFBQWEsR0FBa0QsRUFBRSxDQUFDO0FBRXhFLE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBYSxFQUFFLEVBQUU7SUFDdEMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25DLE9BQU8sYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzlCLENBQUMsQ0FBQztBQUVGLHFGQUFxRjtBQUNyRixNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO0lBQ3hDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQixhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTs7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