# 今日热榜（hot.dailecheng.xyz）部署与运维说明

汇聚全网热点的聚合站点，部署于群晖 NAS，经 FRP 穿透到 VPS，由 Nginx 对外提供 HTTPS 服务。

## 架构

```
公网用户
   │  https://hot.dailecheng.xyz (443)
   ▼
VPS (124.221.177.197) Nginx
   │  /etc/nginx/sites-enabled/hot.dailecheng.xyz.conf
   │  80 → 301 跳转 https；443 → 反代 127.0.0.1:13106
   ▼
FRP 隧道（frps 监听 13106 ← frpc 代理 hot）
   ▼
NAS (192.168.1.210) frpc: 127.0.0.1:3106 → remotePort 13106
   ▼
Node.js 服务（dailyhot 风格 API + 静态前端）
   /volume1/docker/dlc-space/source/apps/hot/
```

## 端口

| 端口 | 位置 | 用途 |
| --- | --- | --- |
| 3106 | NAS 本机 | Node.js 服务监听（`PORT=3106`） |
| 13106 | VPS 本机 | FRP remotePort，Nginx 反代目标 |
| 80 / 443 | VPS 公网 | Nginx 对外入口 |

## 启动与日志

代码位于 NAS：`/volume1/docker/dlc-space/source/apps/hot/`

```bash
# 启动（前台 exec node，日志输出到 stdout）
sh /volume1/docker/dlc-space/source/apps/hot/start.sh

# 后台方式（DSM 任务即此用法）
sh /volume1/docker/dlc-space/source/apps/hot/start.sh > /volume1/docker/dlc-space/source/apps/hot/server.log 2>&1 &

# 查看日志
tail -f /volume1/docker/dlc-space/source/apps/hot/server.log

# 健康检查
curl -s http://127.0.0.1:3106/weibo | head -c 200
```

## DSM 开机任务

任务计划名称：`dlc-hot-dailyhot`

- 事件：开机
- 用户：dyf8430
- 命令：

```
sh /volume1/docker/dlc-space/source/apps/hot/start.sh > /volume1/docker/dlc-space/source/apps/hot/server.log 2>&1 &
```

## 相关配置位置

- FRP 客户端配置（NAS）：`/var/services/homes/dyf8430/frp/frpc.toml`，其中 `[[proxies]] name = "hot"` 段映射 3106 → 13106；frpc 由 `run-frpc-forever.sh` 守护，修改配置后 pkill frpc 即自动重载。
- Nginx 站点配置（VPS）：`/etc/nginx/sites-enabled/hot.dailecheng.xyz.conf`，证书使用 `/etc/nginx/ssl/dailecheng.xyz/` 通配证书。
- DNS：DNSPod `hot.dailecheng.xyz` A 记录 → `124.221.177.197`（由主仓库 `scripts/dnspod-ensure-web-record.py hot 124.221.177.197` 幂等维护）。

## 备份说明

本服务无状态：不存数据库、不写本地文件，热点数据全部实时抓取并缓存于内存。**无需备份**，重建即恢复。上游接口清单见 `UPSTREAM.md`。
