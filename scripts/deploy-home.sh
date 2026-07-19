#!/bin/sh
set -eu

show_help() {
  cat <<'EOF'
个人主页发布脚本

用法：
  scripts/deploy-home.sh
  scripts/deploy-home.sh --help

可覆盖的环境变量：
  HOME_DEPLOY_HOST   NAS 地址，默认 192.168.1.210
  HOME_DEPLOY_USER   NAS 用户，默认 dyf8430
  HOME_DEPLOY_DIR    线上目录，默认 /volume1/web/home
  HOME_BACKUP_DIR    备份目录，默认 /volume1/web/home-backups
  HOME_ORIGIN_URL    NAS 源站，默认 http://127.0.0.1:12445/
  HOME_PUBLIC_URL    正式域名，默认 https://home.dailecheng.xyz/
  HOME_SSH_KEY       SSH 私钥，默认 ~/.ssh/id_ed25519

脚本会依次构建、备份、上传并验证 NAS 源站和正式域名。
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  show_help
  exit 0
fi

if [ "$#" -ne 0 ]; then
  echo "不支持的参数：$1" >&2
  show_help >&2
  exit 2
fi

HOME_DEPLOY_HOST=${HOME_DEPLOY_HOST:-192.168.1.210}
HOME_DEPLOY_USER=${HOME_DEPLOY_USER:-dyf8430}
HOME_DEPLOY_DIR=${HOME_DEPLOY_DIR:-/volume1/web/home}
HOME_BACKUP_DIR=${HOME_BACKUP_DIR:-/volume1/web/home-backups}
HOME_ORIGIN_URL=${HOME_ORIGIN_URL:-http://127.0.0.1:12445/}
HOME_PUBLIC_URL=${HOME_PUBLIC_URL:-https://home.dailecheng.xyz/}
HOME_SSH_KEY=${HOME_SSH_KEY:-${HOME}/.ssh/id_ed25519}

for command_name in pnpm ssh tar curl rg git; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "缺少命令：$command_name" >&2
    exit 1
  }
done

test -f "$HOME_SSH_KEY" || {
  echo "SSH 私钥不存在：$HOME_SSH_KEY" >&2
  exit 1
}

case "$HOME_DEPLOY_HOST" in *[!A-Za-z0-9._:-]*) echo "NAS 地址包含非法字符" >&2; exit 1;; esac
case "$HOME_DEPLOY_USER" in *[!A-Za-z0-9._-]*) echo "NAS 用户名包含非法字符" >&2; exit 1;; esac
case "$HOME_DEPLOY_DIR" in *[!A-Za-z0-9._/-]*) echo "线上目录包含非法字符" >&2; exit 1;; esac
case "$HOME_BACKUP_DIR" in *[!A-Za-z0-9._/-]*) echo "备份目录包含非法字符" >&2; exit 1;; esac

echo "[1/6] 构建生产版本"
pnpm build

test -f dist/index.html || {
  echo "构建产物缺少 dist/index.html" >&2
  exit 1
}

asset_path=$(rg -o '/assets/index-[a-f0-9]+\.js' dist/index.html | sed -n '1p')
test -n "$asset_path" || {
  echo "无法从 dist/index.html 解析 JavaScript 资源" >&2
  exit 1
}

asset_file="dist$asset_path"
test -f "$asset_file" || {
  echo "构建资源不存在：$asset_file" >&2
  exit 1
}

rg -q '相册集' "$asset_file" || {
  echo "构建资源未包含相册集文案" >&2
  exit 1
}
rg -q 'https://me\.dailecheng\.xyz/' "$asset_file" || {
  echo "构建资源未包含相册集链接" >&2
  exit 1
}

deploy_stamp=$(date '+%Y%m%d-%H%M%S')
backup_path="$HOME_BACKUP_DIR/home-before-$deploy_stamp.tar.gz"
ssh_target="$HOME_DEPLOY_USER@$HOME_DEPLOY_HOST"

echo "[2/6] 备份 NAS 当前版本"
ssh -i "$HOME_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$ssh_target" \
  "set -eu; mkdir -p '$HOME_BACKUP_DIR'; tar -czf '$backup_path' -C '$HOME_DEPLOY_DIR' .; test -s '$backup_path'"

echo "[3/6] 上传新构建（不主动删除旧哈希资源）"
tar --no-xattrs -cf - -C dist . | \
  ssh -i "$HOME_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$ssh_target" \
    "set -eu; cd '$HOME_DEPLOY_DIR'; tar -xf -; test -f 'index.html'; test -f '${asset_path#/}'"

echo "[4/6] 验证 NAS 源站"
ssh -i "$HOME_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$ssh_target" \
  "set -eu; origin_html=\$(curl -fsSL --max-time 15 '$HOME_ORIGIN_URL'); printf '%s' \"\$origin_html\" | grep -q '$asset_path'; curl -fsSL --max-time 15 '${HOME_ORIGIN_URL%/}$asset_path' | grep -q 'https://me.dailecheng.xyz/'"

echo "[5/6] 验证正式域名"
public_html=$(curl -fsSL --max-time 20 -H 'Cache-Control: no-cache' "${HOME_PUBLIC_URL}?deploy=$deploy_stamp")
printf '%s' "$public_html" | rg -q "$asset_path"
curl -fsSL --max-time 20 -H 'Cache-Control: no-cache' \
  "${HOME_PUBLIC_URL%/}$asset_path?deploy=$deploy_stamp" | rg -q 'https://me\.dailecheng\.xyz/'

git_revision=$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')
echo "[6/6] 发布完成"
printf 'Git 提交：%s\n' "$git_revision"
printf 'NAS 备份：%s\n' "$backup_path"
printf '线上资源：%s\n' "$asset_path"
printf '正式域名：%s\n' "$HOME_PUBLIC_URL"
