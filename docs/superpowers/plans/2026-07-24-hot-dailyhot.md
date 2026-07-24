# 今日热榜（hot.dailecheng.xyz）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用开源 DailyHotApi + DailyHot 在 NAS 上部署今日热榜，通过 FRP + VPS Nginx 上线 `https://hot.dailecheng.xyz/`。

**Architecture:** NAS 单 Node 20 进程：Hono 封装 server 先匹配静态文件（前端 dist），未命中则转发给 DailyHotApi 的 Hono app（路由在根路径 `/weibo` 等）。FRP 映射 NAS 3106 → VPS 13106，Nginx 反代并复用泛域名证书。

**Tech Stack:** Node 20.9.0（NAS 套件）、Hono 4、Vite/Vue 3、pnpm（corepack + npmmirror 源）、FRP、Nginx、DNSPod API。

## Global Constraints

- NAS SSH：`SSH_AUTH_SOCK=$(launchctl getenv SSH_AUTH_SOCK) ssh -o BatchMode=yes dyf8430@192.168.1.210`（本地 key 需密码，必须走 macOS agent）
- NAS Node：`/volume1/@appstore/Node.js_v20/usr/local/bin/node`（v20.9.0），无全局 npm，用 corepack 启 pnpm，registry 用 `https://registry.npmmirror.com`
- NAS 无 git/scp；传文件用 `tar | ssh` 或 `cat | ssh 'cat >'`
- NAS 路径：代码 `/volume1/docker/dlc-space/source/apps/hot/`
- 端口：NAS 3106、VPS 13106（均已验证空闲）
- 上游版本：DailyHotApi master（v2.0.8）、DailyHot master，默认分支均为 `master`
- 不得在回复或文件中输出任何 token/密码/私钥
- 远程启停进程禁止 pkill 匹配自身命令行；用脚本文件 + `nohup sh script &`

## 上游关键事实（已核实）

- DailyHotApi：`src/app.tsx` `export default app`（Hono 实例）；路由挂载在根路径（`app.route("/", registry)`），端点为 `/weibo`、`/zhihu` 等；自带 notFound/onError 返回 HTML 错误页；`src/index.ts` 仅在 `NODE_ENV=development|docker` 时监听——封装 server 直接用 `app.fetch` 绕过；`PORT` 默认 6688
- DailyHot 前端：`src/api/request.js` 用 `import.meta.env.VITE_GLOBAL_API` 作 axios baseURL；`.env` 里设为 `""` 即同源相对请求；构建命令 `vite build` 输出 `dist/`

---

### Task 1: 上游代码 vendor 进仓库

**Files:**
- Create: `apps/hot/api/`（DailyHotApi master 全量，去掉 .git）
- Create: `apps/hot/web/`（DailyHot master 全量，去掉 .git）
- Create: `apps/hot/UPSTREAM.md`

**Interfaces:**
- Produces: `apps/hot/api/src/app.tsx`（default export Hono app）、`apps/hot/web/.env`（含 VITE_GLOBAL_API）

- [ ] **Step 1: 从 NAS 拉回已下载的上游源码到本地仓库**

NAS `/tmp/hot-upstream/` 已有 `DailyHotApi-master/` 和 `DailyHot-master/`（本机 DNS 故障，无法本地下载）。

```bash
export SSH_AUTH_SOCK=$(launchctl getenv SSH_AUTH_SOCK)
cd /Users/dyf-8/Documents/我的个人主页/.worktrees/dlc-subsites
mkdir -p apps/hot
ssh -o BatchMode=yes dyf8430@192.168.1.210 \
  'cd /tmp/hot-upstream && tar -cf - DailyHotApi-master DailyHot-master' | tar -xf - -C apps/hot
mv apps/hot/DailyHotApi-master apps/hot/api
mv apps/hot/DailyHot-master apps/hot/web
```

- [ ] **Step 2: 验证关键文件存在**

```bash
test -f apps/hot/api/src/app.tsx && test -f apps/hot/web/.env && \
grep -q "VITE_GLOBAL_API" apps/hot/web/.env && echo OK
```

Expected: `OK`

- [ ] **Step 3: 写 UPSTREAM.md 记录来源与版本**

```bash
cat > apps/hot/UPSTREAM.md <<'EOF'
# 上游来源

- apps/hot/api: imsyy/DailyHotApi @ master（v2.0.8），2026-07-24 取自 GitHub tarball
- apps/hot/web: imsyy/DailyHot @ master，2026-07-24 取自 GitHub tarball

两个上游均为 MIT 协议，LICENSE 文件保留在各自目录内。
EOF
```

- [ ] **Step 4: Commit**

```bash
git add apps/hot && git commit -m "feat(hot): vendor DailyHotApi 与 DailyHot 上游源码"
```

---

### Task 2: 同源封装 server 与前端配置

**Files:**
- Create: `apps/hot/server.js`
- Create: `apps/hot/package.json`
- Modify: `apps/hot/web/.env`（VITE_GLOBAL_API 置空）
- Test: `tests/hot/static.test.mjs`

**Interfaces:**
- Consumes: `apps/hot/api/dist/app.js`（Task 4 构建产物，default export Hono app）
- Produces: `node apps/hot/server.js` 监听 `PORT`（默认 3106），静态目录 `apps/hot/web/dist/`

- [ ] **Step 1: 写失败测试**

```bash
mkdir -p tests/hot
cat > tests/hot/static.test.mjs <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../apps/hot/", import.meta.url).pathname;

test("server.js 引用 API 构建产物与前端静态目录", () => {
  const src = readFileSync(`${root}server.js`, "utf8");
  assert.match(src, /api\/dist\/app\.js/);
  assert.match(src, /web\/dist/);
  assert.match(src, /PORT/);
});

test("前端 .env 的 VITE_GLOBAL_API 置空（同源请求）", () => {
  const env = readFileSync(`${root}web/.env`, "utf8");
  assert.match(env, /^VITE_GLOBAL_API\s*=\s*""\s*$/m);
  assert.doesNotMatch(env, /VITE_GLOBAL_API\s*=\s*"https?:\/\//);
});

test("start.sh 存在且调用 server.js", () => {
  const sh = readFileSync(`${root}start.sh`, "utf8");
  assert.match(sh, /server\.js/);
  assert.ok(existsSync(`${root}start.sh`));
});
EOF
node --test tests/hot/static.test.mjs
```

Expected: FAIL（server.js / start.sh 不存在，.env 未改）

- [ ] **Step 2: 写封装 server**

`apps/hot/server.js`：

```js
// 今日热榜同源封装：静态文件优先，未命中转发 DailyHotApi
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import apiApp from "./api/dist/app.js";

const app = new Hono();

// 1. 前端静态文件（apps/hot/web/dist）
app.use("/*", serveStatic({ root: "./web/dist" }));

// 2. 其余请求交给 DailyHotApi（路由在根路径，如 /weibo）
app.use("/*", async (c) => apiApp.fetch(c.req.raw));

const port = Number(process.env.PORT || 3106);
serve({ fetch: app.fetch, port });
console.log(`hot.dailecheng.xyz local server on :${port}`);
```

`apps/hot/package.json`：

```json
{
  "name": "dlc-hot",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "@hono/node-server": "^1.17.1",
    "hono": "^4.8.9"
  }
}
```

- [ ] **Step 3: 前端 .env 置空 API 地址**

编辑 `apps/hot/web/.env`，将 `VITE_GLOBAL_API="https://api-hot.imsyy.top"` 改为 `VITE_GLOBAL_API=""`，保留 VITE_ICP 和 VITE_DIR 不变。

- [ ] **Step 4: 启动脚本**

`apps/hot/start.sh`：

```sh
#!/bin/sh
cd "$(dirname "$0")"
export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:$PATH
export NODE_ENV=production
export PORT=3106
exec node server.js
```

`chmod +x apps/hot/start.sh`

- [ ] **Step 5: 跑测试确认通过**

```bash
node --test tests/hot/static.test.mjs
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/hot/server.js apps/hot/package.json apps/hot/start.sh apps/hot/web/.env tests/hot && \
git commit -m "feat(hot): 同源封装 server、启动脚本与静态契约测试"
```

---

### Task 3: DNSPod 脚本泛化（支持任意子域名）

**Files:**
- Modify: `scripts/dnspod-ensure-web-record.py`（主仓库 /Users/dyf-8/Documents/我的个人主页/scripts/）

**Interfaces:**
- Produces: `python3 dnspod-ensure-web-record.py [sub] [ip]`，默认 `web 124.221.177.197`

- [ ] **Step 1: 修改脚本接受参数**

把脚本末尾的：

```python
DOMAIN, SUB, IP = "dailecheng.xyz", "web", "124.221.177.197"
```

改为：

```python
DOMAIN = "dailecheng.xyz"
SUB = sys.argv[1] if len(sys.argv) > 1 else "web"
IP = sys.argv[2] if len(sys.argv) > 2 else "124.221.177.197"
```

- [ ] **Step 2: 本地语法检查**

```bash
python3 -m py_compile /Users/dyf-8/Documents/我的个人主页/scripts/dnspod-ensure-web-record.py && echo OK
```

- [ ] **Step 3: Commit（主仓库 dev 分支）**

```bash
cd /Users/dyf-8/Documents/我的个人主页
git add scripts/dnspod-ensure-web-record.py
git commit -m "refactor(scripts): DNSPod 脚本支持传入子域名与 IP 参数"
```

---

### Task 4: 上传 NAS 并构建运行

**Files:**
- NAS: `/volume1/docker/dlc-space/source/apps/hot/`（全量）
- NAS: 依赖安装与构建在 NAS 完成

- [ ] **Step 1: 上传 apps/hot（排除 node_modules）**

```bash
export SSH_AUTH_SOCK=$(launchctl getenv SSH_AUTH_SOCK)
cd /Users/dyf-8/Documents/我的个人主页/.worktrees/dlc-subsites
tar --no-xattrs --exclude='*/node_modules' -cf - apps/hot | \
  ssh -o BatchMode=yes dyf8430@192.168.1.210 \
  'cd /volume1/docker/dlc-space/source && rm -rf apps/hot && tar -xf - && ls apps/hot'
```

Expected: 列出 api、web、server.js、package.json、start.sh、UPSTREAM.md

- [ ] **Step 2: 启用 pnpm（corepack + npmmirror）**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:$PATH
export COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
corepack enable --install-directory /tmp/corepack-bin 2>/dev/null || corepack prepare pnpm@9 --activate
/tmp/corepack-bin/pnpm -v 2>/dev/null || pnpm -v'
```

Expected: 输出 pnpm 版本号。若 corepack 失败，回退：`npm install -g pnpm --registry=https://registry.npmmirror.com`（corepack 含 npm）

- [ ] **Step 3: 构建 API**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:/tmp/corepack-bin:$PATH
cd /volume1/docker/dlc-space/source/apps/hot/api
pnpm install --registry=https://registry.npmmirror.com --frozen-lockfile
pnpm build
test -f dist/app.js && echo "API 构建完成"'
```

Expected: `API 构建完成`。此步下载依赖较多，后台执行 + 轮询（参照网址集 nohup 模式，done 文件标记）

- [ ] **Step 4: 构建前端**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:/tmp/corepack-bin:$PATH
cd /volume1/docker/dlc-space/source/apps/hot/web
pnpm install --registry=https://registry.npmmirror.com --frozen-lockfile
pnpm build
test -f dist/index.html && echo "前端构建完成"'
```

Expected: `前端构建完成`（同样后台 + 轮询）

- [ ] **Step 5: 安装封装 server 依赖**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'export PATH=/volume1/@appstore/Node.js_v20/usr/local/bin:/tmp/corepack-bin:$PATH
cd /volume1/docker/dlc-space/source/apps/hot
pnpm install --registry=https://registry.npmmirror.com'
```

- [ ] **Step 6: 启动服务（脚本文件 + nohup，防 pkill 自匹配）**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'nohup sh /volume1/docker/dlc-space/source/apps/hot/start.sh > /volume1/docker/dlc-space/source/apps/hot/server.log 2>&1 & sleep 3; curl -sS -o /dev/null -w "%{http_code}\n" --max-time 10 http://127.0.0.1:3106/'
```

Expected: `200`

- [ ] **Step 7: NAS 侧验收**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'curl -fsSL --max-time 15 http://127.0.0.1:3106/ | grep -o "<title>[^<]*</title>"
for p in weibo zhihu bilibili; do curl -fsSL --max-time 30 "http://127.0.0.1:3106/$p" | head -c 120; echo; done'
```

Expected: 页面 title + 三个平台各返回 JSON（含 title/name 字段）。个别平台失败可接受（上游接口变动），但 weibo 必须有数据

---

### Task 5: 公网上线（FRP + Nginx + DNS）

**Files:**
- Modify NAS: `/var/services/homes/dyf8430/frp/frpc.toml`（先备份）
- Create VPS: `/etc/nginx/sites-enabled/hot.dailecheng.xyz.conf`

- [ ] **Step 1: FRP 追加 hot 映射并重启**

```bash
ssh -o BatchMode=yes dyf8430@192.168.1.210 'cp /var/services/homes/dyf8430/frp/frpc.toml /var/services/homes/dyf8430/frp/frpc.toml.bak-$(date +%Y%m%d%H%M%S)
cat >> /var/services/homes/dyf8430/frp/frpc.toml <<EOF

[[proxies]]
name = "hot"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3106
remotePort = 13106
EOF
cat > /tmp/restart-frpc.sh <<EOF
#!/bin/sh
pkill -f "frpc -c"
EOF
sh /tmp/restart-frpc.sh || true; sleep 8
tail -3 /var/services/homes/dyf8430/frp/frpc.log | grep -o "\[hot\] start proxy success"'
```

Expected: `[hot] start proxy success`

- [ ] **Step 2: VPS Nginx 配置**

```bash
ssh -o BatchMode=yes wechat-vps 'curl -sS -o /dev/null -w "13106: %{http_code}\n" --max-time 8 http://127.0.0.1:13106/
sudo tee /etc/nginx/sites-enabled/hot.dailecheng.xyz.conf > /dev/null <<EOF
server {
    listen 80;
    server_name hot.dailecheng.xyz;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name hot.dailecheng.xyz;
    ssl_certificate /etc/nginx/ssl/dailecheng.xyz/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/dailecheng.xyz/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:13106;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
sudo nginx -t && sudo systemctl reload nginx && echo NGINX_RELOADED'
```

Expected: `13106: 200` + `NGINX_RELOADED`

- [ ] **Step 3: DNS 记录（幂等）**

```bash
cat /Users/dyf-8/Documents/我的个人主页/scripts/dnspod-ensure-web-record.py | \
  ssh -o BatchMode=yes dyf8430@192.168.1.210 'cat > /tmp/dnspod.py && python3 /tmp/dnspod.py hot 124.221.177.197'
```

Expected: `已创建: hot.dailecheng.xyz A -> 124.221.177.197` 或 `A 记录已存在且正确`

- [ ] **Step 4: 公网验收**

```bash
curl -fsSL --max-time 20 -H 'Cache-Control: no-cache' https://hot.dailecheng.xyz/ | grep -o "<title>[^<]*</title>"
curl -sS -o /dev/null -w "http跳转: %{http_code} -> %{redirect_url}\n" --max-time 15 http://hot.dailecheng.xyz/
curl -fsSL --max-time 30 https://hot.dailecheng.xyz/weibo | head -c 120
```

Expected: title、301 → https、微博 JSON

- [ ] **Step 5: 写 README 并 commit**

`apps/hot/README.md`：架构图、端口、启动/日志命令、DSM 开机任务名称 `dlc-hot-dailyhot`、备份说明（无状态无需备份）。

```bash
git add apps/hot/README.md && git commit -m "docs(hot): 部署与运维说明"
```

- [ ] **Step 6: 提示用户创建 DSM 开机任务**

告知用户在 DSM 任务计划新增 `dlc-hot-dailyhot`（开机、dyf8430、命令 `sh /volume1/docker/dlc-space/source/apps/hot/start.sh > /volume1/docker/dlc-space/source/apps/hot/server.log 2>&1 &`），用户建好后验证任务存在。
