import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const blogDirectory = new URL("../../apps/blog/", import.meta.url);
const generatedDirectories = new Set([".astro", "dist", "node_modules"]);
const blogConfigurationFiles = new Set([
  ".dockerignore",
  "Dockerfile",
  "UPSTREAM.md",
  "compose.yml",
]);
const dlcCustomizationFiles = new Set([
  "public/dlc-logo.svg",
  "src/components/Head.astro",
  "src/components/Header.astro",
  "src/consts.ts",
  "src/content/blog/about-dlc-space.md",
  "src/content/blog/hello-dlc-space.md",
  "src/content.config.ts",
  "src/layouts/Layout.astro",
  "src/pages/blog/[...slug].astro",
  "src/pages/index.astro",
  "src/pages/rss.xml.js",
  "src/styles/global.css",
]);
const upstreamBlobs = {
  ".gitignore": "16d54bb13c8a867268b45c22eb7794d2625a78f5",
  ".prettierrc": "4dd99c10439860488aa995c904b33bf146345079",
  ".vscode/extensions.json": "56f043d30eefadaf2cc819f2eb7949e75e1c315d",
  ".vscode/launch.json": "d6422097621fd7c1b1ccc6daa670c46aed7ef5b7",
  LICENSE: "9b6046a6d660b85051028a9c64de8a38f0400d76",
  "README.md": "0636812465e3673af166a3a3fe53c8724fcc59bf",
  "astro.config.mjs": "c583ea997d2eebd18a9ede88f3bb381f559cab6f",
  "package.json": "69014654d4119205fafc4dedb6836313d416d7c7",
  "pnpm-lock.yaml": "47e00a1b80354a652bb47939c67064f9486a1b15",
  "public/favicon.ico": "7f48a94d16071d6c8d06478c7458ab12e675019c",
  "public/favicon.svg": "f157bd1c5e287c70a508a98a13f538491aa4dafc",
  "src/assets/blog-placeholder-1.jpg": "c4214b0e639a782769ea329846e51ec066b7976e",
  "src/assets/blog-placeholder-2.jpg": "fbe2ac0cb0c744ddfa28d406c0e90956a3398aaa",
  "src/components/Link.astro": "3ed382d64cba4a7d4d44e00206e330852db1048d",
  "src/lib/utils.ts": "a5ef193506d07d0459fec4f187af08283094d7c8",
  "src/pages/404.astro": "bcc9ea45c9761d637d87caeb01adde9fbc720fd8",
  "src/pages/500.astro": "dd032cafd675c1ffe1fc90bcbef0952e7ae43221",
  "tsconfig.json": "0dc098dd7eaaa2de4938c719e71981b193087a1f",
};

const readBlogFile = (file) => readFile(new URL(file, blogDirectory), "utf8");
const hasExpectedPublicPort = (compose) =>
  /^ {4}ports:\r?\n {6}- ["']\$\{BLOG_PORT:-3101\}:80["']\r?$/m.test(compose);
const hasRootHealthCheck = (compose) =>
  /^ {4}healthcheck:\r?\n {6}test: \["CMD-SHELL", "(?:curl -fsS|wget -q --spider) http:\/\/localhost\/ \|\| exit 1"\]\r?$/m.test(
    compose,
  );

async function listSourceFiles(directory = blogDirectory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      if (!generatedDirectories.has(entry.name)) {
        files.push(...(await listSourceFiles(new URL(`${entry.name}/`, directory), relativePath)));
      }
      continue;
    }

    if (entry.isFile() && !blogConfigurationFiles.has(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function gitBlobHash(contents) {
  return createHash("sha1").update(`blob ${contents.byteLength}\0`).update(contents).digest("hex");
}

test("records the exact Miniblog upstream revision", async () => {
  const upstream = await readBlogFile("UPSTREAM.md");

  assert.match(upstream, /3d840c3ecde0dcfb91bca14a95d7cb93714ef9d9/);
});

test("uses exact pinned build and runtime images without latest", async () => {
  const dockerfile = await readBlogFile("Dockerfile");

  assert.match(dockerfile, /^FROM node:22\.17\.0-alpine AS build$/m);
  assert.match(dockerfile, /^FROM nginx:1\.28\.0-alpine$/m);
  assert.match(dockerfile, /pnpm build/);
  assert.doesNotMatch(dockerfile, /:latest\b/);
});

test("defines the dlc-blog service, public port, and root health check", async () => {
  const compose = await readBlogFile("compose.yml");

  assert.match(compose, /container_name:\s*dlc-blog/);
  assert.ok(hasExpectedPublicPort(compose));
  assert.ok(hasRootHealthCheck(compose));
  assert.doesNotMatch(compose, /:latest\b/);
});

test("rejects loopback-only port mappings", () => {
  const loopbackOnlyCompose = '    ports:\n      - "127.0.0.1:${BLOG_PORT:-3101}:80"';

  assert.equal(hasExpectedPublicPort(loopbackOnlyCompose), false);
});

test("rejects health checks outside the root path", () => {
  const privateHealthCheckCompose =
    '    healthcheck:\n      test: ["CMD-SHELL", "wget -q --spider http://localhost/private || exit 1"]';

  assert.equal(hasRootHealthCheck(privateHealthCheckCompose), false);
});

test("excludes local dependencies, build output, secrets, logs, and editor files from Docker", async () => {
  const patterns = new Set(
    (await readBlogFile(".dockerignore"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );

  for (const pattern of [
    ".git",
    "node_modules",
    "dist",
    ".astro",
    ".env*",
    "*.log",
    ".vscode",
    ".idea",
  ]) {
    assert.ok(patterns.has(pattern), `missing Docker ignore pattern: ${pattern}`);
  }
});

test("preserves 18 untouched upstream files and the exact DLC customization surface", async () => {
  const sourceFiles = await listSourceFiles();
  const expectedFiles = [...Object.keys(upstreamBlobs), ...dlcCustomizationFiles];

  assert.equal(Object.keys(upstreamBlobs).length, 18);
  assert.equal(dlcCustomizationFiles.size, 12);
  assert.deepEqual(sourceFiles.sort(), expectedFiles.sort());

  for (const [file, expectedBlob] of Object.entries(upstreamBlobs)) {
    assert.equal(
      gitBlobHash(await readFile(new URL(file, blogDirectory))),
      expectedBlob,
      `${file} changed`,
    );
  }
});

test("contains no nested Git metadata or gitlinks", async () => {
  const entries = await readdir(blogDirectory, { recursive: true });
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage", "--", "apps/blog"]);

  assert.ok(!entries.some((entry) => entry === ".git" || entry.endsWith("/.git")));
  assert.doesNotMatch(stdout, /^160000\s/m);
});
