# 博客公网发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过现有 NAS + FRP + 腾讯云 VPS Nginx 架构，将 NAS 上的 DLC 博客发布到 `https://blog.dailecheng.xyz/`。

**Architecture:** NAS 的 `dlc-blog` 保持监听 `3101`；NAS 上现有 `frpc` 新增 `blog` TCP 代理，将请求转发到 VPS 本机端口 `13101`；VPS Nginx 使用现有 `*.dailecheng.xyz` 证书终止 HTTPS，并反向代理到 `127.0.0.1:13101`。DNSPod 新增 `blog` A 记录指向 VPS `124.221.177.197`。

**Tech Stack:** Docker Compose、frp 0.64.0、Nginx、DNSPod、Let's Encrypt 通配符证书。

## 全局约束

- 不改动个人主页 `me.dailecheng.xyz` 及其 FRP 端口 `18080`。
- 博客 NAS 端口固定为 `3101`，VPS FRP 端口使用已确认未占用的 `13101`。
- 修改远程配置前创建带时间戳的备份。
- Nginx 配置必须先通过 `nginx -t`，再 reload；失败时恢复备份。
- DNS 生效前先用指定 `Host` 和本机解析验证完整 HTTPS 链路。

---

### Task 1: 验证上线前置条件

**Files:**
- Inspect: NAS `/volume1/web/dlc-space/deploy/compose.yml`
- Inspect: NAS `/var/services/homes/dyf8430/frp/frpc.toml`
- Inspect: VPS `/etc/nginx/ssl/dailecheng.xyz/fullchain.pem`

- [x] **Step 1: 验证 NAS 博客健康**

运行 NAS 本机 HTTP 检查，预期 `200`，并确认 `dlc-blog` 为 `healthy`。

- [x] **Step 2: 验证端口没有冲突**

确认 VPS `13101` 未监听、现有 FRP 配置中不存在名为 `blog` 的代理。

- [x] **Step 3: 验证证书覆盖博客域名**

读取通配符证书 SAN，预期包含 `*.dailecheng.xyz`，并确认未过期。

### Task 2: 新增 FRP 博客隧道

**Files:**
- Modify: NAS `/var/services/homes/dyf8430/frp/frpc.toml`

- [x] **Step 1: 备份 FRP 配置**

创建 `frpc.toml.pre-blog-<timestamp>`，保留权限。

- [x] **Step 2: 添加博客代理**

追加以下配置：

```toml
[[proxies]]
name = "blog"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3101
remotePort = 13101
```

- [x] **Step 3: 校验并重载 frpc**

先运行 `frpc verify -c frpc.toml`；校验成功后只重启 `frpc` 子进程，由现有守护脚本自动拉起。

- [x] **Step 4: 验证隧道**

在 VPS 请求 `http://127.0.0.1:13101/`，预期返回博客首页 `200`。

### Task 3: 新增 VPS HTTPS 站点

**Files:**
- Create: VPS `/etc/nginx/sites-available/blog.dailecheng.xyz.conf`
- Create: VPS `/etc/nginx/sites-enabled/blog.dailecheng.xyz.conf`

- [x] **Step 1: 写入独立 Nginx 配置**

HTTP 端口只做 301 跳转；HTTPS 使用现有通配符证书，反代到 `127.0.0.1:13101`，传递 `Host`、客户端 IP 和 `X-Forwarded-Proto`。

- [x] **Step 2: 校验并重载 Nginx**

运行 `sudo nginx -t`，成功后执行 `sudo systemctl reload nginx`。

- [x] **Step 3: 在 DNS 生效前验证站点**

在 VPS 使用 `curl --resolve blog.dailecheng.xyz:443:127.0.0.1 https://blog.dailecheng.xyz/`，预期 HTTPS `200`、页面标题为 `DLC 空间`。

### Task 4: DNS 与公网验收

**Files:**
- External: DNSPod `dailecheng.xyz` 解析记录

- [x] **Step 1: 创建 DNS 记录**

新增主机记录 `blog`、类型 `A`、记录值 `124.221.177.197`；TTL 使用 DNSPod 默认值。

- [x] **Step 2: 验证公网 HTTPS**

等待解析后访问 `https://blog.dailecheng.xyz/`，预期 `200`、证书有效、首页资源与文章内部链接均可访问。

- [x] **Step 3: 记录回退方法**

如需回退，禁用博客 Nginx 站点并恢复 NAS 的 FRP 备份，不影响个人主页与其他站点。
