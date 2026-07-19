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
cp env.example .env
chmod 600 .env
```

编辑 `.env`，设置实际端口和域名。第一阶段 Compose 使用 `BLOG_PORT`、`NAV_PORT`、`NAV_AUTH_PORT`、`HOMEPAGE_VAR_LATITUDE` 和 `HOMEPAGE_VAR_LONGITUDE`；`PAN_PORT`、`WEB_PORT` 及其域名留待第二阶段使用。

交互式生成 Caddy 密码哈希，避免把明文密码写入命令历史：

```sh
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

将用户名和输出的完整哈希写入 `.env`。哈希包含 `$`，请使用单引号保留原值，例如：

```dotenv
NAV_USERNAME=your-private-username
NAV_PASSWORD_HASH='<粘贴刚生成的完整哈希>'
```

不要提交 `.env`、真实用户名、密码或密码哈希。

## 配置检查与启动

在 `deploy/` 目录执行：

```sh
docker compose --env-file .env -f compose.yml config
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
```

Compose 中的相对路径都以 `deploy/compose.yml` 所在目录解析：博客构建上下文为 `../apps/blog`，起始页配置和图标分别来自 `../apps/nav/config` 与 `../apps/nav/config/icons`，Caddy 配置来自 `./auth/Caddyfile`。

## 反向代理端口

- 博客域名反向代理到 NAS 的 `3101`（或 `BLOG_PORT` 的值）。
- 起始页域名只反向代理到认证网关 `3105`（或 `NAV_AUTH_PORT` 的值）。
- 起始页原始端口 `127.0.0.1:${NAV_PORT:-3103}` 仅绑定 NAS 本机，不应直接对外代理或放行防火墙。

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

若修改了端口，请把命令中的 `3101`、`3105` 换成 `.env` 的实际值。认证后的 `200` 应使用本地安全读取的用户名和明文密码手工验证，不要把凭证写入仓库或共享日志。

## 回退

先记录当前稳定提交。部署失败时，在 NAS 上停止本阶段服务，切换到上一稳定提交，再从该提交的 `deploy/` 目录重新启动：

```sh
cd /volume1/docker/dlc-space/source/deploy
docker compose --env-file .env -f compose.yml down
cd ..
git switch --detach <上一稳定提交>
cd deploy
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
```

`.env` 不受 Git 管理；回退前应单独备份并确认其权限仍为仅管理员可读。
