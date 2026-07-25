# 今日热榜（hot.dailecheng.xyz）设计文档

日期：2026-07-24
状态：已获用户批准

## 背景与目标

从零新建「今日热榜」聚合站，部署在自有 NAS 并通过公网域名 `https://hot.dailecheng.xyz/` 完全公开访问。采用现成开源项目（方案 A），不自研抓取逻辑。

## 选型

- 数据接口：`imsyy/DailyHotApi`（Node.js，聚合微博、知乎、B站、百度等 20+ 平台热榜，内置请求缓存）
- 前端页面：`imsyy/DailyHot`（Vue 3，构建为静态文件）
- 排除 Docker 部署：NAS 的 Docker 镜像拉取会在解压阶段挂起（网址集部署时已验证），改用系统 Node.js 运行
- 排除公共 API 实例：稳定性不可控

## 架构

```
浏览器 → hot.dailecheng.xyz → VPS Nginx(443) → VPS:13106 → FRP → NAS:3106
                                                              └── Node 20 单进程
                                                                  ├── /api/* → DailyHotApi（聚合接口，内存缓存）
                                                                  └── 其余 → DailyHot 前端静态文件
```

- 代码位置：NAS `/volume1/docker/dlc-space/source/apps/hot/`，仓库目录结构与 blog/nav/web 同级
- NAS 运行 Node 20（`/volume1/@appstore/Node.js_v20/usr/local/bin/node`，v20.9.0）
- 单进程同时提供 API 与静态文件托管，前端构建时 API 地址指向同源 `/api`，无跨域问题

## 端口分配（已验证空闲）

| 用途 | 端口 |
| --- | --- |
| NAS 服务 | 3106 |
| VPS FRP 远端 | 13106 |

## 数据流

- 前端按平台逐个请求 `/api/<平台>`
- DailyHotApi 内置缓存（秒级），热榜数据允许分钟级延迟
- 单平台接口失效只影响该平台卡片，不影响整站（上游项目原生行为）

## 上线链路（与网址集同构）

1. FRP：NAS `frpc.toml` 追加 `hot` 映射 `3106 → 13106`（先备份），重启 frpc 由守护脚本自动拉起
2. VPS Nginx：新增 `/etc/nginx/sites-enabled/hot.dailecheng.xyz.conf`，复用泛域名证书，反代 `127.0.0.1:13106`
3. DNS：用 DNSPod API 幂等检查/创建 `hot` A 记录 → 124.221.177.197（先查后建）
4. 进程管理：nohup 启动 + DSM 开机任务 `dlc-hot-dailyhot`（用户手动在 DSM 创建，同 dlc-web-onenav 模式）

## 错误处理

- 服务崩溃：DSM 开机任务保证 NAS 重启后恢复；进程级 watchdog 暂不加
- 启动/运行日志：`apps/hot/server.log`
- 上游平台接口失效：接口返回错误 JSON，前端对应平台为空，整站可用

## 验收标准

1. NAS `curl http://127.0.0.1:3106/` 返回前端 HTML
2. NAS `curl http://127.0.0.1:3106/api/weibo` 返回微博热搜 JSON
3. 公网 `https://hot.dailecheng.xyz/` 返回 200，页面资源可加载
4. 抽查 2-3 个平台接口返回非空数据

## 不做的事（YAGNI）

- 不做访问认证（完全公开）
- 不做 Docker 化、不做进程 watchdog、不做多实例
- 不定制前端品牌样式（先用上游默认界面）
