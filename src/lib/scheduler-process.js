const { fork } = require('child_process');
const events = require('events');
const ProxyRequestTypes = require('./proxy-request-types');
const log = require('./log').getLogger('scheduler-process');

const workerSource = './src/sched/scheduler.js';
const workerProcess = fork(workerSource);

const emitter = new events.EventEmitter();

const reservedIds = new Set();

workerProcess.on('message', (message) => {
    if (!message.id || !message.payload) {
        log.error('Worker process message does not contain id or payoad fields: ', message);
        return;
    }
    if (!emitter.emit(message.id, message.payload)) {
        log.warn('Event: ', message, ' did not have any listeners registered!');
    }
});

function waitForWorkerResponseWithTimeout(id, timeoutSecs) {
    return new Promise((resolve, reject) => {
        const rejectionTimeout = setTimeout(() => {
            reject(new Error(`No response received after ${timeoutSecs} seconds`));
        }, timeoutSecs * 1000);
        emitter.once(id, (messagePayload) => {
            clearTimeout(rejectionTimeout);
            resolve(messagePayload);
        });
    });
}

function freeRequestId(id) {
    reservedIds.delete(id);
}

function randomString(length) {
    const alphabet = 'ABCDEFGHIJKLMOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890!@#$%^&*()-=_+';

    let result = '';
    for (let index = 0; index < length; index++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }

    return result;
}

function generateRequestId() {
    let id;
    do {
        id = randomString(8);
    } while (reservedIds.has(id));
    return id;
}

/**
 * Sends a message to the scheduler process, rejecting on error
 */
function promiseSend(proxyType, requestId, payload, runId) {
    return new Promise((resolve, reject) => {
        workerProcess.send({
            proxyType,
            id: requestId,
            payload,
            runId,
        }, (error) => {
            if (error === null) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

/** proxies the request to the scheduler process, resolves/rejects on scheduler response/error (or timeout) */
function proxyRequest(request, proxyType, runId) {
    const requestId = generateRequestId();
    reservedIds.add(requestId);
    return promiseSend(proxyType, requestId, request, runId)
        .then(() => waitForWorkerResponseWithTimeout(requestId, 5))
        .finally(() => freeRequestId(requestId));
}

/**
 * @param {Object} requestBody
 * @param {Number} runId
 * @returns {Promise< { status: Number, data: Object } >}
 */
function proxyRunBuild(requestBody, runId) {
    log.info('run');
    return proxyRequest(requestBody.body, ProxyRequestTypes.buildRun, runId);
}

/**
 * @param {Object} requestBody
 * @param {Number} runId
 * @returns {Promise< { status: Number, data: Object } >}
 */
function proxyStop(requestBody, runId) {
    log.info('stop');
    return proxyRequest(requestBody.body, ProxyRequestTypes.stop, runId);
}

/**
 * @param {Object} requestBody
 * @param {Number} runId
 * @returns {Promise< { status: Number, data: Object } >}
 */
function proxyStatus(requestBody, runId) {
    log.info('status');
    return proxyRequest(requestBody.body, ProxyRequestTypes.status, runId);
}

/**
 * @param {Object} requestBody
 * @param {Number} runId
 * @returns {Promise< { status: Number, data: Object } >}
 */
function proxyRemoveRun(requestBody, runId) {
    log.info('remove');
    return proxyRequest(requestBody.body, ProxyRequestTypes.removeRun, runId);
}

module.exports = {
    proxyRunBuild, proxyStop, proxyStatus, proxyRemoveRun,
};
