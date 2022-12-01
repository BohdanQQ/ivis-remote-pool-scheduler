#!/bin/bash

set -e

cd /opt/ivis-rps/ 
if [ "$#" -eq 1 ]; then
    npm run watch-docker
else
    node ./src/index.js
fi