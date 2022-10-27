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

wss.on('connection', function (ws, request) {
    ws.id = request.identity;
    console.log("Connected Charger ID: "  + ws.id);

    new RPCServer(ws);

    ws.on('message', async function (msg) {

        return new Promise(function(resolve, reject) {
            const ccc = Array.from(wss.clients).find(client => (client.readyState === client.OPEN && client.id == ws.id));
            resolve(ccc)
        }).then((client)=>{

            //////////////////////////////////////////////////////////////////////////////

            const bootNotificationParams =  {
                "currentTime": new Date().toISOString(),
                "interval": 300,
                "status": "Accepted"
            };
            const payload = [3, "19223201", bootNotificationParams];

            //////////////////////////////////////////////////////////////////////////////

            if(client !== undefined){
                console.log(ws.id,":", JSON.parse(msg));
                client.send(JSON.stringify(payload));
            }
            else{
                console.log("Client Undefined!");
            }
        });

    });

    ws.on('close', function () {
        ws.terminate();
        console.log(ws.id + ' Client disconnected');
    });

});

server.listen(PORT, ()=>{
    console.log( (new Date()) + " Server is listening on port " + PORT);
});