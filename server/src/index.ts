import {Request, Response} from 'express';
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
    [key:string]: any
}

const connections: IConnection = {};

app.post('/api/login', (req:Request, res:Response) => {
    const {  host, login, password } = req.body;

    const sqlConnection = mysql.createConnection({
        host,
        user: login,
        password,
        insecureAuth: true,
        multipleStatements: true,
    });

    sqlConnection.connect((err: any) => {
        if (err) {
            console.log(err);
            console.log(111);
            res.status(401);
            res.send('invalid credentials');
            res.end();
        } else {
            const token = uuid.v4();
            connections[token] = sqlConnection;
            res.send({'token': token});
        }
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


