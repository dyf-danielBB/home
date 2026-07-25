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

require_retry_delay() {
  variable_value=$1
  case $variable_value in
    ""|*[!0-9]*) fail "SMOKE_RETRY_DELAY 必须是 0 到 60 的十进制整数" ;;
  esac
  normalized_delay=$variable_value
  while [ "$normalized_delay" != 0 ] && [ "${normalized_delay#0}" != "$normalized_delay" ]; do
    normalized_delay=${normalized_delay#0}
  done
  case $normalized_delay in
    [0-9]|[1-5][0-9]|60) ;;
    *) fail "SMOKE_RETRY_DELAY 必须是 0 到 60 的十进制整数" ;;
  esac
  unset normalized_delay
}

reject_credential_line_breaks() {
  variable_name=$1
  variable_value=$2
  sanitized_value=$(printf '%s' "$variable_value" | LC_ALL=C tr -d '\r\n') ||
    fail "无法校验 $variable_name"
  [ "$sanitized_value" = "$variable_value" ] ||
    fail "$variable_name 不得包含 CR 回车或 LF 换行"
  unset sanitized_value
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
runtime_nav_password=${NAV_PASSWORD:-}
unset NAV_PASSWORD

require_positive_decimal SMOKE_MAX_ATTEMPTS "$SMOKE_MAX_ATTEMPTS"
require_positive_decimal SMOKE_COMMAND_TIMEOUT "$SMOKE_COMMAND_TIMEOUT"
require_retry_delay "$SMOKE_RETRY_DELAY"

printf '%s\n' '开始 NAS 第一阶段只读冒烟验收（不会删除或重启容器）。'

command -v timeout >/dev/null 2>&1 ||
  fail "未找到 timeout 命令；请在 NAS 上安装后重试"
command -v docker >/dev/null 2>&1 ||
  fail "未找到 Docker；请仅在已安装 Docker 的 NAS 上执行"
[ -f "$environment_file" ] ||
  fail "缺少 $environment_file；请先在 NAS 配置 deploy/.env"

while IFS= read -r environment_line || [ -n "$environment_line" ]; do
  normalized_line=$environment_line
  while [ "${normalized_line# }" != "$normalized_line" ] || [ "${normalized_line#	}" != "$normalized_line" ]; do
    normalized_line=${normalized_line#?}
  done
  case $normalized_line in
    export[[:space:]]NAV_PASSWORD=*|NAV_PASSWORD=*)
      fail "deploy/.env 不得保存 NAV_PASSWORD 明文；请通过进程环境传入或使用交互输入"
      ;;
  esac
done < "$environment_file"
unset environment_line normalized_line

# shellcheck disable=SC1090
. "$environment_file"

require_positive_decimal SMOKE_MAX_ATTEMPTS "$SMOKE_MAX_ATTEMPTS"
require_positive_decimal SMOKE_COMMAND_TIMEOUT "$SMOKE_COMMAND_TIMEOUT"
require_retry_delay "$SMOKE_RETRY_DELAY"
timeout "$SMOKE_COMMAND_TIMEOUT" docker info >/dev/null 2>&1 ||
  fail "Docker 不可用；请在 NAS 上确认 Docker 服务正常"

nav_username=${NAV_USERNAME:-}
nav_password=${runtime_nav_password}
nav_password_hash=${NAV_PASSWORD_HASH:-}
unset runtime_nav_password NAV_USERNAME NAV_PASSWORD NAV_PASSWORD_HASH
require_value NAV_USERNAME "$nav_username"
require_value NAV_PASSWORD_HASH "$nav_password_hash"
unset nav_password_hash
if [ -z "$nav_password" ]; then
  [ -t 0 ] || fail "缺少 NAV_PASSWORD；请仅通过进程环境传入，或在交互终端无回显输入"
  command -v stty >/dev/null 2>&1 || fail "无法安全读取 NAV_PASSWORD：缺少 stty"
  saved_stty=$(stty -g) || fail "无法读取终端状态"
  printf '%s' '请输入起始页明文密码（不会回显）：' >&2
  stty -echo || fail "无法关闭终端回显"
  IFS= read -r nav_password || {
    stty "$saved_stty"
    fail "读取 NAV_PASSWORD 失败"
  }
  stty "$saved_stty" || fail "无法恢复终端回显"
  printf '\n' >&2
  unset saved_stty
fi
require_value NAV_PASSWORD "$nav_password"
command -v tr >/dev/null 2>&1 ||
  fail "未找到 tr；请在 NAS 上安装后重试"
reject_credential_line_breaks NAV_USERNAME "$nav_username"
reject_credential_line_breaks NAV_PASSWORD "$nav_password"
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
  request_host=${5:-}
  request_attempt=1

  while [ "$request_attempt" -le "$SMOKE_MAX_ATTEMPTS" ]; do
    if [ "$authentication_mode" = basic ]; then
      response_status=$(printf 'user = "%s"\n' "$curl_basic_user" | \
        curl --disable --config - --silent --show-error --output /dev/null --write-out '%{http_code}' \
          --connect-timeout 3 --max-time 10 --header "Host: $request_host" "$check_url" 2>/dev/null) ||
        response_status=000
    elif [ -n "$request_host" ]; then
      response_status=$(curl --disable --silent --show-error --output /dev/null --write-out '%{http_code}' \
        --connect-timeout 3 --max-time 10 --header "Host: $request_host" "$check_url" 2>/dev/null) ||
        response_status=000
    else
      response_status=$(curl --disable --silent --show-error --output /dev/null --write-out '%{http_code}' \
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
wait_for_http_status 401 "起始页 ${nav_auth_port} 匿名访问" anonymous "http://127.0.0.1:${nav_auth_port}/" "nav.dailecheng.xyz"
wait_for_http_status 200 "认证访问 ${nav_auth_port}" basic "http://127.0.0.1:${nav_auth_port}/" "nav.dailecheng.xyz"

printf '%s\n' 'NAS 第一阶段冒烟验收通过。'
