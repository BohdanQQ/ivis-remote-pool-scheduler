const RemoteRunState = {
    SUCCESS: 0,
    RUN_FAIL: 2,
    RUNNING: 3,
    QUEUED: 4,
};
Object.freeze(RemoteRunState);

const HandlerMsgType = {
    BUILD: 0,
    RUN: 1,
    STOP: 2,
};
Object.freeze(HandlerMsgType);

const RequestType = {
    CREATE_SIG: 0,
    STORE_STATE: 1,
};
Object.freeze(RequestType);

const EventTypes = {
    RUN_OUTPUT: 'output',
    INIT: 'init',
    STOP: 'stop',
    FAIL: 'fail',
    SUCCESS: 'success',
    ACCESS_TOKEN: 'access_token',
    ACCESS_TOKEN_REFRESH: 'access_token_refresh',
};
Object.freeze(EventTypes);

module.exports = {
    RemoteRunState,
    HandlerMsgType,
    RequestType,
    EventTypes,
};
