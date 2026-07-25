# 《百年孤独》读后感创作与发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创作约 500 字的《百年孤独》中文读后感和两张原创插画，经用户确认后发布到 DLC 博客。

**Architecture:** 预览阶段只产出文字和图片，不改博客内容。用户确认后，新建一篇 Astro Markdown 文章，把优化后的 WebP 图片放入博客公共目录，再完成本地构建、NAS 重建与正式域名验收。

**Tech Stack:** 中文 Markdown、Astro Content Collections、AI 原创插画、WebP、Docker Compose、Nginx。

## Global Constraints

- 标题固定为 `在时间的圆环里，读懂孤独——《百年孤独》读后感`。
- 正文保持 450—650 个中文字符，采用“引—议—联—结”结构。
- 不大段复述情节，不虚构作者原话，不提前揭示关键结局。
- 生成两张无文字、横向构图的原创插画，不复制书封或影视剧照。
- 用户确认预览前，不创建博客文章文件，不重建或部署 NAS 博客。

---

### Task 1: 完成文字预览

**Files:**
- Inspect: `apps/blog/src/content/blog/about-dlc-space.md`
- Inspect: `apps/blog/src/content/blog/hello-dlc-space.md`

**Interfaces:**
- Consumes: 已确认的个人感悟型文章设计。
- Produces: 一篇可供用户审阅的约 500 字中文正文。

- [ ] **Step 1: 读取博客现有文章格式与语气**

运行：

```bash
sed -n '1,220p' apps/blog/src/content/blog/about-dlc-space.md
sed -n '1,220p' apps/blog/src/content/blog/hello-dlc-space.md
```

预期：确认 frontmatter 字段、标题层级和图片 Markdown 写法。

- [ ] **Step 2: 写作正文**

正文必须依次完成作品引入、孤独与时间循环的核心感受、现实联系、阅读所得四部分；不使用空泛小标题，不引用无法核实的原句。

- [ ] **Step 3: 检查文字质量**

人工检查剧情与人物名称，统计去除 Markdown 后的正文字符数，并进行中文自然化复核。预期字符数位于 450—650，且没有“首先、其次、最后”式模板化串联。

### Task 2: 生成两张原创配图

**Files:**
- Create: preview image `macondo-rain.webp`
- Create: preview image `parchment-butterflies.webp`

**Interfaces:**
- Consumes: 文章的孤独、时间循环、马孔多意象。
- Produces: 两张用于预览并可直接发布的横向 WebP 图片。

- [ ] **Step 1: 生成雨中马孔多头图**

提示词明确要求：拉丁美洲热带小镇、绵长雨季、被植物包围的老宅、深绿青金与微暖金色、电影感横向构图、原创魔幻现实主义氛围、无人物特写、无文字、无水印、不得模仿具体在世艺术家。

- [ ] **Step 2: 生成羊皮卷文中图**

提示词明确要求：黄昏室内、摊开的古老羊皮卷、黄色蝴蝶、热带植物影子、时间循环的视觉暗示、深青与琥珀配色、原创横向插画、无文字、无水印、不得复制具体书封或影视画面。

- [ ] **Step 3: 检查图片**

逐张确认主体完整、没有乱码文字或水印、构图适合桌面与移动端裁切；不合格时只重做对应图片。

### Task 3: 提交预览并等待确认

**Files:**
- No repository changes.

**Interfaces:**
- Consumes: Task 1 正文与 Task 2 两张图片。
- Produces: 用户明确的“发布”许可或具体修改意见。

- [ ] **Step 1: 展示完整预览**

同一条回复中展示标题、正文、两张图片及建议插入位置，并说明当前尚未发布。

- [ ] **Step 2: 等待用户确认**

收到明确发布许可后才执行 Task 4；收到修改意见则只修改预览并再次确认。

### Task 4: 发布到博客并验证

**Files:**
- Create: `apps/blog/src/content/blog/one-hundred-years-of-solitude-review.md`
- Create: `apps/blog/public/images/blog/one-hundred-years-of-solitude/macondo-rain.webp`
- Create: `apps/blog/public/images/blog/one-hundred-years-of-solitude/parchment-butterflies.webp`
- Test: `tests/blog/blog-build.test.mjs`

**Interfaces:**
- Consumes: 用户确认的最终正文和配图。
- Produces: `https://blog.dailecheng.xyz/blog/one-hundred-years-of-solitude-review/`。

- [ ] **Step 1: 增加文章发布契约测试**

测试读取 Markdown 文件，断言标题、日期、标签 `阅读` 与 `文学`、两条图片路径和固定 slug 均存在；运行该测试并确认因文章尚不存在而失败。

- [ ] **Step 2: 创建文章与图片目录**

frontmatter 使用博客现有字段规范，日期使用实际发布日期；正文采用用户确认版本，两张图片依次放在引言后和现实联系前。

- [ ] **Step 3: 本地验证**

运行：

```bash
pnpm test
pnpm --filter @dlc/blog build
```

预期：全部测试通过，Astro 构建成功，生成固定文章路径，构建输出中两张图片可访问。

- [ ] **Step 4: 部署 NAS**

同步文章和图片到 `/volume1/web/dlc-space`，在 `deploy` 目录重建并启动 `dlc-blog`，等待容器恢复 `healthy`。

- [ ] **Step 5: 正式域名验收**

请求首页、新文章、两张图片和 RSS；预期均返回 `200`，首页出现新文章标题，文章内部图片与返回链接正常。
