const { default: axios } = require('axios');
const log = require('../lib/log').getLogger('scheduler');
const config = require('../lib/config');
const ProxyRequestTypes = require('../lib/proxy-request-types');

const { peerRJRPort } = config.rps;
const { peerIPs } = config.rps;

// Map<number, string> # id -> IP
const runIdToPeerIP = new Map();
// Map<string, number> # IP -> number of assigned job runs
const peerIPToNrOfAssignedRuns = new Map();

if (peerIPs.length === 0) {
    throw new Error("Asserting 'size of pool is >0' failed! 0 Peer IPs configured");
}

peerIPs.forEach((ip) => {
    peerIPToNrOfAssignedRuns.set(ip, 0);
});

process.on('message', handleRequest);

function sendResponseToId(id, response) {
    process.send({
        id,
        payload: response,
    });
}

function createErrorResponse(status, error) {
    return {
        status,
        data: {
            error: error instanceof Error ? error.message : error,
        },
    };
}

function isRequestCorrectFormat(request) {
    return typeof request.proxyType === 'number' && request.id && typeof request.runId === 'number' && request.payload && typeof request.id === 'string';
}

function proxyTypeExists(proxyType) {
    return [ProxyRequestTypes.buildRun, ProxyRequestTypes.removeRun, ProxyRequestTypes.status, ProxyRequestTypes.stop].indexOf(proxyType) !== -1;
}

function getProxyResolverByProxyType(proxyType) {
    switch (proxyType) {
    case ProxyRequestTypes.removeRun: return proxyRemoveRun;
    case ProxyRequestTypes.stop: return proxyStopRun;
    case ProxyRequestTypes.buildRun: return proxyStartRun;
    case ProxyRequestTypes.status: return proxyGetRunStatus;
    default:
        throw new Error(`Unknown proxy type ${proxyType}`);
    }
}

async function handleRequest(request) {
    // request should always contain an id...
    // otherwise error is logged and the request/response communication NEEDS to be fixed
    const sendResponse = (response) => sendResponseToId(request.id, response);
    if (!isRequestCorrectFormat(request)) {
        log.error('Invalid request format: ', request);
        if (request.id) sendResponse(createErrorResponse(400, 'Invalid request format received by scheduler process'));
        return;
    }
    const {
        payload, proxyType, runId,
    } = request;

    if (!proxyTypeExists(proxyType)) {
        sendResponse(createErrorResponse(400, `Invalid proxy type: ${proxyType}`));
        return;
    }

    try {
        const resolver = getProxyResolverByProxyType(proxyType);
        const peerIp = runIdToPeerIP.get(runId);
        if (peerIp === undefined && proxyType !== ProxyRequestTypes.buildRun) {
            throw new Error(`Peer corresponding to the run ${runId} not found`);
        }
        const response = await resolver(runId, peerIp, payload);
        sendResponse({
            status: response.status,
            data: response.data,
        });
    } catch (error) {
        log.error(error);
        sendResponse(createErrorResponse(503, error));
    }
}

const httpClient = axios.create();
const methodResolvers = {
    GET: httpClient.get,
    POST: httpClient.post,
    DELETE: httpClient.delete,
};

const RJRTargetGetters = {
    [ProxyRequestTypes.buildRun]: (runId) => ({
        path: `/run/${runId}`,
        method: 'POST',
    }),
    [ProxyRequestTypes.stop]: (runId) => ({
        path: `/run/${runId}/stop`,
        method: 'POST',
    }),
    [ProxyRequestTypes.removeRun]: (runId) => ({
        path: `/run/${runId}`,
        method: 'DELETE',
    }),
    [ProxyRequestTypes.status]: (runId) => ({
        path: `/run/${runId}`,
        method: 'GET',
    }),
};

async function proxyRemoveRun(runId, peerIP, requestBody) {
    const target = RJRTargetGetters[ProxyRequestTypes.removeRun](runId);
    const peerResponse = await proxyWithTarget(peerIP, target, requestBody);
    const { status } = peerResponse;

    if (status === 200) {
        try {
            registerRunTerminationInternally(runId);
        } catch (e) {
            log.error(e);
        }
    } else if (status === 404) {
        log.error(`[REMOVE RUN] Run ${runId} was not found on the corresponding peer.`);
    } else if (status === 503) {
        log.error(`[REMOVE RUN] Peer could not remove run: ${peerResponse.data.message}`);
    } else {
        log.error(`[REMOVE RUN] Proxy request resolved with status: ${status}`);
    }

    return peerResponse;
}

async function proxyGetRunStatus(runId, peerIP, requestBody) {
    const target = RJRTargetGetters[ProxyRequestTypes.status](runId);
    const peerResponse = await proxyWithTarget(peerIP, target, requestBody);
    const { status } = peerResponse;

    if (status === 404) {
        log.error(`[GET STATUS] Run ${runId} was not found on the corresponding peer.`);
    } else if (status !== 200) {
        log.error(`[GET STATUS] Proxy request resolved with status: ${status}`);
    }
    return peerResponse;
}

async function proxyStartRun(runId, peerIP, requestBody) {
    try {
        scheduleJobRunInternally(runId);
    } catch (e) {
        log.error(e);
        throw new Error(`could not schedule run (runid ${runId})`);
    }
    peerIP = runIdToPeerIP.get(runId);
    const target = RJRTargetGetters[ProxyRequestTypes.buildRun](runId);
    const peerResponse = await proxyWithTarget(peerIP, target, requestBody);
    const { status } = peerResponse;

    if (status === 503) {
        log.error(`[START RUN] Peer could not start run: ${peerResponse.data.message}`);
    } else if (status !== 200) {
        log.error(`[START RUN] Proxy request resolved with status: ${status}`);
    }

    return peerResponse;
}

async function proxyStopRun(runId, peerIP, requestBody) {
    const target = RJRTargetGetters[ProxyRequestTypes.stop](runId);
    const peerResponse = await proxyWithTarget(peerIP, target, requestBody);
    const { status } = peerResponse;

    if (status === 404) {
        log.error(`[STOP RUN] Run ${runId} was not found on the corresponding peer.`);
    } else if (status === 503) {
        log.error(`[STOP RUN] Peer could stop run: ${peerResponse.data.message}`);
    } else if (status !== 200) {
        log.error(`[STOP RUN] Proxy request resolved with status: ${status}`);
    }

    return peerResponse;
}

async function proxyWithTarget(peerIp, { path, method }, requestBody) {
    if (method === 'POST') {
        return await methodResolvers.POST(`http://${peerIp}:${peerRJRPort}${path}`, requestBody);
    }
    // GET, DELETE
    return await methodResolvers[method](`http://${peerIp}:${peerRJRPort}${path}`);
}

function modifyAssignedRuns(peerIP, mutator) {
    const currentVal = peerIPToNrOfAssignedRuns.get(peerIP);
    if (currentVal === undefined) {
        return false;
    }
    peerIPToNrOfAssignedRuns.set(peerIP, mutator(currentVal));
    return true;
}

function incrementAssignedRuns(peerIP) {
    if (!modifyAssignedRuns(peerIP, (x) => x + 1)) {
        log.warn(`Run Count increment failed: Peer with the IP ${peerIP} was not found!`);
    }
}

function decrementAssignedRuns(peerIP) {
    if (!modifyAssignedRuns(peerIP, (x) => {
        if (x <= 0) {
            log.warn('Run Count decrement on non-positive value!!!');
        }
        return x - 1;
    })) {
        log.warn(`Run Count decrement failed: Peer with the IP ${peerIP} was not found!`);
    }
}

/**
 * @returns {string} IP of the most suitable peer to handle a job run
 */
function getPeerForRunScheduling() {
    const { ip } = peerIPs.reduce(({ ip: oldIP, count }, ipNow) => {
        const runCount = peerIPToNrOfAssignedRuns.get(ipNow);
        if (runCount < count) {
            return {
                ip: ipNow,
                count: runCount,
            };
        }
        return {
            ip: oldIP,
            count,
        };
    }, { ip: null, count: Number.MAX_SAFE_INTEGER });

    // relies on |peerIPs| > 0
    return ip === null ? peerIPs[0] : ip;
}

function scheduleJobRunInternally(runId) {
    const peerIP = getPeerForRunScheduling();
    if (runIdToPeerIP.get(runId) !== undefined) {
        throw new Error(`RunID ${runId} already has a peer handling that run (${runIdToPeerIP.get(runId)})`);
    }

    runIdToPeerIP.set(runId, peerIP);
    incrementAssignedRuns(peerIP);
    log.info('Scheduled run ', runId, ' into the state:\n', runIdToPeerIP, '\nAssigned runs: ', peerIPToNrOfAssignedRuns);
}

function registerRunTerminationInternally(runId) {
    const peerIP = runIdToPeerIP.get(runId);
    if (peerIP === undefined) {
        throw new Error(`RunID ${runId} has no peer assigned!`);
    }
    runIdToPeerIP.delete(runId);
    decrementAssignedRuns(peerIP);
    log.info('Run termination request processed for', runId, ' into the state:\n', runIdToPeerIP, '\nAssigned runs: ', peerIPToNrOfAssignedRuns);
}

log.info('Scheduler process has started');
