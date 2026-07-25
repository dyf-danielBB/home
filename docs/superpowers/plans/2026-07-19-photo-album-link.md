# 相册集入口配置变更 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将个人主页网站列表中的“起始页”入口改为指向 `https://me.dailecheng.xyz/` 的“相册集”入口。

**Architecture:** 沿用现有数据驱动的网站入口实现，只修改 `siteLinks.json` 中目标条目的显示名称和链接。使用 Node 内置断言执行配置契约检查，不引入新的测试依赖。

**Tech Stack:** JSON、Node.js、Vue 3、Vite

## Global Constraints

- 保留 `Compass` 图标。
- 保留目标卡片的顺序、布局和新标签页跳转行为。
- 不修改其他站点入口。
- 不新增相册页面或相册功能。

---

### Task 1: 更新相册集入口配置

**Files:**
- Modify: `src/assets/siteLinks.json`
- Test: Node.js 内联配置契约检查

**Interfaces:**
- Consumes: `Links.vue` 读取的 `{ icon, name, link }` 条目结构。
- Produces: `{ "icon": "Compass", "name": "相册集", "link": "https://me.dailecheng.xyz/" }`。

- [x] **Step 1: 运行修改前契约检查并确认失败**

```bash
node -e "const fs=require('fs');const links=JSON.parse(fs.readFileSync('src/assets/siteLinks.json','utf8'));const album=links.filter(x=>x.name==='相册集');if(album.length!==1||album[0].icon!=='Compass'||album[0].link!=='https://me.dailecheng.xyz/'||links.some(x=>x.name==='起始页'||x.link==='https://nav.dailecheng.xyz/'))process.exit(1)"
```

Expected: 退出码为 `1`，因为配置仍包含“起始页”。

- [x] **Step 2: 实现最小配置修改**

将目标条目改为：

```json
{
  "icon": "Compass",
  "name": "相册集",
  "link": "https://me.dailecheng.xyz/"
}
```

- [x] **Step 3: 运行契约检查并确认通过**

```bash
node -e "const fs=require('fs');const links=JSON.parse(fs.readFileSync('src/assets/siteLinks.json','utf8'));const album=links.filter(x=>x.name==='相册集');if(album.length!==1||album[0].icon!=='Compass'||album[0].link!=='https://me.dailecheng.xyz/'||links.some(x=>x.name==='起始页'||x.link==='https://nav.dailecheng.xyz/'))process.exit(1)"
```

Expected: 退出码为 `0`。

- [x] **Step 4: 运行生产构建**

```bash
pnpm build
```

Expected: Vite 构建成功，退出码为 `0`。

- [x] **Step 5: 提交配置修改**

```bash
git add src/assets/siteLinks.json docs/superpowers/plans/2026-07-19-photo-album-link.md
git commit -m "feat: replace start page with photo album"
```

实际配置已随 `e65b200 feat: personalize homepage content and services` 提交；本计划文档随后补充入库。
