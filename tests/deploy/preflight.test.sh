#!/bin/sh
set -eu

output=$(DLC_DATA_ROOT=/dev/null/dlc-data BLOG_PORT=3101 PAN_PORT=3102 NAV_PORT=3103 WEB_PORT=3104 NAV_AUTH_PORT=3105 sh deploy/scripts/preflight.sh 2>&1 || true)
printf '%s' "$output" | grep 'DLC_DATA_ROOT 不可写'
