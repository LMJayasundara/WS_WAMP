const WebSocket = require('ws');
const username = "ID002";
const URL = "ws://127.0.0.1:8080/";
var reconn = null;

const heartbeat = (ws) => {
    console.log("ping to server");
    clearTimeout(ws.pingTimeout);
};

// Default Method
async function startWebsocket() {
    var ws = new WebSocket(URL, {
        perMessageDeflate: false,
        headers: {
            Authorization: Buffer.from(username).toString('base64'),
        },
    });

    const bootNotificationParams =  {
        "reason": "PowerUp",
        "chargingStation": {
            "model": "L2",
            "vendorName": "Vega"
        }
    };

    const payload = [2, "19223202", "BootNotification", bootNotificationParams];

    var ping = () => { heartbeat(ws) };

    ws.on('open', function() {
        clearInterval(reconn);
        ws.send(JSON.stringify(payload));
    });

    ws.on('message', function(msg) {
        var data = JSON.parse(msg);
        console.log("response:", data);

        if(data[2].status == 'Accepted'){
            ws.send(JSON.stringify([2, 'hb', 'Heartbeat', {}]));
            ws.on('ping', ping);
        }
    });

    ws.on('error', function (err) {
        console.log(err.message);
    });

    ws.on('close', function() {
        ws.terminate();
        reconn = setTimeout(startWebsocket, 5000);
    });
};

startWebsocket();