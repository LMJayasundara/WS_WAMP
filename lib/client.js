const {EventEmitter} = require('events');
const EventBuffer = require('./event-buffer');
const {randomUUID} = require('crypto');

const MSG_CALL = 2;
const MSG_CALLRESULT = 3;
const MSG_CALLERROR = 4;

class RPCClient extends EventEmitter{
    constructor(ws){
        super();
        this._ws = ws;
    }

    async connect(){
        try {
            return await this._beginConnect();
        } catch (err) {
            throw err;
        }
    }

    async _beginConnect() {
        const leadMsgBuffer = new EventBuffer(this._ws, 'message');
        let upgradeResponse;

        try {
            await new Promise((resolve, reject) => {
                this._ws.once('upgrade', (response) => {
                    upgradeResponse = response;
                });
                this._ws.once('error', err => reject(err));
                this._ws.once('open', () => resolve());
            });

            this._attachWebsocket(this._ws, leadMsgBuffer);

            const result = {
                response: upgradeResponse
            };

            return result;
            
        } catch (err) {

            this._ws.terminate();
            if (upgradeResponse) {
                err.upgrade = upgradeResponse;
            }
            throw err;
        }
    }

    _attachWebsocket(ws, leadMsgBuffer) {
        process.nextTick(() => {
            if (leadMsgBuffer) {
                const messages = leadMsgBuffer.condense();
                messages.forEach(([msg]) => this._onMessage(msg));
            }
            ws.on('message', msg => this._onMessage(msg));
        });
    }

    _onMessage(buffer) {
        const message = buffer.toString('utf8');

        let msgId = '-1';
        let messageType;
        
        try {
            let payload;
            try {
                payload = JSON.parse(message);
            } catch (err) {
                throw createRPCError("RpcFrameworkError", "Message must be a JSON structure", {});
            }

            if (!Array.isArray(payload)) {
                throw createRPCError("RpcFrameworkError", "Message must be an array", {});
            }

            const [messageTypePart, msgIdPart, ...more] = payload;

            if (typeof messageTypePart !== 'number') {
                throw createRPCError("RpcFrameworkError", "Message type must be a number", {});
            }

            messageType = messageTypePart;

            if (typeof msgIdPart !== 'string') {
                throw createRPCError("RpcFrameworkError", "Message ID must be a string", {});
            }
            
            msgId = msgIdPart;
            
            switch (messageType) {
                case MSG_CALL:
                    console.log("MSG_CALL");
                    break;
                case MSG_CALLRESULT:
                    console.log("MSG_CALLRESULT");
                    break;
                case MSG_CALLERROR:
                    console.log("MSG_CALLERROR");
                    break;
                default:
                    console.log(`Unexpected message type: ${messageType}`);
            }

        } catch (error) {
            console.log(error);
        }
    }

    async call(method, params) {
        const msgId = randomUUID();
        // const msgId = "19223201";
        const payload = [MSG_CALL, msgId, method, params];
        this.sendRaw(JSON.stringify(payload));
    }

    sendRaw(message) {
        if (this._ws) {
            this._ws.send(message);
        } else {
            console.log(`Cannot send message in this state`);
        }
    }
}

module.exports = RPCClient