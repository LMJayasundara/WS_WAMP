const {EventEmitter} = require('events');
const {randomUUID} = require('crypto');
const {createValidator} = require('./validator');
const WebSocket = require('ws');
const {RPCFrameworkError, RPCMessageTypeNotSupportedError} = require('./errors');
const {createRPCError} = require('./util');

const MSG_CALL = 2;
const MSG_CALLRESULT = 3;
const MSG_CALLERROR = 4;
const NOREPLY = Symbol("NOREPLY");

// const validator = createValidator('ocpp1.6', require('../schemas/ocpp1_6.json'));
const validator = createValidator('ocpp2.0.1', require('../schemas/ocpp2_0_1.json'));

class RPCClient extends EventEmitter{
    constructor(option){
        super();
        this._URL = option.URL;
        this._username = option.username;
        this._handlers = new Map();
        this._pendingCalls = new Map();
        this._reconn = undefined;
        this._ws = undefined;
        this._protocol = option.protocol;
        this._clients = option.clients;
        this._pingTimeOut = option.pingTimeOut;
    }

    async handle(method, handler) {
        this._handlers.set(method, handler);
    }

    async connect(){
        this._ws = new WebSocket(this._URL, {
            perMessageDeflate: false,
            headers: {
                Authorization: Buffer.from(this._username).toString('base64'),
            },
        });

        try {
            await this._beginConnect();
        } catch (error) {
            console.log('E0', error.message);
        }
    }

    async _beginConnect() {
        try {
            await new Promise((resolve, reject) => {    
                this._ws.on('open', () => {
                    clearInterval(this._reconn);
                    resolve();
                });

                this._ws.on('error', error => {
                    reject(error);
                });
                
                this._ws.on('close', () => {
                    this._tryReconnect();
                });
            });

            this._attachWebsocket(this._ws);

        } catch (error) {
            console.log('E1', error.message);
            this._ws.terminate();
        }

        process.nextTick(() => {
            const heartbeat = (ws) => {
                console.log("ping to server");
                clearTimeout(ws.pingTimeout);
            };
            var ping = () => { heartbeat(this._ws) };
            this._ws.on('ping', ping);

            this.emit('state', {state: this._ws.readyState});
        });
    }

    async _tryReconnect() {
        this._reconn = setTimeout(async() => {
            this._ws.terminate();
            await this.connect();
        }, 5000);
    }

    async _attachWebsocket(ws) {
        process.nextTick(() => {
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

            else{
                msgId = msgIdPart;
            
                switch (messageType) {
                    case MSG_CALL:
                        console.log("MSG_CALL");
                        const [method, params] = more;
                        if (typeof method !== 'string') {
                            throw new RPCFrameworkError("Method must be a string");
                        }
                        this._onCall(msgId, method, params);
                        break;
                    case MSG_CALLRESULT:
                        console.log("MSG_CALLRESULT");
                        const [result] = more;
                        this._onCallResult(msgId, result);
                        break;
                    case MSG_CALLERROR:
                        console.log("MSG_CALLERROR");
                        const [errorCode, errorDescription, errorDetails] = more;
                        this._onCallError(msgId, errorCode, errorDescription, errorDetails);
                        break;
                    default:
                        throw new RPCMessageTypeNotSupportedError(`Unexpected message type: ${messageType}`);
                }
            }
        } catch (error) {
            console.log("E2", error.message);
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
            console.log('E3', error.message);
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
            console.log('E4', error.message);
        }
    }

    async _onCall(msgId, method, params){
        let payload;
        let handler = this._handlers.get(method);

        try {
            if (!handler) {
                throw createRPCError("NotImplemented", `Unable to handle '${method}' calls`, {});
            }
        } catch (error) {
            console.log('E5', error.message);
        }
        
        try {
            await validator.validate(`urn:${method}.req`, params);

            if(method == 'Heartbeat'){
                const ping = (client) => {
                    console.log("Ping to client: " + client.id);
                };

                const interval = setInterval(() => {
                    Array.from(this._clients.values()).forEach((client) => {
                        if (client.isAlive === false) {
                            this._clients.delete(client.id);
                            console.log("Terminate Client:", client.id);
                            return client.terminate();
                        };
                
                        client.isAlive = false;
                        client.ping(() => { ping(client) });
                    });
                }, this._pingTimeOut);

                const heartbeat = (client) => {
                    console.log("Pong from client: "+ client.id);
                    client.isAlive = true;
                };

                this._ws.on('pong', () => { heartbeat(this._ws) });
            }

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
            } catch (error) {
                /* Handele server side error */
                const details = error.details
                || (this._options.respondWithDetailedErrors ? getErrorPlainObject(err) : {});

                let rpcErrorCode = error.rpcErrorCode || 'GenericError';
                
                payload = [
                    MSG_CALLERROR,
                    msgId,
                    rpcErrorCode,
                    error.message,
                    details ?? {},
                ];
            }
        } catch (error) {
            /* Handele client side error */
            const details = error.details
            || (this._options.respondWithDetailedErrors ? getErrorPlainObject(err) : {});

            let rpcErrorCode = error.rpcErrorCode || 'GenericError';
            
            payload = [
                MSG_CALLERROR,
                msgId,
                rpcErrorCode,
                error.message,
                details ?? {},
            ];
        }

        this.sendRaw(JSON.stringify(payload));
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
            throw createRPCError("RpcFrameworkError", `Received CALLRESULT for unrecognised message ID: ${msgId}`, {
                msgId,
                result
            });
        }
    }

    _onCallError(msgId, errorCode, errorDescription, errorDetails) {
        const pendingCall = this._pendingCalls.get(msgId);
        if (pendingCall) {
            let errpayload = [
                MSG_CALLERROR,
                msgId, 
                errorCode, 
                errorDescription, 
                {
                    errorDetails
                }
            ];
            return pendingCall.resolve(errpayload);
        } else{
            throw createRPCError("RpcFrameworkError", `Received CALLERROR for unrecognised message ID: ${msgId}`, {
                msgId,
                errorCode,
                errorDescription,
                errorDetails
            });
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