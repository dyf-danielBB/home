#!/bin/sh
set -u

SMOKE_MAX_ATTEMPTS=${SMOKE_MAX_ATTEMPTS:-12}
SMOKE_RETRY_DELAY=${SMOKE_RETRY_DELAY:-5}
SMOKE_COMMAND_TIMEOUT=${SMOKE_COMMAND_TIMEOUT:-10}

fail() {
  printf '错误：%s\n' "$1" >&2
  exit 1
}

require_value() {
  variable_name=$1
  variable_value=$2
  [ -n "$variable_value" ] || fail "缺少凭证 $variable_name；此脚本仅用于 NAS 运行时验收"
}

require_positive_decimal() {
  variable_name=$1
  variable_value=$2
  case $variable_value in
    ""|*[!0-9]*) fail "$variable_name 必须是大于 0 的十进制正整数" ;;
  esac
  [ "$variable_value" -gt 0 ] 2>/dev/null ||
    fail "$variable_name 必须是大于 0 的十进制正整数"
}

escape_curl_config_value() {
  LC_ALL=C sed 's/\\/\\\\/g; s/"/\\"/g'
}

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
deploy_directory=$(CDPATH= cd "$script_directory/.." && pwd -P) ||
  fail "无法定位 deploy 目录"
environment_file=$deploy_directory/.env

require_positive_decimal SMOKE_MAX_ATTEMPTS "$SMOKE_MAX_ATTEMPTS"
require_positive_decimal SMOKE_COMMAND_TIMEOUT "$SMOKE_COMMAND_TIMEOUT"

printf '%s\n' '开始 NAS 第一阶段只读冒烟验收（不会删除或重启容器）。'

command -v timeout >/dev/null 2>&1 ||
  fail "未找到 timeout 命令；请在 NAS 上安装后重试"
command -v docker >/dev/null 2>&1 ||
  fail "未找到 Docker；请仅在已安装 Docker 的 NAS 上执行"
timeout "$SMOKE_COMMAND_TIMEOUT" docker info >/dev/null 2>&1 ||
  fail "Docker 不可用；请在 NAS 上确认 Docker 服务正常"
[ -f "$environment_file" ] ||
  fail "缺少 $environment_file；请先在 NAS 配置 deploy/.env"

# shellcheck disable=SC1090
. "$environment_file"

nav_username=${NAV_USERNAME:-}
nav_password=${NAV_PASSWORD:-}
nav_password_hash=${NAV_PASSWORD_HASH:-}
require_value NAV_USERNAME "$nav_username"
require_value NAV_PASSWORD "$nav_password"
require_value NAV_PASSWORD_HASH "$nav_password_hash"
unset NAV_USERNAME NAV_PASSWORD NAV_PASSWORD_HASH nav_password_hash
command -v curl >/dev/null 2>&1 ||
  fail "未找到 curl；请在 NAS 上安装后重试"
command -v sed >/dev/null 2>&1 ||
  fail "未找到 sed；请在 NAS 上安装后重试"

curl_basic_user=$(printf '%s' "$nav_username:$nav_password" | escape_curl_config_value) ||
  fail "无法准备认证配置"

blog_port=${BLOG_PORT:-3101}
nav_auth_port=${NAV_AUTH_PORT:-3105}

attempt=1
while [ "$attempt" -le "$SMOKE_MAX_ATTEMPTS" ]; do
  all_healthy=1
  for container_name in dlc-blog dlc-nav dlc-nav-auth; do
    health_status=$(timeout "$SMOKE_COMMAND_TIMEOUT" docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_name" 2>/dev/null) ||
      health_status=missing
    [ "$health_status" = healthy ] || all_healthy=0
  done

  if [ "$all_healthy" -eq 1 ]; then
    printf '%s\n' '三个容器均已健康。'
    break
  fi

  if [ "$attempt" -eq "$SMOKE_MAX_ATTEMPTS" ]; then
    fail "三个容器未在合理时间内全部达到 healthy"
  fi
  sleep "$SMOKE_RETRY_DELAY"
  attempt=$((attempt + 1))
done

wait_for_http_status() {
  expected_status=$1
  check_label=$2
  authentication_mode=$3
  check_url=$4
  request_attempt=1

  while [ "$request_attempt" -le "$SMOKE_MAX_ATTEMPTS" ]; do
    if [ "$authentication_mode" = basic ]; then
      response_status=$(printf 'user = "%s"\n' "$curl_basic_user" | \
        curl --config - --silent --show-error --output /dev/null --write-out '%{http_code}' \
          --connect-timeout 3 --max-time 10 "$check_url" 2>/dev/null) ||
        response_status=000
    else
      response_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
        --connect-timeout 3 --max-time 10 "$check_url" 2>/dev/null) ||
        response_status=000
    fi

    if [ "$response_status" = "$expected_status" ]; then
      printf '%s\n' "$check_label 返回 $expected_status。"
      return 0
    fi

    [ "$request_attempt" -lt "$SMOKE_MAX_ATTEMPTS" ] ||
      fail "$check_label 未返回预期 HTTP 状态 $expected_status"
    sleep "$SMOKE_RETRY_DELAY"
    request_attempt=$((request_attempt + 1))
  done
}

wait_for_http_status 200 "博客 ${blog_port}" anonymous "http://127.0.0.1:${blog_port}/"
wait_for_http_status 401 "起始页 ${nav_auth_port} 匿名访问" anonymous "http://127.0.0.1:${nav_auth_port}/"
wait_for_http_status 200 "认证访问 ${nav_auth_port}" basic "http://127.0.0.1:${nav_auth_port}/"

printf '%s\n' 'NAS 第一阶段冒烟验收通过。'
