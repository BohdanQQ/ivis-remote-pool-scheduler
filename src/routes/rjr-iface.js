const scheduler = require('../lib/scheduler-process');
const log = require('../lib/log').getLogger('rjr-interface');

function isResponseOk(response) {
    return response.data !== undefined && typeof response.status === 'number';
}

async function commonParseProxyCheck(request, proxyFn) {
    const runId = parseInt(request.params.run_id, 10);
    const schedulerResponse = await proxyFn(request, runId);

    if (!isResponseOk(schedulerResponse)) {
        return {
            success: false,
            schedulerResponse,
        };
    }
    return {
        success: true,
        schedulerResponse,
    };
}

async function proxyWith(request, response, proxyFn) {
    const { success, schedulerResponse } = await commonParseProxyCheck(request, proxyFn);
    if (!success) {
        log.error('Scheduler responded in an unexpected way:', schedulerResponse);
        response.status(503);
        response.json({
            error: 'Pool scheduler responded in an unexpected way',
        });
        return;
    }

    response.status(schedulerResponse.status);
    response.json(schedulerResponse.data);
}

async function runStatus(request, response) {
    await proxyWith(request, response, scheduler.proxyStatus);
}

async function buildAndRun(request, response) {
    await proxyWith(request, response, scheduler.proxyRunBuild);
}

async function removeRun(request, response) {
    await proxyWith(request, response, scheduler.proxyRemoveRun);
}

async function stopRun(request, response) {
    await proxyWith(request, response, scheduler.proxyStop);
}

module.exports = {
    runStatus, buildAndRun, removeRun, stopRun,
};
