# DLC 子站与 dev 分支整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `dev` 的主页发布、DNSPod 与本地 pnpm 配置同步到 `codex/dlc-subsites`，验证 DLC 子站后再安全合回 `dev`。

**Architecture:** 先在现有隔离工作树中把 `dev` 合入 `codex/dlc-subsites`，只人工解决预检确认的两个冲突；所有主页与 DLC 测试通过后，再用非快进合并把 DLC 功能带回 `dev`。整个过程不改写任何已推送提交。

**Tech Stack:** Git、pnpm、Vite、Node.js 内置测试运行器、POSIX shell

## Global Constraints

- 不使用 rebase、force push、`git reset --hard` 或历史改写。
- `src/assets/siteLinks.json` 以 `dev` 的最新主页入口为准：保留相册集、`audio.dailecheng.xyz` 与 `hot.dailecheng.xyz`。
- `.gitignore` 必须同时保留主线缓存规则和 DLC 数据、密钥隔离规则。
- 不提交 `.env`、密码、令牌、运行时数据库、NAS 数据或 `.superpowers/` 工作缓存。
- 合回 `dev` 前必须运行主页生产构建、主页发布契约、DLC 全量 Node 测试及部署预检。

---

### Task 1: 将 dev 同步到 DLC 分支

**Files:**
- Modify: `.gitignore`
- Modify: `src/assets/siteLinks.json`

**Interfaces:**
- Consumes: `dev`、`codex/dlc-subsites` 与工作树 `.worktrees/dlc-subsites`。
- Produces: 包含最新主线改动、且无未解决冲突的 `codex/dlc-subsites`。

- [x] **Step 1: 确认两个工作区干净**

```bash
git status --short --branch
git -C .worktrees/dlc-subsites status --short --branch
```

Expected: 两个命令都不显示未提交文件。

- [x] **Step 2: 获取远端并确认 dev 未落后**

```bash
git fetch origin
git rev-list --left-right --count dev...origin/dev
```

Expected: 输出 `0 0`。

- [x] **Step 3: 在 DLC 工作树合并 dev**

```bash
git -C .worktrees/dlc-subsites merge --no-ff dev
```

Expected: 仅 `.gitignore` 与 `src/assets/siteLinks.json` 出现内容冲突。

- [x] **Step 4: 解决 .gitignore 冲突**

最终文件必须同时包含：

```gitignore
.pnpm-store/
__pycache__/
*.py[cod]
.superpowers/
data/
deploy/.env
apps/**/data/
apps/**/.env
```

运行：

```bash
git -C .worktrees/dlc-subsites diff --check
test -z "$(git -C .worktrees/dlc-subsites diff --name-only --diff-filter=U)"
```

Expected: `diff --check` 返回 0；解决文件暂存后，第二条命令返回 0。

- [x] **Step 5: 解决主页入口冲突**

`src/assets/siteLinks.json` 必须与 `dev` 完全一致：

```bash
git show dev:src/assets/siteLinks.json > /tmp/dev-siteLinks.json
cmp /tmp/dev-siteLinks.json .worktrees/dlc-subsites/src/assets/siteLinks.json
```

Expected: `cmp` 返回 0；页面保留博客、网盘、音乐、相册集、网址集与今日热榜六个入口。

- [x] **Step 6: 完成合并提交**

```bash
git -C .worktrees/dlc-subsites add .gitignore src/assets/siteLinks.json
git -C .worktrees/dlc-subsites commit
```

Expected: 产生一次 `dev` 合入 `codex/dlc-subsites` 的 merge commit。

---

### Task 2: 验证同步后的 DLC 分支

**Files:**
- Verify: `tests/**/*.test.mjs`
- Verify: `tests/deploy/preflight.test.sh`
- Verify: `tests/deploy-home-workflow.test.sh`

**Interfaces:**
- Consumes: Task 1 的同步后 DLC 分支。
- Produces: 可安全合回主线的验证证据。

- [x] **Step 1: 运行 DLC 全量 Node 测试**

```bash
cd .worktrees/dlc-subsites
node --test tests/contracts/branding.test.mjs tests/blog/*.test.mjs tests/nav/*.test.mjs tests/web/*.test.mjs tests/hot/*.test.mjs tests/deploy/*.test.mjs tests/integration/*.test.mjs
```

Expected: 所有测试通过；本机没有 PHP 时只允许明确跳过 PHP 语法检查。

- [x] **Step 2: 运行部署预检测试**

```bash
sh tests/deploy/preflight.test.sh
```

Expected: 返回 0。

- [x] **Step 3: 运行主页契约与生产构建**

```bash
sh tests/deploy-home-workflow.test.sh
pnpm build
```

Expected: 发布契约通过，Vite 生产构建成功。

- [x] **Step 4: 确认无敏感信息和空白错误**

```bash
git diff --check
git grep -En 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_[A-Za-z0-9]+'
```

Expected: 本次未提交改动没有空白错误；敏感扫描无匹配。固定上游源码快照中的既有空白不在本次机械改写范围内。

---

### Task 3: 将 DLC 分支合回 dev 并发布 Git 历史

**Files:**
- Merge: `codex/dlc-subsites` into `dev`

**Interfaces:**
- Consumes: Task 2 已完整验证的 `codex/dlc-subsites`。
- Produces: 包含主页与 DLC 子站全部工作的 `dev` 和 `origin/dev`。

- [x] **Step 1: 最后确认两个分支状态**

```bash
git status --short --branch
git -C .worktrees/dlc-subsites status --short --branch
git log -1 --oneline dev
git log -1 --oneline codex/dlc-subsites
```

Expected: 两个工作区干净，提交均为预期版本。

- [x] **Step 2: 非快进合并 DLC 分支**

```bash
git switch dev
git merge --no-ff codex/dlc-subsites
```

Expected: 合并完成且不再出现内容冲突。

- [x] **Step 3: 在最终 dev 上重新运行关键验证**

```bash
pnpm build
sh tests/deploy-home-workflow.test.sh
node --test tests/contracts/branding.test.mjs tests/blog/*.test.mjs tests/nav/*.test.mjs tests/web/*.test.mjs tests/hot/*.test.mjs tests/deploy/*.test.mjs tests/integration/*.test.mjs
sh tests/deploy/preflight.test.sh
git diff --check
```

Expected: 所有适用测试通过，生产构建成功，最终工作区没有未提交的空白错误。

- [ ] **Step 4: 推送最终 dev**

```bash
git push origin dev
```

Expected: `origin/dev` 更新到最终 merge commit；不得使用 `--force`。

- [ ] **Step 5: 保留回退点并记录线上发布边界**

记录合并前 `origin/dev` 提交：

```bash
git rev-parse HEAD^1
```

Expected: 得到可恢复的完整提交 SHA。Git 推送完成不代表主页或子站已经上线；任何线上发布必须分别遵循主页发布工作流和各 DLC 子站部署文档。
