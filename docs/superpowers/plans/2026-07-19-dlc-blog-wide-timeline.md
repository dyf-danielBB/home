# DLC 博客宽屏时间轴布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 DLC 博客改成桌面侧栏、宽内容区、标签筛选与年份时间轴布局，并保持移动端和文章页易读。

**Architecture:** `Layout.astro` 负责外层宽屏壳与页面类型；`Header.astro` 同时提供桌面侧栏和移动导航；首页从 Astro 内容集合生成标签与年份分组，并用渐进增强脚本筛选文章；`global.css` 负责断点和视觉样式。所有数据仍来自 Markdown，不增加后端。

**Tech Stack:** Astro、TypeScript、Tailwind CSS v4、原生 DOM API、Node Test、Playwright 浏览器验收、Docker Compose。

## Global Constraints

- 桌面最大宽度 `1440px`，侧栏约 `248px`，断点 `64rem`。
- 文章正文最大宽度约 `760px`，不得跟随首页无限拉宽。
- 标签按钮数据来自现有文章；默认“全部”，通过 `aria-pressed` 表示选择状态。
- JavaScript 关闭时仍显示全部文章。
- 不新增虚假栏目、文章数量、分类或统计。
- 深色、浅色、移动端和减少动态效果均保持可读。

---

### Task 1: 建立宽屏布局契约

**Files:**
- Modify: `tests/blog/blog-content.test.mjs`
- Modify: `apps/blog/src/layouts/Layout.astro`
- Modify: `apps/blog/src/components/Header.astro`

**Interfaces:**
- Consumes: `Layout` 的 `title`、`description`、`image` 与新增可选 `pageKind`。
- Produces: `.site-frame`、`.desktop-sidebar`、`.mobile-header`、`.site-content` DOM 契约。

- [ ] **Step 1: 写失败测试**

增加测试，断言 `Layout.astro` 不再包含 `max-w-2xl`，而是包含 `site-frame`、`site-content` 和 `pageKind`；断言 `Header.astro` 包含 `desktop-sidebar`、`mobile-header`、博客、关于与共享主题切换逻辑。

- [ ] **Step 2: 验证测试因旧结构失败**

运行：

```bash
node --test tests/blog/blog-content.test.mjs
```

预期：失败信息指出缺少新的宽屏布局类。

- [ ] **Step 3: 实现外层结构**

`Layout.astro` 接受 `pageKind?: "index" | "article"`，默认 `article`；body 内使用：

```astro
<div class:list={["site-frame", `page-${pageKind}`]}>
  <Header />
  <div class="site-content"><slot /></div>
</div>
```

`Header.astro` 输出同一组品牌和导航的桌面侧栏与移动头部；主题按钮使用 `.theme-toggle` 类和同一脚本同时更新所有按钮。

- [ ] **Step 4: 验证布局契约通过**

运行相同测试，预期新布局断言通过。

### Task 2: 建立标签与时间轴首页

**Files:**
- Modify: `tests/blog/blog-content.test.mjs`
- Modify: `apps/blog/src/pages/index.astro`

**Interfaces:**
- Consumes: `getCollection("blog")` 返回的文章 `id`、`date`、`title`、`description`、`tags`。
- Produces: `.tag-filter`、`.timeline-year`、`.timeline-entry[data-tags]` 与稳定文章链接。

- [ ] **Step 1: 写失败测试**

断言首页源码包含“全部”、年份 `<time>`、`data-tags`、`aria-pressed`、三篇文章路径以及筛选脚本；构建输出必须按日期倒序显示 `07-19`、`07-18`。

- [ ] **Step 2: 验证测试因旧首页失败**

运行博客内容测试，预期失败信息指出缺少标签或时间轴结构。

- [ ] **Step 3: 实现首页数据分组**

从所有文章标签生成去重列表；按年份分组，每组按日期倒序。首页调用 `<Layout pageKind="index">`，输出站点介绍、标签按钮与时间轴。每篇文章的 `data-tags` 使用 JSON 字符串，链接保持 `/blog/${post.id}/`。

- [ ] **Step 4: 实现渐进增强筛选**

脚本监听 `.tag-filter` 点击，只隐藏不包含所选标签的 `.timeline-entry`，同步 `aria-pressed`；“全部”恢复所有文章。脚本不存在时默认无 `hidden` 属性。

- [ ] **Step 5: 验证首页契约通过**

运行内容测试，预期标签、时间轴、顺序与旧内部链接测试全部通过。

### Task 3: 实现宽屏与移动视觉

**Files:**
- Modify: `tests/blog/blog-content.test.mjs`
- Modify: `apps/blog/src/styles/global.css`

**Interfaces:**
- Consumes: Task 1 与 Task 2 的类名。
- Produces: 1440px 桌面网格、248px 侧栏、760px 文章宽度和 64rem 移动断点。

- [ ] **Step 1: 写失败样式契约**

断言 CSS 包含 `max-width: 90rem`、`grid-template-columns: 15.5rem minmax(0, 1fr)`、`position: sticky`、文章 `max-width: 47.5rem`、`@media (max-width: 64rem)`、时间轴与标签类。

- [ ] **Step 2: 验证旧 CSS 失败**

运行内容测试，预期缺少新宽屏规则。

- [ ] **Step 3: 实现桌面样式**

`.site-frame` 使用宽屏网格；`.desktop-sidebar` 为 sticky 玻璃面板；`.site-content` 可伸展；首页主面板占满右栏；标签为胶囊按钮；时间轴使用边框竖线和品牌色节点；标题、摘要与日期形成三列。

- [ ] **Step 4: 实现文章与移动样式**

`.page-article .site-content` 内主内容限制 `47.5rem`；小于 `64rem` 时隐藏桌面侧栏、显示移动头部、改成单列，并把时间轴压成日期加内容两列；小于 `40rem` 时进一步缩小内边距与背景模糊。

- [ ] **Step 5: 验证测试和构建**

运行：

```bash
node --test tests/**/*.test.mjs
pnpm --dir apps/blog build
```

预期：50 项以上测试全部通过，Astro 生成首页和三篇文章。

### Task 4: 浏览器视觉与交互验收

**Files:**
- Create: `design-qa.md`

**Interfaces:**
- Consumes: 本地 Astro 预览与用户参考截图。
- Produces: `final result: passed` 的设计 QA 记录。

- [ ] **Step 1: 启动本地预览**

运行 Astro dev server，使用真实浏览器打开首页。

- [ ] **Step 2: 检查桌面端**

在约 `1536×960` 视口确认左侧栏、宽内容、标签、时间轴、主题切换和文章跳转；记录截图并与参考图比较。

- [ ] **Step 3: 检查移动端**

在 `390×844` 视口确认侧栏隐藏、移动导航显示、无横向滚动、标签与文章均可操作。

- [ ] **Step 4: 检查文章页**

打开《百年孤独》文章，确认正文不超过舒适行宽、两张图片显示、浅色模式可读。

- [ ] **Step 5: 完成设计 QA**

在 `design-qa.md` 记录参考目标、视口、交互、差异与修复；所有 P0/P1/P2 清零后写入 `final result: passed`。

### Task 5: NAS 部署与公网验收

**Files:**
- Deploy: NAS `/volume1/web/dlc-space/apps/blog`

**Interfaces:**
- Consumes: 已通过本地测试和设计 QA 的博客源码。
- Produces: `https://blog.dailecheng.xyz/` 新布局。

- [ ] **Step 1: 同步四个改动文件**

通过 NAS 支持的 SSH tar 数据流同步 `Layout.astro`、`Header.astro`、`index.astro` 与 `global.css`。

- [ ] **Step 2: 只重建博客容器**

在 NAS 的 `deploy` 目录执行 `docker-compose build dlc-blog` 与 `up -d --no-deps dlc-blog`，不重启起始页。

- [ ] **Step 3: 等待健康并验收公网**

确认容器 `healthy`；正式域名首页、新文章、两张图片和 RSS 返回 `200`；公网 HTML 包含宽屏侧栏、标签和时间轴类。
