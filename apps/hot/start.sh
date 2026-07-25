#!/bin/sh
cd "$(dirname "$0")"
export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:$PATH
export NODE_ENV=production
export PORT=3106
exec node server.js
