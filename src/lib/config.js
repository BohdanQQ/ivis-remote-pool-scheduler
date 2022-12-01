const path = require('path');
const confUtil = require('config').util;

const cfgPath = path.join(__dirname, '..', '..', 'config');
console.log(`Looking for config in: ${cfgPath}`);

const config = confUtil.loadFileConfigs(cfgPath);

module.exports = config;
