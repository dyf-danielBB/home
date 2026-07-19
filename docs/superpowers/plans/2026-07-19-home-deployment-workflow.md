# 个人主页发布工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将个人主页构建、NAS 备份上传、源站验收和公网验收固化为项目级中文工作流与可执行脚本。

**Architecture:** 根目录 `AGENTS.md` 负责将“发布主页”请求路由到脚本，`docs/workflows/home-deployment.md` 记录架构、故障处理和恢复方式，`scripts/deploy-home.sh` 负责可重复执行的自动发布。`tests/deploy-home-workflow.test.sh` 使用静态契约和 `--help` 验证，不触发真实网络发布。

**Tech Stack:** POSIX shell、pnpm、Vite、SSH、tar、curl、ripgrep

## Global Constraints

- 所有 `AGENTS.md` 内容使用自然、清楚的中文。
- 默认 NAS 为 `dyf8430@192.168.1.210`。
- 默认线上目录为 `/volume1/web/home`，备份目录为 `/volume1/web/home-backups`。
- 默认 NAS 源站为 `http://127.0.0.1:12445/`，正式域名为 `https://home.dailecheng.xyz/`。
- VPS FRP 远端端口为 `22445`。
- 不保存密码、私钥、GitHub 令牌或 FRP 令牌。
- 备份失败、构建失败、上传验证失败或公网验收失败时必须返回非零退出码。
- 发布不得主动删除线上旧哈希资源。

---

### Task 1: 建立项目级发布工作流

**Files:**
- Create: `AGENTS.md`
- Create: `docs/workflows/home-deployment.md`
- Create: `scripts/deploy-home.sh`
- Create: `tests/deploy-home-workflow.test.sh`

**Interfaces:**
- Consumes: 项目 `package.json` 的 `pnpm build`、构建输出 `dist/`、已配置的 SSH 公钥。
- Produces: `scripts/deploy-home.sh [--help]`；默认完成构建、备份、上传和双重验收。

- [x] **Step 1: 写失败的工作流契约测试**

创建 `tests/deploy-home-workflow.test.sh`：

```sh
#!/bin/sh
set -eu

test -f AGENTS.md
test -f docs/workflows/home-deployment.md
test -x scripts/deploy-home.sh

grep -q 'scripts/deploy-home.sh' AGENTS.md
grep -q '192.168.1.210' docs/workflows/home-deployment.md
grep -q '/volume1/web/home' docs/workflows/home-deployment.md
grep -q '22445' docs/workflows/home-deployment.md

sh -n scripts/deploy-home.sh
help_output=$(scripts/deploy-home.sh --help)
printf '%s\n' "$help_output" | grep -q '个人主页发布脚本'
printf '%s\n' "$help_output" | grep -q 'HOME_DEPLOY_HOST'

grep -q 'pnpm build' scripts/deploy-home.sh
grep -q 'home-backups' scripts/deploy-home.sh
grep -q 'Cache-Control: no-cache' scripts/deploy-home.sh
grep -q '不主动删除' docs/workflows/home-deployment.md

if grep -REn '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_[A-Za-z0-9]+|auth\.token[[:space:]]*=)' \
  AGENTS.md docs/workflows/home-deployment.md scripts/deploy-home.sh; then
  echo '检测到不应提交的凭据' >&2
  exit 1
fi
```

- [x] **Step 2: 运行测试并确认失败**

Run: `sh tests/deploy-home-workflow.test.sh`

Expected: FAIL，提示 `AGENTS.md`、文档或脚本不存在。

- [x] **Step 3: 创建中文 AGENTS.md**

文件必须说明：

```markdown
# 项目代理说明

## 语言约定

- 本项目的代理说明、工作流文档和发布结果默认使用中文。

## 个人主页发布

- 用户要求发布、上线或更新 `https://home.dailecheng.xyz/` 时，必须先阅读 `docs/workflows/home-deployment.md`。
- 默认运行 `scripts/deploy-home.sh`，不得仅以 GitHub 推送成功代替线上验收。
- 发布前必须构建并检查目标内容；覆盖 NAS 文件前必须完成备份。
- 发布完成必须同时验证 NAS 源站和正式域名；任何一步失败都要报告实际状态，不得宣称发布成功。
- 不得把密码、私钥、GitHub 令牌或 FRP 令牌写入仓库、命令输出或回复。
```

- [x] **Step 4: 创建发布说明文档**

`docs/workflows/home-deployment.md` 必须包含：固定链路图、前置条件、默认参数、自动发布命令、逐步说明、缓存说明、故障排查、备份位置和以下恢复命令模板：

```sh
ssh -i ~/.ssh/id_ed25519 dyf8430@192.168.1.210 \
  'tar -xzf /volume1/web/home-backups/指定备份.tar.gz -C /volume1/web/home'
```

恢复章节必须提醒先确认备份文件名，并在恢复后重新验证源站和正式域名。

- [x] **Step 5: 实现自动发布脚本**

`scripts/deploy-home.sh` 使用 `#!/bin/sh` 与 `set -eu`，提供 `--help`；默认值通过 `${变量:-默认值}` 设置。脚本按顺序执行：依赖检查、`pnpm build`、解析 `dist/index.html` 中 `/assets/index-*.js`、验证本地资源包含“相册集”和 `https://me.dailecheng.xyz/`、生成安全时间戳、SSH 创建备份、tar 数据流上传、NAS 源站验证、带 `Cache-Control: no-cache` 和查询参数的公网验证、打印结果。

SSH 参数统一构造为：

```sh
ssh -i "$HOME_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
  "$HOME_DEPLOY_USER@$HOME_DEPLOY_HOST"
```

上传使用：

```sh
tar --no-xattrs -cf - -C dist . | ssh ... "cd '$HOME_DEPLOY_DIR' && tar -xf -"
```

脚本不得运行 `rm`，也不得修改 VPS、FRP 或 NAS 网络配置。

- [x] **Step 6: 运行契约测试和生产构建**

Run:

```sh
chmod +x scripts/deploy-home.sh tests/deploy-home-workflow.test.sh
sh tests/deploy-home-workflow.test.sh
pnpm build
```

Expected: 契约测试退出码 `0`，Vite 构建成功。

- [x] **Step 7: 提交工作流**

```sh
git add AGENTS.md docs/workflows/home-deployment.md scripts/deploy-home.sh tests/deploy-home-workflow.test.sh docs/superpowers/plans/2026-07-19-home-deployment-workflow.md
git commit -m "feat: add homepage deployment workflow"
```
