const WebSocket = require('ws');
const username = "ID001";
const URL = "ws://127.0.0.1:8080/";

const RPCClient = require('./lib/client');

async function startWebsocket() {
    var ws = new WebSocket(URL, {
        perMessageDeflate: false,
        headers: {
            Authorization: Buffer.from(username).toString('base64'),
        },
    });

    // class method
    const cli = new RPCClient({
        ws: ws
    });
    await cli.connect();

    const bootNotificationParams =  {
        "reason": "PowerUp",
        "chargingStation": {
            "model": "L2",
            "vendorName": "Vega"
        }
    };

    const bootResponse = await cli.call("BootNotification", bootNotificationParams);
    console.log("bootResponse: ", bootResponse);
};

startWebsocket();