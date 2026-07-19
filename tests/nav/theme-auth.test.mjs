import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Homepage 使用稳定选择器呈现极光深海主题", async () => {
  const css = await read("apps/nav/config/custom.css");

  for (const color of ["#090e19", "#111a2e", "#55d6be", "#3b82f6", "#eff6ff"]) {
    assert.match(css, new RegExp(color), `缺少主题色 ${color}`);
  }

  assert.match(css, /:root\s*{[^}]*--dlc-/s, "应通过 CSS 变量集中定义主题");
  assert.match(css, /body(?:\s*,|\s*{)/, "应覆盖页面背景");
  assert.match(css, /body::before/, "应提供极光光晕层");
  assert.match(css, /#page_wrapper/, "应使用 Homepage 稳定页面容器");
  assert.match(css, /#information-widgets/, "应覆盖 Homepage 信息组件区");
  assert.match(css, /\.service-card/, "应覆盖 Homepage 服务卡片");
  assert.match(css, /\.widget-container/, "应覆盖 Homepage 组件容器");
  assert.match(css, /#information-widgets[^{}]*input/, "应覆盖搜索输入框");
  assert.match(css, /#page_wrapper[^{}]*h[23]/, "应覆盖组件标题");
  assert.match(css, /backdrop-filter\s*:/, "卡片应使用玻璃模糊");
  assert.match(css, /::-webkit-scrollbar/, "应定制滚动条");
  assert.match(css, /@media\s*\(max-width\s*:/, "应适配移动端");
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/,
    "应尊重减少动效偏好",
  );
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "CSS 不得加载远程资源");
  assert.doesNotMatch(css, /\.[A-Za-z_-]+__[A-Za-z0-9_-]{5,}/, "不得依赖构建生成的哈希类");
});

test("Homepage 品牌脚本只设置标题与 Logo 无障碍属性", async () => {
  const js = await read("apps/nav/config/custom.js");

  assert.match(js, /document\.title\s*=\s*["']DLC 空间 · 起始页["']/);
  assert.match(js, /querySelectorAll\(\s*(["'])[^\n]*dlc-logo\.svg[^\n]*\1\s*\)/);
  assert.match(js, /\.alt\s*=\s*["']DLC 空间 Logo["']/);
  assert.match(js, /setAttribute\(\s*["']aria-label["']\s*,\s*["']DLC 空间["']\s*\)/);

  assert.doesNotMatch(js, /\b(?:cookie|localStorage|sessionStorage)\b/);
  assert.doesNotMatch(js, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
  assert.doesNotMatch(js, /\b(?:createElement|innerHTML|insertAdjacentHTML)\b/);
  assert.doesNotMatch(js, /\bimport\s*\(/);
  assert.doesNotMatch(js, /https?:\/\//i, "脚本不得引用远程资源");
});

test("Homepage Logo 与共享品牌资产完全一致", async () => {
  const [sharedLogo, navLogo] = await Promise.all([
    read("shared/branding/dlc-logo.svg"),
    read("apps/nav/config/icons/dlc-logo.svg"),
  ]);

  assert.equal(navLogo, sharedLogo);
});

test("Caddy 仅通过环境变量认证并代理到 dlc-nav", async () => {
  const caddyfile = await read("deploy/auth/Caddyfile");

  assert.match(
    caddyfile,
    /basic_auth\s*\{\s*\{\$NAV_USERNAME\}\s+\{\$NAV_PASSWORD_HASH\}\s*\}/s,
    "basic_auth 必须精确使用用户名与密码哈希环境变量",
  );
  assert.match(caddyfile, /reverse_proxy\s+dlc-nav:3000(?:\s|$)/);
  assert.equal((caddyfile.match(/\bbasic_auth\b/g) ?? []).length, 1);
  assert.equal((caddyfile.match(/\breverse_proxy\b/g) ?? []).length, 1);
  assert.doesNotMatch(caddyfile, /\{\$NAV_(?:USERNAME|PASSWORD_HASH):[^}]+\}/, "认证变量不得有默认值");
  assert.doesNotMatch(caddyfile, /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/, "不得提交 bcrypt 哈希");
  assert.doesNotMatch(caddyfile, /\$argon2(?:id|i|d)\$/i, "不得提交 argon2 哈希");
});
