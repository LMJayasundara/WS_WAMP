const RPCClient = require("./client");

class RPCServer extends RPCClient {
    constructor(option) {
        super(option);
        this._ws = option.ws;
        this._attachWebsocket(this._ws);
    }
}

module.exports = RPCServer;