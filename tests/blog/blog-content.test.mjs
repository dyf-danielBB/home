import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test, { before } from "node:test";

const execFileAsync = promisify(execFile);
const projectDirectory = new URL("../../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const readBuiltFile = (path) =>
  readFile(new URL(`../../apps/blog/dist/${path}`, import.meta.url), "utf8");

before(async () => {
  const lockDirectory = join(tmpdir(), "dlc-blog-astro-build.lock");
  let acquired = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      await mkdir(lockDirectory);
      acquired = true;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(acquired, "等待另一个 Astro 构建结束超时");
  try {
    await execFileAsync("pnpm", ["--dir", "apps/blog", "build"], {
      cwd: fileURLToPath(projectDirectory),
    });
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
  }
});

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, "Markdown must start with frontmatter");

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        assert.notEqual(separator, -1, `invalid frontmatter line: ${line}`);
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['\"]|['\"]$/g, ""),
        ];
      }),
  );
}

function assertRequiredFrontmatter(markdown) {
  const frontmatter = parseFrontmatter(markdown);

  for (const field of ["title", "description", "date"]) {
    assert.ok(frontmatter[field], `missing frontmatter field: ${field}`);
  }

  assert.equal(Number.isNaN(Date.parse(frontmatter.date)), false, "date must be parseable");
  assert.match(markdown, /^tags:\s*\[[^\]]+\]$/m, "tags must be a non-empty YAML array");
}

test("uses the DLC Space title and canonical blog domain", async () => {
  const constants = await readProjectFile("apps/blog/src/consts.ts");

  assert.match(constants, /SITE_TITLE\s*=\s*["']DLC \u7a7a间["']/);
  assert.match(constants, /SITE_URL\s*=\s*["']https:\/\/blog\.dailecheng\.xyz["']/);
});

test("introduces all four DLC subsites and their public/private boundary", async () => {
  const article = await readProjectFile("apps/blog/src/content/blog/about-dlc-space.md");

  assertRequiredFrontmatter(article);
  for (const name of ["博客", "网盘", "起始页", "网址集"]) assert.match(article, new RegExp(name));
  assert.match(article, /公开/);
  assert.match(article, /私人/);
});

test("publishes a Markdown showcase with the expected reading elements", async () => {
  const article = await readProjectFile("apps/blog/src/content/blog/hello-dlc-space.md");

  assertRequiredFrontmatter(article);
  assert.match(article, /^#{1,6} .+/m, "missing heading");
  assert.match(article, /^[-*] .+/m, "missing list");
  assert.match(article, /^> .+/m, "missing blockquote");
  assert.match(article, /\[[^\]]+\]\(https?:\/\/[^)]+\)/, "missing link");
  assert.match(article, /`[^`\n]+`/, "missing inline code");
  assert.match(article, /```[\s\S]+?```/, "missing fenced code block");
});

test("provides branded, keyboard-operable navigation and theme control", async () => {
  const header = await readProjectFile("apps/blog/src/components/Header.astro");

  assert.match(header, /<img[^>]+src=["']\/dlc-logo\.svg["'][^>]+alt=["']DLC \u7a7a间["']/s);
  assert.match(header, /href=["']\/["'][^>]*>\s*\u535a客\s*</s);
  assert.match(header, /href=["']\/blog\/about-dlc-space\/["'][^>]*>\s*\u5173于\s*</s);
  assert.match(header, /<button[^>]+id=["']theme-toggle["'][^>]+aria-label=/s);
  assert.match(header, /localStorage/);
  assert.doesNotMatch(header, /localStorage\.getItem/);
});

test("applies the complete aurora theme with light reading mode and reduced motion", async () => {
  const [css, layout, sharedLogo, blogLogo] = await Promise.all([
    readProjectFile("apps/blog/src/styles/global.css"),
    readProjectFile("apps/blog/src/layouts/Layout.astro"),
    readProjectFile("shared/branding/dlc-logo.svg"),
    readProjectFile("apps/blog/public/dlc-logo.svg"),
  ]);

  for (const color of ["#090e19", "#111a2e", "#55d6be", "#3b82f6", "#eff6ff"]) {
    assert.match(css, new RegExp(color));
  }
  assert.match(css, /body::before/);
  assert.match(css, /backdrop-filter/);
  assert.match(css, /data-theme=["']?light/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(layout, /<html\s+lang=["']zh-CN["']/);
  assert.equal(blogLogo, sharedLogo, "blog logo must exactly match the shared brand asset");
});

test("builds all DLC articles, RSS entries, and canonical URLs", async () => {
  const [about, hello, review, index, rss] = await Promise.all([
    readBuiltFile("blog/about-dlc-space/index.html"),
    readBuiltFile("blog/hello-dlc-space/index.html"),
    readBuiltFile("blog/one-hundred-years-of-solitude-review/index.html"),
    readBuiltFile("index.html"),
    readBuiltFile("rss.xml"),
  ]);

  assert.match(
    about,
    /<link rel="canonical" href="https:\/\/blog\.dailecheng\.xyz\/blog\/about-dlc-space\/">/,
  );
  assert.match(
    hello,
    /<link rel="canonical" href="https:\/\/blog\.dailecheng\.xyz\/blog\/hello-dlc-space\/">/,
  );
  assert.match(
    review,
    /<link rel="canonical" href="https:\/\/blog\.dailecheng\.xyz\/blog\/one-hundred-years-of-solitude-review\/">/,
  );
  assert.match(rss, /<link>https:\/\/blog\.dailecheng\.xyz\/blog\/about-dlc-space\/<\/link>/);
  assert.match(rss, /<link>https:\/\/blog\.dailecheng\.xyz\/blog\/hello-dlc-space\/<\/link>/);
  assert.match(
    rss,
    /<link>https:\/\/blog\.dailecheng\.xyz\/blog\/one-hundred-years-of-solitude-review\/<\/link>/,
  );
  assert.match(index, /DLC 空间/);
  assert.doesNotMatch(index, /Miniblog is|Today|Writing|Projects/);
  assert.match(index, /#DLC/);
  assert.match(index, /href="\/blog\/about-dlc-space\/"/);
  assert.match(index, /href="\/blog\/hello-dlc-space\/"/);
  assert.match(index, /href="\/blog\/one-hundred-years-of-solitude-review\/"/);
  assert.doesNotMatch(index, /href="\/blog\/(?:about|hello)-dlc-space"/);
  assert.match(about, /#DLC/);
  assert.match(hello, /#开始/);
  assert.match(review, /#阅读/);
  assert.doesNotMatch(rss, /customizing-miniblog|making-miniblog|what-is-markdown/);

  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  assert.equal(items.length, 3, "RSS 必须公开三篇 DLC 文章");
  const dates = items.map((item) => {
    const value = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
    assert.ok(value, "每个 RSS item 必须包含 pubDate");
    return Date.parse(value);
  });
  assert.ok(dates.every(Number.isFinite), "RSS pubDate 必须可解析");
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), "RSS 必须按日期倒序");
});

test("内容集合只包含三篇带标签的 DLC 文章，favicon 使用 DLC Logo", async () => {
  const [schema, head] = await Promise.all([
    readProjectFile("apps/blog/src/content.config.ts"),
    readProjectFile("apps/blog/src/components/Head.astro"),
  ]);
  assert.match(schema, /tags:\s*z\.array\(z\.string\(\)\)\.min\(1\)/);
  for (const removed of ["customizing-miniblog", "making-miniblog", "what-is-markdown"]) {
    await assert.rejects(readProjectFile(`apps/blog/src/content/blog/${removed}.md`), /ENOENT/);
  }
  assert.match(head, /rel="icon"[^>]+href="\/dlc-logo\.svg"/);
  assert.doesNotMatch(head, /favicon\.(?:svg|ico)/);
});

test("restores the saved theme synchronously at the start of the real document head", async () => {
  const [layout, header, index] = await Promise.all([
    readProjectFile("apps/blog/src/layouts/Layout.astro"),
    readProjectFile("apps/blog/src/components/Header.astro"),
    readBuiltFile("index.html"),
  ]);
  const head = index.match(/<head>([\s\S]*?)<\/head>/)?.[1];

  assert.ok(head, "generated page must contain a head");
  const themeScriptIndex = head.indexOf("dlc-blog-theme");
  const stylesheetIndex = head.indexOf('rel="stylesheet"');
  assert.ok(themeScriptIndex >= 0, "theme restore script must be in head");
  assert.ok(stylesheetIndex >= 0, "generated page must include its stylesheet");
  assert.ok(
    themeScriptIndex < stylesheetIndex,
    "theme restore must run before the first stylesheet",
  );

  const scriptStart = head.lastIndexOf("<script", themeScriptIndex);
  const scriptOpen = head.slice(scriptStart, head.indexOf(">", scriptStart) + 1);
  assert.doesNotMatch(scriptOpen, /type=["']module["']/);
  assert.match(layout, /<head>\s*<script\s+is:inline>/s);
  assert.match(layout, /localStorage\.getItem\(["']dlc-blog-theme["']\)/);
  assert.doesNotMatch(header, /localStorage\.getItem/);
});

test("keeps Catppuccin Latte code tokens on their readable Shiki background", async () => {
  const [css, hello] = await Promise.all([
    readProjectFile("apps/blog/src/styles/global.css"),
    readBuiltFile("blog/hello-dlc-space/index.html"),
  ]);
  const preRule = css.match(/pre:has\(code\)\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.doesNotMatch(preRule, /background[^;]*!important/);
  assert.match(
    hello,
    /class="astro-code catppuccin-latte"[^>]+style="background-color:#eff1f5;color:#4c4f69/,
  );
});
