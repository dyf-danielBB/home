#!/bin/sh
set -u

status=0

fail() {
  printf '%s\n' "$1" >&2
  status=1
}

require_var() {
  var_name=$1
  eval "value=\${$var_name:-}"
  if [ -z "$value" ]; then
    fail "$var_name 缺少环境变量"
  fi
}

check_port() {
  var_name=$1
  eval "port=\${$var_name:-}"
  [ -n "$port" ] || return

  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      fail "端口 $port（$var_name）已占用"
    fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -Eq "[:.]$port([[:space:]]|$)"; then
      fail "端口 $port（$var_name）已占用"
    fi
  else
    fail "$var_name 无法检查端口 $port：缺少 lsof 或 ss"
  fi
}

if [ -z "${DLC_DATA_ROOT:-}" ]; then
  fail "DLC_DATA_ROOT 缺少环境变量"
elif ! mkdir -p "$DLC_DATA_ROOT" 2>/dev/null || [ ! -w "$DLC_DATA_ROOT" ]; then
  fail "DLC_DATA_ROOT 不可写：$DLC_DATA_ROOT"
fi

for var_name in DLC_PUID DLC_PGID BLOG_PORT PAN_PORT NAV_PORT WEB_PORT NAV_AUTH_PORT NAV_PASSWORD_HASH; do
  require_var "$var_name"
done

if [ "$status" -eq 0 ]; then
  if ! docker compose config >/dev/null 2>&1; then
    fail "DLC_DATA_ROOT：docker compose config 检查失败"
  fi
fi

if [ "$status" -eq 0 ]; then
  for var_name in BLOG_PORT PAN_PORT NAV_PORT WEB_PORT NAV_AUTH_PORT; do
    check_port "$var_name"
  done
fi

exit "$status"
