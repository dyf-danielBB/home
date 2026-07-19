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

require_port() {
  var_name=$1
  eval "port=\${$var_name:-}"
  [ -n "$port" ] || return
  case $port in
    *[!0-9]*) fail "$var_name 必须是 1 到 65535 的十进制端口"; return ;;
  esac
  if [ "$port" -lt 1 ] 2>/dev/null || [ "$port" -gt 65535 ] 2>/dev/null; then
    fail "$var_name 必须是 1 到 65535 的十进制端口"
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

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
deploy_directory=$(CDPATH= cd "$script_directory/.." && pwd -P) || {
  printf '%s\n' '无法定位 deploy 目录' >&2
  exit 1
}
environment_file=$deploy_directory/.env
compose_file=$deploy_directory/compose.yml

if [ ! -f "$environment_file" ]; then
  fail "缺少 $environment_file；请先从 env.example 创建"
else
  # shellcheck disable=SC1090
  . "$environment_file"
fi
[ -f "$compose_file" ] || fail "缺少 $compose_file"

for var_name in BLOG_PORT NAV_PORT NAV_AUTH_PORT NAV_USERNAME NAV_PASSWORD_HASH; do
  require_var "$var_name"
done
for var_name in BLOG_PORT NAV_PORT NAV_AUTH_PORT; do
  require_port "$var_name"
done

if [ "$status" -eq 0 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    fail "docker compose 不可用：未找到 docker 命令"
  else
    compose_output=$(docker compose --env-file "$environment_file" -f "$compose_file" config --quiet 2>&1)
    compose_status=$?
    if [ "$compose_status" -ne 0 ]; then
      fail "docker compose config 检查失败：${compose_output:-未提供诊断信息}"
    fi
  fi
fi

if [ "$status" -eq 0 ]; then
  for var_name in BLOG_PORT NAV_PORT NAV_AUTH_PORT; do
    check_port "$var_name"
  done
fi

exit "$status"
