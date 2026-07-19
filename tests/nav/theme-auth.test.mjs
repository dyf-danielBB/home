import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const expectedBrandScript = `document.title = "DLC 空间 · 起始页";

function labelDlcLogo() {
  document.querySelectorAll('img[src$="/icons/dlc-logo.svg"]').forEach((logo) => {
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

function assertBrandScript(js) {
  assert.equal(
    normalizeText(js),
    expectedBrandScript,
    "品牌脚本必须与允许的 title 和 Logo 无障碍操作完全一致",
  );
}

function matchingBrace(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  assert.fail("Caddy 站点块缺少闭合花括号");
}

function assertCaddyContract(caddyfile) {
  const source = normalizeText(caddyfile);
  assert.doesNotMatch(source, /\b(?:route|order)\b/, "不得使用可改变指令顺序的 route/order");
  assert.match(source, /^:80\s*\{/, "Caddyfile 必须只定义 :80 站点块");

  const openingIndex = source.indexOf("{");
  const closingIndex = matchingBrace(source, openingIndex);
  assert.equal(source.slice(closingIndex + 1).trim(), "", "Caddyfile 不得定义额外全局或站点块");

  const siteBlock = source.slice(openingIndex + 1, closingIndex).replace(/\s+/g, " ").trim();
  assert.equal(
    siteBlock,
    "basic_auth { {$NAV_USERNAME} {$NAV_PASSWORD_HASH} } reverse_proxy dlc-nav:3000",
    "站点块必须先 basic_auth，再唯一 reverse_proxy 到 dlc-nav:3000",
  );

  assert.deepEqual(
    [...source.matchAll(/\{\$([^}]+)\}/g)].map((match) => match[1]),
    ["NAV_USERNAME", "NAV_PASSWORD_HASH"],
    "Caddyfile 只允许两个无默认值的认证环境变量",
  );
}

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
  assertNoImportedCss(css);
  assert.doesNotMatch(css, /\.[A-Za-z_-]+__[A-Za-z0-9_-]{5,}/, "不得依赖构建生成的哈希类");
});

test("CSS 资源契约拒绝字符串与 URL 形式的 @import", () => {
  assert.throws(() => assertNoImportedCss('@import "https://evil.example/theme.css";'));
  assert.throws(() => assertNoImportedCss('@import url("//evil.example/theme.css");'));
});

test("Homepage 品牌脚本只设置标题与 Logo 无障碍属性", async () => {
  const js = await read("apps/nav/config/custom.js");

  assertBrandScript(js);
});

test("品牌脚本白名单拒绝额外 DOM 操作", () => {
  assert.throws(
    () => assertBrandScript(`${expectedBrandScript}\ndocument.body.hidden = true;`),
    /必须与允许的/,
  );
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

  assertCaddyContract(caddyfile);
});

test("Caddy 契约拒绝 route 改序、order 和任何默认或明文凭证", () => {
  const unsafeFixtures = [
    `:80 {
      route {
        reverse_proxy dlc-nav:3000
        basic_auth {
          {$NAV_USERNAME} {$NAV_PASSWORD_HASH}
        }
      }
    }`,
    `:80 {
      reverse_proxy dlc-nav:3000
      basic_auth {
        {$NAV_USERNAME} {$NAV_PASSWORD_HASH}
      }
    }`,
    `{
      order reverse_proxy before basic_auth
    }
    :80 {
      basic_auth {
        {$NAV_USERNAME} {$NAV_PASSWORD_HASH}
      }
      reverse_proxy dlc-nav:3000
    }`,
    `:80 {
      basic_auth {
        admin plaintext-password
      }
      reverse_proxy dlc-nav:3000
    }`,
    `:80 {
      basic_auth {
        {$NAV_USERNAME:admin} {$NAV_PASSWORD_HASH:default-hash}
      }
      reverse_proxy dlc-nav:3000
    }`,
    `:80 {
      basic_auth {
        admin $2b$12$12345678901234567890123456789012345678901234567890123
      }
      reverse_proxy dlc-nav:3000
    }`,
  ];

  for (const fixture of unsafeFixtures) {
    assert.throws(() => assertCaddyContract(fixture));
  }
});
