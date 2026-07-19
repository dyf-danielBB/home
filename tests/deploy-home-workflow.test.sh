#!/bin/sh
set -eu

test -f AGENTS.md
test -f docs/workflows/home-deployment.md
test -x scripts/deploy-home.sh

grep -q 'scripts/deploy-home.sh' AGENTS.md
grep -q '192.168.1.210' docs/workflows/home-deployment.md
grep -q '/volume1/web/home' docs/workflows/home-deployment.md
grep -q '22445' docs/workflows/home-deployment.md

sh -n scripts/deploy-home.sh
help_output=$(scripts/deploy-home.sh --help)
printf '%s\n' "$help_output" | grep -q '个人主页发布脚本'
printf '%s\n' "$help_output" | grep -q 'HOME_DEPLOY_HOST'

grep -q 'pnpm build' scripts/deploy-home.sh
grep -q 'home-backups' scripts/deploy-home.sh
grep -q 'Cache-Control: no-cache' scripts/deploy-home.sh
grep -q '不主动删除' docs/workflows/home-deployment.md

if grep -REn '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_[A-Za-z0-9]+|auth\.token[[:space:]]*=)' \
  AGENTS.md docs/workflows/home-deployment.md scripts/deploy-home.sh; then
  echo '检测到不应提交的凭据' >&2
  exit 1
fi
