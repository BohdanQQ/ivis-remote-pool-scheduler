const config = require('./lib/config');
const appBuild = require('./app-build');
const log = require('./lib/log').getLogger("main");

async function main() {
    const app = appBuild();

    const host = '0.0.0.0';

    app.listen(config.rps.port, host, () => {
        log.info(`IVIS Pool Scheduler is listening on ${host}:${config.rps.port}`);
    });
}

main();
