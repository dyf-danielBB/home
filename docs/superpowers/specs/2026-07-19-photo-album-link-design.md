# 相册集入口配置变更设计

## 目标

将个人主页网站列表中的“起始页”入口替换为“相册集”，并使其跳转到 `https://me.dailecheng.xyz/`。

## 变更范围

- 修改 `src/assets/siteLinks.json` 中现有“起始页”条目。
- 将 `name` 从 `起始页` 改为 `相册集`。
- 将 `link` 从 `https://nav.dailecheng.xyz/` 改为 `https://me.dailecheng.xyz/`。
- 保留 `Compass` 图标、卡片顺序、布局和新标签页跳转行为。

## 不在范围内

- 不新增相册页面或相册功能。
- 不修改其他站点入口。
- 不调整视觉样式、响应式布局或图标。

## 验收标准

- 配置文件中存在且仅存在一个名为“相册集”的入口。
- 该入口链接严格等于 `https://me.dailecheng.xyz/`。
- 原“起始页”和 `https://nav.dailecheng.xyz/` 不再出现在站点入口配置中。
- 项目生产构建成功。
