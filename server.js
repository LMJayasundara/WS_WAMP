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

const heartbeat = (client) => {
    console.log("Pong from client: "+ client.id);
    client.isAlive = true;
};

const ping = (client) => {
    // do some stuff
    console.log("Ping to client: " + client.id);
};

wss.on('connection', async function (ws, request) {
    ws.id = request.identity;
    console.log("Connected Charger ID: "  + ws.id);

    ws.isAlive = true;
    connected_clients.set(ws.id, ws);

    const ser = new RPCServer({
        ws: ws, 
        protocol: ['ocpp2.0.1']
    });

    await ser.handle('BootNotification', ({params}) => {
        console.log(`Server got BootNotification from ${ws.id}:`, params);
        ws.on('pong', () => { heartbeat(ws) });

        // respond to accept the client
        return {
            status: "Accepted",
            interval: 300,
            currentTime: new Date().toISOString()
        };
    });

    ws.on('close', function () {
        ws.terminate();
        console.log(ws.id + ' Client disconnected');
    });

});

const interval = setInterval(() => {
    // console.log("Try to ping...");
    Array.from(connected_clients.values()).forEach((client) => {
        if (client.isAlive === false) {
            connected_clients.delete(client.id);
            console.log("Terminate Client:", client.id);
            return client.terminate();
        };

        client.isAlive = false;
        client.ping(() => { ping(client) });
    });
}, 5000);

wss.on('close', function close() {
    clearInterval(interval);
});

server.listen(PORT, ()=>{
    console.log( (new Date()) + " Server is listening on port " + PORT);
});