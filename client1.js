const username = "ID001";
const URL = "ws://127.0.0.1:8080/";
const RPCClient = require('./lib/client');
const WebSocket = require('ws');
const { CONNECTING, OPEN, CLOSING, CLOSED } = WebSocket;

// Implemented Method
async function startWebsocket() {
    const cli = new RPCClient({
        URL: URL,
        username: username
    });

    await cli.connect();

    cli.on('state', async (state) => {
        console.log("state: ", state);

        if(state.state == OPEN){
            const bootNotificationParams =  {
                "reason": "PowerUp",
                "chargingStation": {
                    "model": "L2",
                    "vendorName": "Vega"
                }
            };
        
            const bootResponse = await cli.call("BootNotification", bootNotificationParams);
            console.log("bootResponse: ", bootResponse);
        }
    });
};

startWebsocket();