# DLC 空间第一阶段两站集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅集成已完成的博客与起始页，提供 NAS 总 Compose、认证网关、现有主页入口和本地可运行的契约/构建验收。

**Architecture:** 总 Compose 组合 `dlc-blog`、`dlc-nav` 和 `dlc-nav-auth`。博客公开暴露 3101；Homepage 原始 3103 只监听本机；认证网关公开 3105。网盘和网址集保留第二阶段计划，本阶段不创建占位服务。

**Tech Stack:** Docker Compose、Caddy 2.10.2、Node.js 测试、POSIX shell。

## Global Constraints

- 第一阶段只包含博客、起始页与起始页认证网关，不得加入网盘或网址集容器。
- 默认端口：博客 `3101`、起始页原始端口 `3103`、认证网关 `3105`。
- 起始页原始端口必须只绑定 `127.0.0.1`，认证网关不得绕过 `basic_auth`。
- 容器镜像与构建基线使用明确版本，不允许 `latest`。
- 本机没有 Docker/Caddy；本地验收必须如实区分静态契约/博客真实构建与 NAS 待验证项。
- 不提交 `.env`、密码、密码哈希、令牌、存储凭证或运行时数据。

---

### Task 1: 两站总 Compose 与部署说明

**Files:**
- Create: `deploy/compose.yml`
- Create: `deploy/README.md`
- Modify: `deploy/env.example`
- Create: `tests/deploy/phase1-compose.test.mjs`

**Interfaces:**
- Consumes: `apps/blog/Dockerfile`、`apps/nav/config`、`deploy/auth/Caddyfile`。
- Produces: `dlc-blog:80`→`${BLOG_PORT:-3101}`、`dlc-nav:3000`→`127.0.0.1:${NAV_PORT:-3103}`、`dlc-nav-auth:80`→`${NAV_AUTH_PORT:-3105}`。

- [ ] **Step 1: 写失败测试**

使用 Ruby Psych 将 `deploy/compose.yml` 解析为 JSON，精确断言服务集合仅为 `dlc-blog`、`dlc-nav`、`dlc-nav-auth`；断言端口、卷、健康检查、依赖关系、日志轮换、重启策略、Caddyfile 只读挂载和环境变量白名单；禁止 `latest`、敏感字段、Docker Socket、网盘/网址集服务。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test tests/deploy/phase1-compose.test.mjs`
Expected: FAIL，提示 `deploy/compose.yml` 不存在。

- [ ] **Step 3: 实现总 Compose 和说明**

`dlc-blog` 使用 `build: ../apps/blog`；`dlc-nav` 使用 `ghcr.io/gethomepage/homepage:v1.13.1`、N1 的两个只读卷和精确三项环境变量；`dlc-nav-auth` 使用 `caddy:2.10.2-alpine`，只读挂载 Caddyfile，通过 `NAV_USERNAME`/`NAV_PASSWORD_HASH` 传入凭证，并依赖健康的 `dlc-nav`。三个服务设置 `restart: unless-stopped`、健康检查和 `json-file` 日志 `max-size: 10m`/`max-file: 3`。README 写明本地验证边界、NAS 目录准备、Caddy 哈希生成、启动、反代端口、健康检查与回退命令。

- [ ] **Step 4: 验证契约**

Run: `node --test tests/deploy/phase1-compose.test.mjs && git diff --check`
Expected: 测试 PASS 且无空白错误；Docker Compose 展开列入 NAS 待验证项。

- [ ] **Step 5: 提交**

```bash
git add deploy/compose.yml deploy/README.md deploy/env.example tests/deploy/phase1-compose.test.mjs
git commit -m "feat: add phase one DLC deployment"
```

### Task 2: 现有主页入口与本地集成验收

**Files:**
- Modify: `src/assets/siteLinks.json`
- Create: `tests/integration/phase1.test.mjs`
- Create: `deploy/scripts/smoke-test.sh`

**Interfaces:**
- Consumes: 博客构建、起始页与认证静态契约、现有主页链接配置。
- Produces: 一条本地验收命令与一条 NAS 运行时验收脚本。

- [ ] **Step 1: 写失败或现状测试**

测试精确检查主页包含且只包含一个博客、网盘、起始页、网址集入口，不覆盖用户其他链接；执行博客契约与 Astro 构建，检查两篇文章/RSS；执行 nav 与 phase1 Compose 契约；扫描阶段一跟踪文件不得包含真实敏感信息。

- [ ] **Step 2: 运行并记录现状**

Run: `node --test tests/integration/phase1.test.mjs`
Expected: 若现有入口已正确则 PASS；否则仅因具体缺失/重复 URL FAIL。

- [ ] **Step 3: 最小补齐入口和 NAS 冒烟脚本**

只补测试报告的缺失/重复入口，不覆盖同文件其他用户修改。`smoke-test.sh` 检查三个容器健康、3101 返回 200、3105 未认证返回 401、使用环境凭证后 3105 返回 200；脚本不得打印密码或哈希，缺少 Docker/凭证时明确退出并提示仅在 NAS 执行。

- [ ] **Step 4: 运行本地最终验收**

Run: `node --test tests/contracts tests/blog tests/nav tests/deploy tests/integration && pnpm --dir apps/blog build && sh -n deploy/scripts/*.sh`
Expected: 所有本地契约通过，博客构建成功，脚本语法通过；Docker/Caddy 运行验收保持待 NAS 执行。

- [ ] **Step 5: 提交**

```bash
git add src/assets/siteLinks.json tests/integration/phase1.test.mjs deploy/scripts/smoke-test.sh
git commit -m "test: verify phase one DLC sites"
```
