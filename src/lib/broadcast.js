const { default: axios } = require('axios');
const config = require('./config');
const log = require('./log').getLogger('broadcast');

async function broadcastRemoveTask(request, response) {
    if (!request.params.task_id) {
        response.status(400);
        response.send('');
        return;
    }

    const taskId = request.params.task_id;

    const responses = (await Promise.all(config.rps.peerIPs.map((ip) => axios.delete(`http://${ip}:${config.rps.peerRJRPort}/task/${taskId}`, {
        validateStatus() {
            return true; // Resolve all responses
        },
    }).catch(() => null)))).filter((x) => x !== null); // ignore hard errors

    if (responses.length > 0) {
        const idxOfSuccess = responses.indexOf((resp) => resp.status === 200);
        const responseTouse = idxOfSuccess !== -1 ? responses[idxOfSuccess] : responses[0];
        log.log(`got response index: ${idxOfSuccess}`);
        response.status(responseTouse.status);
        response.json(responseTouse.data);
    }
    response.status(503);
    response.send({
        message: 'no peer reachable',
    });
}

module.exports = {
    broadcastRemoveTask,
};
