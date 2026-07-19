import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Homepage Compose 锁定版本、仅本机监听并限制允许的主机", async () => {
  const compose = await read("apps/nav/compose.yml");

  assert.match(compose, /image:\s*ghcr\.io\/gethomepage\/homepage:v1\.13\.1/);
  assert.match(compose, /container_name:\s*dlc-nav/);
  assert.match(compose, /127\.0\.0\.1:\$\{NAV_PORT:-3103\}:3000/);
  assert.match(compose, /HOMEPAGE_ALLOWED_HOSTS=nav\.dailecheng\.xyz/);
  assert.doesNotMatch(compose, /HOMEPAGE_ALLOWED_HOSTS=\*/);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/);
  assert.match(compose, /:\/app\/config:ro/);
  assert.match(compose, /healthcheck:/);
});

test("Homepage 配置使用中文深色卡片布局且书签为空", async () => {
  const [settings, bookmarks] = await Promise.all([
    read("apps/nav/config/settings.yaml"),
    read("apps/nav/config/bookmarks.yaml"),
  ]);

  assert.match(settings, /language:\s*zh-Hans/);
  assert.match(settings, /theme:\s*dark/);
  assert.match(settings, /headerStyle:\s*boxedWidgets/);
  assert.match(settings, /layout:\s*\n\s*DLC 空间:/);
  assert.equal(bookmarks.trim(), "[]");
});

test("信息组件提供搜索、日期时间与可通过环境变量覆盖的上海天气", async () => {
  const [widgets, env] = await Promise.all([
    read("apps/nav/config/widgets.yaml"),
    read("apps/nav/env.example"),
  ]);

  assert.match(widgets, /- search:/);
  assert.match(widgets, /- datetime:/);
  assert.match(widgets, /- openmeteo:/);
  assert.match(widgets, /latitude:\s*["']\{\{HOMEPAGE_VAR_LATITUDE\}\}["']/);
  assert.match(widgets, /longitude:\s*["']\{\{HOMEPAGE_VAR_LONGITUDE\}\}["']/);
  assert.match(env, /^HOMEPAGE_VAR_LATITUDE=31\.2304$/m);
  assert.match(env, /^HOMEPAGE_VAR_LONGITUDE=121\.4737$/m);
});

test("DLC 空间分组包含六个既有域名入口", async () => {
  const services = await read("apps/nav/config/services.yaml");
  const expectedUrls = [
    "https://dailecheng.xyz/",
    "https://blog.dailecheng.xyz/",
    "https://pan.dailecheng.xyz/",
    "https://web.dailecheng.xyz/",
    "https://hot.dailecheng.xyz/",
    "https://audio.dailecheng.xyz/",
  ];

  assert.match(services, /- DLC 空间:/);
  for (const url of expectedUrls) {
    assert.match(services, new RegExp(url.replaceAll(".", "\\.")), `缺少 ${url}`);
  }
});
