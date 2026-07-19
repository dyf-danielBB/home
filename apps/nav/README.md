# DLC 起始页独立部署

此目录可独立启动 Homepage 与 Caddy 认证网关。复制 `env.example` 为 `.env`，填写 `NAV_USERNAME` 和由 `caddy hash-password` 生成的 `NAV_PASSWORD_HASH`，然后运行：

```sh
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d
```

Homepage 配置保持只读，只有 `/app/config/logs` 使用独立命名卷。原始 Homepage 端口固定绑定 `127.0.0.1`；认证端口也通过 `NAV_AUTH_BIND_ADDRESS=127.0.0.1` 安全默认值绑定本机。NAS 自带反向代理应指向认证端口。只有代理无法访问宿主机回环地址时才改绑定地址，并同步收紧防火墙。

不要在 `.env` 中保存明文 `NAV_PASSWORD`。独立 Compose 只负责运行服务；完整的 NAS 冒烟验收请使用仓库 `deploy/scripts/smoke-test.sh`。
