const WebSocket = require('ws');
var http = require('http');
var express = require('express');
var app = express();
const PORT = 8080;

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
    console.log("Connected Charger ID: "  + ws.id);

    const ser = new RPCServer(ws);

    await ser.handle('BootNotification', ({params}) => {
        console.log(`Server got BootNotification from ${ws.id}:`, params);

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

server.listen(PORT, ()=>{
    console.log( (new Date()) + " Server is listening on port " + PORT);
});