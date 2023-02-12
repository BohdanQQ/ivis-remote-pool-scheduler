// TODO: change... (trace, debug, ... levels instead of log, ...)
function getLogger(logID) {
    return {
        log: (...args) => console.log(logID, '|', ...args),
        info: (...args) => console.info(logID, '|', ...args),
        warn: (...args) => console.warn(logID, '|', ...args),
        error: (...args) => console.error(logID, '|', ...args),
    };
}

module.exports = { getLogger };
