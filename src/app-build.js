const express = require('express');
const run = require('./routes/rjr-iface');

let app;

function buildApp() {
    app = express();
    app.use(express.json());

    app.post('/rps/run/:run_id', run.buildAndRun);
    app.delete('/rps/run/:run_id', run.removeRun);
    app.post('/rps/run/:run_id/stop', run.stopRun);
    app.get('/rps/run/:run_id', run.runStatus);

    return app;
}

module.exports = buildApp;
