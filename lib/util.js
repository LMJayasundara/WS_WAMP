const errors = require('./errors');

const rpcErrorLUT = {
    'GenericError'                  : errors.RPCGenericError,
    'NotImplemented'                : errors.RPCNotImplementedError,
    'NotSupported'                  : errors.RPCNotSupportedError,
    'InternalError'                 : errors.RPCInternalError,
    'ProtocolError'                 : errors.RPCProtocolError,
    'SecurityError'                 : errors.RPCSecurityError,
    'FormationViolation'            : errors.RPCFormationViolationError,
    'FormatViolation'               : errors.RPCFormatViolationError,
    'PropertyConstraintViolation'   : errors.RPCPropertyConstraintViolationError,
    'OccurenceConstraintViolation'  : errors.RPCOccurenceConstraintViolationError,
    'OccurrenceConstraintViolation' : errors.RPCOccurrenceConstraintViolationError,
    'TypeConstraintViolation'       : errors.RPCTypeConstraintViolationError,
    'MessageTypeNotSupported'       : errors.RPCMessageTypeNotSupportedError,
    'RpcFrameworkError'             : errors.RPCFrameworkError,
};

function createRPCError(type, message, details) {
    const E = rpcErrorLUT[type] ?? errors.RPCGenericError;
    const err = new E(message ?? '');
    err.details = details ?? {};
    return err;
}

module.exports = {
    createRPCError
};