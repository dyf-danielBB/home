import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

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
  assert.match(header, /href=["']\/blog\/about-dlc-space["'][^>]*>\s*\u5173于\s*</s);
  assert.match(header, /<button[^>]+id=["']theme-toggle["'][^>]+aria-label=/s);
  assert.match(header, /localStorage/);
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
