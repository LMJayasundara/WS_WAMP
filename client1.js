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

        // check that the ws state is open
        if(state.state == OPEN){
            const bootNotificationParams =  {
                "reason": "PowerUp",
                "chargingStation": {
                    "model": "L2",
                    "vendorName": "Vega"
                }
            };
        
            // send a BootNotification request and await the response
            const bootResponse = await cli.call("BootNotification", bootNotificationParams);
            // read the bootResponse
            console.log("bootResponse: ", bootResponse);

            // check that the server accepted the client
            if (bootResponse.status === 'Accepted') {
                // send a Heartbeat request and await the response
                const heartbeatResponse = await cli.call('Heartbeat', {});
                // read the current server time from the response
                console.log('Server time is:', heartbeatResponse.currentTime);
            }
        }
    });
};

startWebsocket();