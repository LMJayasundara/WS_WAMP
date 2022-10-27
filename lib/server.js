const RPCClient = require("./client");

class RPCServer extends RPCClient {
    constructor(ws) {
        super();
        this._ws = ws;
        this._attachWebsocket(this._ws);
    }
}

module.exports = RPCServer;