const WebSocket = require('ws');
var http = require('http');
var express = require('express');
var app = express();
const PORT = 8080;
const connected_clients = new Map();

const RPCServer = require('./lib/server');

var server = new http.createServer({
}, app);

var wss = new WebSocket.Server({
    server,
    verifyClient: function (info, cb) {
        var clientID = Buffer.from(info.req.headers.authorization,'base64').toString('utf-8');
        info.req.identity = clientID;
        cb(true, 200, 'Authorized');
    }
});

wss.on('connection', async function (ws, request) {
    ws.id = request.identity;
    ws.isAlive = true;
    connected_clients.set(ws.id, ws);
    console.log("Connected Charger ID: "  + ws.id);

    const ser = new RPCServer({
        ws: ws, 
        protocol: ['ocpp2.0.1'],
        clients: connected_clients,
        pingTimeOut: 5000
    });

    await ser.handle('BootNotification', ({params}) => {
        console.log(`Server got BootNotification from ${ws.id}:`, params);
        // respond to accept the client
        return {
            status: "Accepted",
            interval: 300,
            currentTime: new Date().toISOString()
        };
    });

    await ser.handle('Heartbeat', ({params}) =>{
        console.log(`Server got Heartbeat from ${ws.id}`);
        // respond with current time
        return {
            currentTime: new Date().toISOString()
        };
    });

    ws.on('close', function () {
        ws.terminate();
        console.log(ws.id + ' Client disconnected');
    });
});

server.listen(PORT, ()=>{
    console.log( (new Date()) + " Server is listening on port " + PORT);
});