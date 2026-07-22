import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const expectedBrandScript = `document.title = "DLC 空间 · 网址集";

function labelDlcLogo() {
  document.querySelectorAll('img[src$="/dlc-logo.svg"]').forEach((logo) => {
    logo.alt = "DLC 空间 Logo";
    logo.setAttribute("aria-label", "DLC 空间");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", labelDlcLogo, { once: true });
} else {
  labelDlcLogo();
}`;

function normalizeText(content) {
  return content.replace(/\r\n/g, "\n").trim();
}

function assertNoImportedCss(css) {
  assert.doesNotMatch(css, /@import\b/i, "CSS 不得通过 @import 加载资源");
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//i, "CSS 不得加载远程资源");
}

test("DLC 主题信息正确", async () => {
  const info = JSON.parse(await read("apps/web/src/templates/dlc/info.json"));

  assert.equal(info.name, "DLC 极光深海");
});

test("OneNav DLC 主题呈现极光深海主题", async () => {
  const css = await read("apps/web/src/templates/dlc/static/style.css");

  for (const color of ["#090e19", "#111a2e", "#55d6be", "#3b82f6", "#eff6ff"]) {
    assert.match(css, new RegExp(color), `缺少主题色 ${color}`);
  }

  assert.match(css, /:root\s*{[^}]*--dlc-/s, "应通过 CSS 变量集中定义主题");
  assert.match(css, /body(?:\s*,|\s*{)/, "应覆盖页面背景");
  assert.match(css, /backdrop-filter\s*:/, "卡片应使用玻璃模糊");
  assert.match(css, /@media\s*\(max-width\s*:/, "应适配移动端");
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/,
    "应尊重减少动效偏好",
  );
  assertNoImportedCss(css);
});

test("DLC 主题品牌脚本只设置标题与 Logo 无障碍属性", async () => {
  const js = await read("apps/web/src/templates/dlc/static/embed.js");

  assert.equal(normalizeText(js), expectedBrandScript);
});

test("OneNav Logo 与共享品牌资产完全一致", async () => {
  const [sharedLogo, webLogo] = await Promise.all([
    read("shared/branding/dlc-logo.svg"),
    read("apps/web/src/templates/dlc/static/dlc-logo.svg"),
  ]);

  assert.equal(webLogo, sharedLogo);
});

test("seed 脚本包含三个分类和六个个人站点 URL", async () => {
  const seed = await read("apps/web/scripts/seed.php");

  for (const category of ["个人站点", "常用工具", "开发资源"]) {
    assert.match(seed, new RegExp(category), `缺少分类 ${category}`);
  }

  for (const url of [
    "https://blog.dailecheng.xyz/",
    "https://pan.dailecheng.xyz/",
    "https://audio.dailecheng.xyz/",
    "https://me.dailecheng.xyz/",
    "https://web.dailecheng.xyz/",
    "https://hot.dailecheng.xyz/",
  ]) {
    assert.match(seed, new RegExp(url.replace(/\//g, "\\/")), `缺少链接 ${url}`);
  }
});
