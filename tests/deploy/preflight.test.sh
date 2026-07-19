#!/bin/sh
set -eu

output=$(DLC_DATA_ROOT=/dev/null/dlc-data BLOG_PORT=3101 PAN_PORT=3102 NAV_PORT=3103 WEB_PORT=3104 NAV_AUTH_PORT=3105 sh deploy/scripts/preflight.sh 2>&1 || true)
printf '%s' "$output" | grep 'DLC_DATA_ROOT 不可写'

test_root=$(mktemp -d)
trap 'rmdir "$test_root"' EXIT HUP INT TERM
config_env="DLC_DATA_ROOT=$test_root DLC_PUID=1000 DLC_PGID=1000 BLOG_PORT=3101 PAN_PORT=3102 NAV_PORT=3103 WEB_PORT=3104 NAV_AUTH_PORT=3105 NAV_PASSWORD_HASH=test"

output=$(env PATH="$(pwd)/tests/deploy/fixtures:/usr/bin:/bin:/usr/sbin:/sbin" $config_env sh deploy/scripts/preflight.sh 2>&1 || true)
printf '%s' "$output" | grep 'docker compose config 检查失败'
printf '%s' "$output" | grep 'fake compose diagnostic'

output=$(env PATH="/usr/bin:/bin:/usr/sbin:/sbin" $config_env sh deploy/scripts/preflight.sh 2>&1 || true)
printf '%s' "$output" | grep '未找到 docker 命令'
