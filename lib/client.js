const {EventEmitter} = require('events');
const EventBuffer = require('./event-buffer');
const {randomUUID} = require('crypto');
const {createValidator} = require('./validator');

const MSG_CALL = 2;
const MSG_CALLRESULT = 3;
const MSG_CALLERROR = 4;
const NOREPLY = Symbol("NOREPLY");

// const validator = createValidator('ocpp1.6', require('../schemas/ocpp1_6.json'));
const validator = createValidator('ocpp2.0.1', require('../schemas/ocpp2_0_1.json'));

class RPCClient extends EventEmitter{
    constructor(option){
        super();
        this._ws = option.ws;
        this._protocol = option.protocol;
        this._handlers = new Map();
        this._pendingCalls = new Map();
        this._reconn = null;
    }

    async handle(method, handler) {
        this._handlers.set(method, handler);
    }

    async connect(){
        try {
            return await this._beginConnect();
        } catch (error) {
            console.log(error.message);
        }
    }

    async _beginConnect() {
        const leadMsgBuffer = new EventBuffer(this._ws, 'message');
        let upgradeResponse;

        try {
            await new Promise((resolve, reject) => {
                this._ws.on('upgrade', (response) => {
                    upgradeResponse = response;
                });
                this._ws.on('error', error => reject(error));
                this._ws.on('open', () => resolve());
            });

            this._attachWebsocket(this._ws, leadMsgBuffer);

            const result = {
                response: upgradeResponse
            };

            return result;
            
        } catch (error) {

            this._ws.terminate();
            if (upgradeResponse) {
                error.upgrade = upgradeResponse;
            }
            console.log(error.message);
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
            } catch (error) {
                console.log("RpcFrameworkError, Message must be a JSON structure");
            }

            if (!Array.isArray(payload)) {
                console.log("RpcFrameworkError, Message must be an array");
            }

            const [messageTypePart, msgIdPart, ...more] = payload;

            if (typeof messageTypePart !== 'number') {
                console.log("RpcFrameworkError, Message type must be a number");
            }

            messageType = messageTypePart;

            if (typeof msgIdPart !== 'string') {
                console.log("RpcFrameworkError, Message ID must be a string");
            }

            else{
                msgId = msgIdPart;
            
                switch (messageType) {
                    case MSG_CALL:
                        console.log("MSG_CALL");
                        const [method, params] = more;
                        this._onCall(msgId, method, params);
                        break;
                    case MSG_CALLRESULT:
                        console.log("MSG_CALLRESULT");
                        const [result] = more;
                        this._onCallResult(msgId, result);
                        break;
                    case MSG_CALLERROR:
                        console.log("MSG_CALLERROR");
                        break;
                    default:
                        console.log(`Unexpected message type: ${messageType}`);
                }
            }

        } catch (error) {
            console.log(error.message);
        }
    }

    async call(method, params, options = {}) {
        return await this._call(method, params, options);
    }

    async _call(method, params, options = {}) {
        const msgId = randomUUID();
        const payload = [MSG_CALL, msgId, method, params];

        try {
            validator.validate(`urn:${method}.req`, params);
        } catch (error) {
            console.log(error.message);
        }
        const pendingCall = {msgId, method, params};

        if (!options.noReply) {
            const cleanup = () => {
                if (pendingCall.timeout) {
                    timeoutAc.abort();
                }
                this._pendingCalls.delete(msgId);
            };

            pendingCall.promise = new Promise((resolve, reject) => {
                pendingCall.resolve = (...args) => {
                    cleanup();
                    resolve(...args);
                };
                pendingCall.reject = (...args) => {
                    cleanup();
                    reject(...args);
                };
            });

            this._pendingCalls.set(msgId, pendingCall);
        }

        this.sendRaw(JSON.stringify(payload));

        if (options.noReply) {
            return;
        }

        try {
            const result = await pendingCall.promise;
            return result;
        } catch (error) {
            console.log(error.message);
        }
    }

    async _onCall(msgId, method, params){
        let payload;
        let handler = this._handlers.get(method);

        try {
            if (!handler) {
                console.log("NotImplemented", `Unable to handle '${method}' calls`, {});
            }
        } catch (error) {
            console.log(error);
        }
        
        try {
            await validator.validate(`urn:${method}.req`, params);

            const ac = new AbortController();
            const callPromise = new Promise(async (resolve, reject) => {
                function reply(val) {
                    if (val instanceof Error) {
                        reject(val);
                    } else {
                        resolve(val);
                    }
                }

                try {
                    reply(await handler({
                        messageId: msgId,
                        method,
                        params,
                        signal: ac.signal,
                        reply,
                    }));
                } catch (error) {
                    reply(error);
                }
            });

            const result = await callPromise;
            if (result === NOREPLY) {
                return;
            }

            payload = [MSG_CALLRESULT, msgId, result];

            try {
                await validator.validate(`urn:${method}.conf`, result);
                this.sendRaw(JSON.stringify(payload));
            } catch (error) {
                console.log(error.details);
            }

        } catch (error) {
            console.log(error.details);
        }
    }

    _onCallResult(msgId, result) {
        const pendingCall = this._pendingCalls.get(msgId);
        if (pendingCall) {
            try {
                validator.validate(`urn:${pendingCall.method}.conf`, result);
            } catch (error) {
                return pendingCall.reject(error);
            }
        
            return pendingCall.resolve(result);

        } else {
            console.log("RpcFrameworkError", `Received CALLRESULT for unrecognised message ID: ${msgId}`)
        }
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