# DLC 空间共享基础与部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立四个子站共用的品牌资源、可组合 Docker 部署、密钥隔离、端口预检和运维文档。

**Architecture:** `shared/` 只保存不可变品牌资源和 CSS 变量，`deploy/compose.yml` 组合四个应用及认证网关。业务数据统一挂载到 `.env` 指定的 NAS 目录，应用之间不共享数据库。

**Tech Stack:** Docker Compose、Caddy 2、POSIX shell、Node.js 内置测试运行器。

## Global Constraints

- 品牌名称固定为 `DLC 空间`，英文标识固定为 `dlc`，Logo 文本固定为 `DLC`。
- 主题固定为“极光深海”：`#090e19`、`#111a2e`、`#55d6be`、`#3b82f6`、`#eff6ff`。
- 默认端口为博客 `3101`、网盘 `3102`、起始页 `3103`、网址集 `3104`、认证网关 `3105`。
- 禁止把 `.env`、密码、令牌、存储凭证和运行时数据库提交到 Git。
- 所有容器使用明确版本号，禁止使用 `latest`。

---

### Task 1: 共享品牌契约与仓库忽略规则

**Files:**
- Create: `shared/branding/dlc-logo.svg`
- Create: `shared/theme/tokens.css`
- Create: `tests/contracts/branding.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: CSS 变量 `--dlc-bg-0`、`--dlc-bg-1`、`--dlc-primary`、`--dlc-accent`、`--dlc-text`、`--dlc-radius-card`、`--dlc-radius-panel`。
- Produces: SVG 资源 `/shared/branding/dlc-logo.svg`，各子项目复制或挂载使用。

- [ ] **Step 1: 写品牌契约失败测试**

```js
// tests/contracts/branding.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("DLC 品牌资源包含固定文案和色值", async () => {
  const [css, svg] = await Promise.all([
    readFile("shared/theme/tokens.css", "utf8"),
    readFile("shared/branding/dlc-logo.svg", "utf8"),
  ]);
  for (const token of ["#090e19", "#111a2e", "#55d6be", "#3b82f6", "#eff6ff"]) assert.match(css, new RegExp(token));
  assert.match(svg, />DLC</);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/contracts/branding.test.mjs`
Expected: FAIL，提示 `shared/theme/tokens.css` 不存在。

- [ ] **Step 3: 创建 SVG、CSS 变量并更新忽略规则**

`tokens.css` 必须定义上述 7 个变量，并为 `prefers-reduced-motion: reduce` 关闭极光动画；`dlc-logo.svg` 使用 `viewBox="0 0 128 128"`、青绿到蓝色渐变、圆角背景和居中的 `DLC`。在 `.gitignore` 追加：

```gitignore
.superpowers/
data/
deploy/.env
apps/**/data/
apps/**/.env
```

- [ ] **Step 4: 验证测试通过**

Run: `node --test tests/contracts/branding.test.mjs && git diff --check`
Expected: 1 test PASS，且无空白错误。

- [ ] **Step 5: 提交**

```bash
git add .gitignore shared tests/contracts/branding.test.mjs
git commit -m "feat: add DLC shared brand tokens"
```

### Task 2: 环境变量与端口预检

**Files:**
- Create: `deploy/env.example`
- Create: `deploy/scripts/preflight.sh`
- Create: `tests/deploy/preflight.test.sh`

**Interfaces:**
- Consumes: `DLC_DATA_ROOT`、`DLC_PUID`、`DLC_PGID`、5 个端口变量和 `NAV_PASSWORD_HASH`。
- Produces: 退出码 `0` 表示配置可部署；退出码 `1` 表示缺少变量、目录不可写或端口占用。

- [ ] **Step 1: 写预检失败测试**

```sh
#!/bin/sh
set -eu
output=$(DLC_DATA_ROOT=/tmp/does-not-exist BLOG_PORT=3101 PAN_PORT=3102 NAV_PORT=3103 WEB_PORT=3104 NAV_AUTH_PORT=3105 sh deploy/scripts/preflight.sh 2>&1 || true)
printf '%s' "$output" | grep 'DLC_DATA_ROOT 不可写'
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `sh tests/deploy/preflight.test.sh`
Expected: FAIL，提示 `deploy/scripts/preflight.sh` 不存在。

- [ ] **Step 3: 实现环境模板和预检**

`deploy/env.example` 写入非敏感默认值：端口 `3101` 至 `3105`、`DLC_DATA_ROOT=/volume1/docker/dlc-space`、`DLC_PUID=1000`、`DLC_PGID=1000`、四个域名。密码字段只写注释示例。`preflight.sh` 使用 `mkdir -p`/`test -w` 检查数据目录，使用 `docker compose config` 检查配置，并通过 `lsof -nP -iTCP:"$port" -sTCP:LISTEN` 或 `ss -ltn` 检查冲突；错误信息必须包含变量名或端口号。

- [ ] **Step 4: 运行预检测试**

Run: `sh tests/deploy/preflight.test.sh`
Expected: PASS，并匹配 `DLC_DATA_ROOT 不可写`。

- [ ] **Step 5: 提交**

```bash
git add deploy/env.example deploy/scripts/preflight.sh tests/deploy/preflight.test.sh
git commit -m "feat: add NAS deployment preflight"
```

### Task 3: 总 Compose、认证网关与运维说明

**Files:**
- Create: `deploy/compose.yml`
- Create: `deploy/auth/Caddyfile`
- Create: `deploy/README.md`
- Create: `tests/deploy/compose.test.mjs`

**Interfaces:**
- Consumes: 四个子计划提供的服务定义 `dlc-blog`、`dlc-pan`、`dlc-nav`、`dlc-web`。
- Produces: NAS 对外端口 `3101`、`3102`、`3104`、`3105`；`3103` 只绑定 NAS 本机地址供认证网关转发。

- [ ] **Step 1: 写 Compose 契约失败测试**

```js
// tests/deploy/compose.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("总编排固定版本并保护起始页", async () => {
  const yaml = await readFile("deploy/compose.yml", "utf8");
  assert.doesNotMatch(yaml, /:latest\b/);
  for (const name of ["dlc-blog", "dlc-pan", "dlc-nav", "dlc-web", "dlc-nav-auth"]) assert.match(yaml, new RegExp(name));
  assert.match(yaml, /127\.0\.0\.1:\$\{NAV_PORT:-3103\}:3000/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/deploy/compose.test.mjs`
Expected: FAIL，提示 `deploy/compose.yml` 不存在。

- [ ] **Step 3: 实现总编排与 Caddy Basic Auth**

使用 `caddy:2.10.2-alpine`，Caddyfile 内容为：

```caddy
:80 {
  basic_auth {
    {$NAV_USERNAME} {$NAV_PASSWORD_HASH}
  }
  reverse_proxy dlc-nav:3000
}
```

总 Compose 为每个服务配置 `restart: unless-stopped`、健康检查、`json-file` 日志 `max-size: 10m`/`max-file: 3` 和独立数据挂载。`deploy/README.md` 写明复制环境模板、生成 Caddy 密码哈希、执行预检、启动、健康检查、NAS 反代映射和逐服务回退命令。

- [ ] **Step 4: 验证配置**

Run: `node --test tests/deploy/compose.test.mjs && docker compose --env-file deploy/env.example -f deploy/compose.yml config --quiet`
Expected: 测试 PASS，Compose 配置返回 0。

- [ ] **Step 5: 提交**

```bash
git add deploy tests/deploy/compose.test.mjs
git commit -m "feat: add DLC aggregate deployment"
```

### Task 4: 现有主页入口与全栈验收

**Files:**
- Modify: `src/assets/siteLinks.json`
- Create: `tests/integration/subsites.test.mjs`
- Create: `deploy/scripts/smoke-test.sh`

**Interfaces:**
- Consumes: 四个域名和端口、总 Compose 的五个服务。
- Produces: 单条命令验证公开访问、认证保护、健康状态与现有主页入口。

- [ ] **Step 1: 写入口与安全失败测试**

```js
// tests/integration/subsites.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import links from "../../src/assets/siteLinks.json" with { type: "json" };
test("现有主页包含四个 DLC 子站入口", () => {
  const urls = new Set(links.map((item) => item.link));
  for (const url of [
    "https://blog.dailecheng.xyz/",
    "https://pan.dailecheng.xyz/",
    "https://nav.dailecheng.xyz/",
    "https://web.dailecheng.xyz/",
  ]) assert.ok(urls.has(url), `缺少 ${url}`);
});
```

- [ ] **Step 2: 运行测试并确认当前状态**

Run: `node --test tests/integration/subsites.test.mjs`
Expected: 若用户已有链接修改完整则 PASS；缺少任一入口时 FAIL 并显示具体 URL。无论结果如何都不得覆盖同文件中的其他用户修改。

- [ ] **Step 3: 最小化补齐入口并实现冒烟脚本**

只补充测试报告缺失的四个入口。`smoke-test.sh` 执行 `docker compose ps`，轮询 3101/3102/3104 至 HTTP 可响应，断言 3105 未认证为 401，并检查 `docker inspect` 中五个服务均为 healthy；脚本不得打印 `.env` 内容。

- [ ] **Step 4: 运行全栈验收**

Run: `node --test tests/contracts tests/deploy tests/blog tests/pan tests/nav tests/web tests/integration && sh deploy/scripts/smoke-test.sh`
Expected: 所有契约测试 PASS；五个服务健康；博客、网盘、网址集可响应；起始页未认证返回 401。

- [ ] **Step 5: 提交**

```bash
git add src/assets/siteLinks.json tests/integration deploy/scripts/smoke-test.sh
git commit -m "test: verify DLC subsite deployment"
```
