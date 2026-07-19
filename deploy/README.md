# DLC 空间第一阶段部署

本目录只编排第一阶段已经完成的博客、起始页和起始页认证网关。网盘与网址集不在本阶段 Compose 中；`env.example` 中的对应端口和域名仅为第二阶段预检保留。

## 本地验证边界

当前开发机没有安装 Docker 和 Caddy，因此本地只能执行 YAML 结构、安全白名单、相对路径和文档契约测试：

```sh
node --test tests/deploy/phase1-compose.test.mjs
git diff --check
```

`docker compose config`、镜像拉取和构建、容器健康状态、博客 HTTP 响应、认证网关的未认证 `401` 与认证后 `200` 都属于 NAS 待验证项。本地静态测试通过不能替代这些运行时验收。

## NAS 目录与环境准备

必须把完整仓库放在 NAS 上，保留 `deploy/`、`apps/blog/` 和 `apps/nav/` 的相对位置；只复制 `deploy/` 会导致构建上下文和只读配置卷失效。以下示例假设仓库位于 `/volume1/docker/dlc-space/source`：

```sh
cd /volume1/docker/dlc-space/source/deploy
test ! -e .env || {
  echo ".env 已存在，拒绝覆盖；请先单独备份或继续使用现有文件。" >&2
  exit 1
}
cp env.example .env
chmod 600 .env
```

编辑 `.env`，设置实际端口和域名。第一阶段 Compose 使用 `BLOG_PORT`、`NAV_PORT`、`NAV_AUTH_PORT`、`NAV_USERNAME`、`NAV_PASSWORD_HASH`、`HOMEPAGE_VAR_LATITUDE` 和 `HOMEPAGE_VAR_LONGITUDE`；`PAN_PORT`、`WEB_PORT` 及其域名留待第二阶段使用。`NAV_AUTH_BIND_ADDRESS` 默认是 `127.0.0.1`，认证端口不会直接暴露到局域网。

交互式生成 Caddy 密码哈希，避免把明文密码写入命令历史：

```sh
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

将用户名和输出的完整哈希写入 `.env`。哈希包含 `$`，请使用单引号保留原值，例如：

```dotenv
NAV_USERNAME=your-private-username
NAV_PASSWORD_HASH='<粘贴刚生成的完整哈希>'
```

不要提交 `.env`、真实用户名、密码或密码哈希。尤其不要把明文 `NAV_PASSWORD` 写进 `.env`；它只用于一次运行时验收。

## 配置检查与启动

在 `deploy/` 目录执行：

```sh
./scripts/preflight.sh
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
```

Compose 中的相对路径都以 `deploy/compose.yml` 所在目录解析：博客构建上下文为 `../apps/blog`，起始页配置和图标分别来自 `../apps/nav/config` 与 `../apps/nav/config/icons`，Caddy 配置来自 `./auth/Caddyfile`。

## 反向代理端口

- 博客域名反向代理到 NAS 的 `3101`（或 `BLOG_PORT` 的值）。
- 起始页域名只反向代理到认证网关 `3105`（或 `NAV_AUTH_PORT` 的值）。默认的 `NAV_AUTH_BIND_ADDRESS=127.0.0.1` 适用于 NAS 自带反向代理或同一主机上的代理进程。
- 起始页原始端口 `127.0.0.1:${NAV_PORT:-3103}` 仅绑定 NAS 本机，不应直接对外代理或放行防火墙。

如果反向代理运行在另一个容器且无法访问宿主机回环地址，可以把 `NAV_AUTH_BIND_ADDRESS` 改成 NAS 的指定局域网地址；确实需要设为 `0.0.0.0` 时，必须同时用 NAS 防火墙把 `NAV_AUTH_PORT` 限制为仅代理来源可访问。无论哪种情况，都不要把原始 `NAV_PORT` 暴露出去。

## 健康与访问检查

先确认三个服务都显示 `healthy`：

```sh
docker compose --env-file .env -f compose.yml ps
docker inspect --format '{{.State.Health.Status}}' dlc-blog dlc-nav dlc-nav-auth
```

再从 NAS 检查博客可访问，并确认认证网关在没有凭证时返回 `401`：

```sh
curl -fsS http://127.0.0.1:3101/ >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3105/)" = 401
```

若修改了端口，请把命令中的 `3101`、`3105` 换成 `.env` 的实际值。推荐直接运行只读冒烟脚本；未提供明文密码时，脚本会在交互终端中无回显读取：

```sh
./scripts/smoke-test.sh
```

自动化环境可先通过受控的秘密读取工具取得密码，再只传给当前进程；不要在命令行中写密码字面量：

```sh
printf '%s' '请输入起始页明文密码（不会回显）：' >&2
saved_stty=$(stty -g)
stty -echo
IFS= read -r NAV_PASSWORD
stty "$saved_stty"
printf '\n' >&2
NAV_PASSWORD="${NAV_PASSWORD}" ./scripts/smoke-test.sh
unset NAV_PASSWORD saved_stty
```

脚本会确认博客 `200`、起始页匿名 `401` 和认证后 `200`。明文仅存在于当前 shell 和脚本内存，不写入 `.env`、仓库或共享日志。

## 回退

先把引号内的占位值替换为已经部署验证过的稳定提交 SHA。下面先在独立 worktree 中检查目标文件、Compose、博客构建和 Caddy 配置；这些易失败步骤全部通过后才停止当前服务。任何停服前检查失败都会保持现有服务运行：

```sh
cd /volume1/docker/dlc-space/source
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_DEPLOY=$(pwd -P)/deploy
STABLE_COMMIT='REPLACE_WITH_STABLE_COMMIT_SHA'
ROLLBACK_CHECKOUT=$(mktemp -d /tmp/dlc-rollback.XXXXXX)
git rev-parse --verify "${STABLE_COMMIT}^{commit}" >/dev/null || {
  echo "稳定提交无效，拒绝停止现有服务：$STABLE_COMMIT" >&2
  exit 1
}
git worktree add --detach "$ROLLBACK_CHECKOUT" "$STABLE_COMMIT"
test -f "$ROLLBACK_CHECKOUT/deploy/compose.yml"
test -f "$ROLLBACK_CHECKOUT/apps/blog/Dockerfile"
test -f "$ROLLBACK_CHECKOUT/deploy/auth/Caddyfile"
cd "$ROLLBACK_CHECKOUT/deploy"
docker compose --env-file "$CURRENT_DEPLOY/.env" -f compose.yml config --quiet
docker compose --env-file "$CURRENT_DEPLOY/.env" -f compose.yml build dlc-blog
docker compose --env-file "$CURRENT_DEPLOY/.env" -f compose.yml run --rm --no-deps dlc-nav-auth \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
cd "$CURRENT_DEPLOY"
docker compose --env-file .env -f compose.yml down
cd ..
git switch --detach "$STABLE_COMMIT"
cd deploy
docker compose --env-file .env -f compose.yml up -d --build || {
  cd ..
  git switch --detach "$CURRENT_COMMIT"
  cd deploy
  docker compose --env-file .env -f compose.yml up -d --build
  echo "目标版本启动失败，已恢复原提交 $CURRENT_COMMIT" >&2
  exit 1
}
docker compose --env-file .env -f compose.yml ps
```

`.env` 不受 Git 管理；回退前应单独备份并确认其权限仍为仅管理员可读。确认回退版本健康后，可从仓库根目录运行 `git worktree remove "$ROLLBACK_CHECKOUT"` 清理临时验证目录。
