const express = require('express');
const rjr = require('./routes/rjr-iface');

let app;

function buildApp() {
    app = express();
    app.use(express.json());

    app.post('/rps/run/:run_id', rjr.buildAndRun);
    app.delete('/rps/run/:run_id', rjr.removeRun);
    app.post('/rps/run/:run_id/stop', rjr.stopRun);
    app.get('/rps/run/:run_id', rjr.runStatus);
    app.delete('/rps/task/:task_id', rjr.removeTask);

    return app;
}

module.exports = buildApp;
