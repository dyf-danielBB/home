#!/bin/sh
set -eu

project_root=$(pwd -P)
test_root=$(mktemp -d)
test_root=$(cd "$test_root" && pwd -P)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
mkdir -p "$test_root/deploy/scripts" "$test_root/bin"
cp "$project_root/deploy/scripts/preflight.sh" "$test_root/deploy/scripts/preflight.sh"
cp "$project_root/deploy/compose.yml" "$test_root/deploy/compose.yml"

cat >"$test_root/bin/docker" <<'EOF'
#!/bin/sh
printf 'docker:' >> "$PREFLIGHT_LOG"
for argument in "$@"; do printf '<%s>' "$argument" >> "$PREFLIGHT_LOG"; done
printf '\n' >> "$PREFLIGHT_LOG"
if [ "${PREFLIGHT_DOCKER_FAIL:-0}" = 1 ]; then
  printf '%s\n' 'fake compose diagnostic' >&2
  exit 42
fi
exit 0
EOF
chmod +x "$test_root/bin/docker"

cat >"$test_root/bin/lsof" <<'EOF'
#!/bin/sh
printf 'lsof:' >> "$PREFLIGHT_LOG"
for argument in "$@"; do printf '<%s>' "$argument" >> "$PREFLIGHT_LOG"; done
printf '\n' >> "$PREFLIGHT_LOG"
exit 1
EOF
chmod +x "$test_root/bin/lsof"

write_valid_env() {
  cat >"$test_root/deploy/.env" <<'EOF'
BLOG_PORT=3101
NAV_PORT=3103
NAV_AUTH_PORT=3105
NAV_USERNAME=fixture-user
NAV_PASSWORD_HASH=fixture-hash
EOF
}

write_valid_env
: >"$test_root/calls.log"
(cd /tmp && PATH="$test_root/bin:/usr/bin:/bin" PREFLIGHT_LOG="$test_root/calls.log" sh "$test_root/deploy/scripts/preflight.sh")
grep -F "docker:<compose><--env-file><$test_root/deploy/.env><-f><$test_root/deploy/compose.yml><config><--quiet>" "$test_root/calls.log"
grep '3101' "$test_root/calls.log"
grep '3103' "$test_root/calls.log"
grep '3105' "$test_root/calls.log"
! grep -E '3102|3104|PAN_PORT|WEB_PORT' "$test_root/calls.log"

sed '/^NAV_USERNAME=/d' "$test_root/deploy/.env" >"$test_root/deploy/.env.missing"
mv "$test_root/deploy/.env.missing" "$test_root/deploy/.env"
output=$(PATH="$test_root/bin:/usr/bin:/bin" PREFLIGHT_LOG="$test_root/calls.log" sh "$test_root/deploy/scripts/preflight.sh" 2>&1 || true)
printf '%s' "$output" | grep 'NAV_USERNAME 缺少环境变量'

write_valid_env
output=$(PATH="$test_root/bin:/usr/bin:/bin" PREFLIGHT_LOG="$test_root/calls.log" PREFLIGHT_DOCKER_FAIL=1 sh "$test_root/deploy/scripts/preflight.sh" 2>&1 || true)
printf '%s' "$output" | grep 'docker compose config 检查失败'
printf '%s' "$output" | grep 'fake compose diagnostic'

output=$(PATH="/usr/bin:/bin" sh "$test_root/deploy/scripts/preflight.sh" 2>&1 || true)
printf '%s' "$output" | grep '未找到 docker 命令'
