import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const webDirectory = new URL("../../apps/web/", import.meta.url);
const generatedDirectories = new Set([".git"]);
const webConfigurationFiles = new Set([
  ".dockerignore",
  "Dockerfile",
  "UPSTREAM.md",
  "compose.yml",
  "env.example",
]);

const readWebFile = (file) => readFile(new URL(file, webDirectory), "utf8");

const hasExpectedPublicPort = (compose) =>
  /^ {4}ports:\r?\n {6}- ["']\$\{WEB_PORT:-3104\}:80["']\r?$/m.test(compose);

const hasRootHealthCheck = (compose) =>
  /^ {4}healthcheck:\r?\n {6}test: \["CMD-SHELL", "(?:curl -fsS|wget -q --spider) http:\/\/localhost\/ \|\| exit 1"\]\r?$/m.test(
    compose,
  );

async function listSourceFiles(directory = webDirectory, relativeDirectory = "") {
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

    if (entry.isFile() && !webConfigurationFiles.has(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function gitBlobHash(contents) {
  return createHash("sha1").update(`blob ${contents.byteLength}\0`).update(contents).digest("hex");
}

test("records the exact OneNav upstream revision", async () => {
  const upstream = await readWebFile("UPSTREAM.md");

  assert.match(upstream, /https:\/\/github\.com\/helloxz\/onenav\.git/);
  assert.match(upstream, /011299a9fe4635e8be48cf66cb0833bae07e8c69/);
  assert.match(upstream, /v1\.2\.4/);
});

test("uses exact pinned PHP-Apache image without latest", async () => {
  const dockerfile = await readWebFile("Dockerfile");

  assert.match(dockerfile, /^FROM php:8\.2\.29-apache/m);
  assert.match(dockerfile, /pdo_sqlite/);
  assert.doesNotMatch(dockerfile, /:latest\b/);
});

test("defines the dlc-web service, public port, and root health check", async () => {
  const compose = await readWebFile("compose.yml");

  assert.match(compose, /container_name:\s*dlc-web/);
  assert.ok(hasExpectedPublicPort(compose));
  assert.ok(hasRootHealthCheck(compose));
  assert.doesNotMatch(compose, /:latest\b/);
  assert.match(compose, /\$\{DLC_DATA_ROOT\}\/web\/data:\/var\/www\/html\/data/);
});

test("rejects loopback-only port mappings", () => {
  const loopbackOnlyCompose = '    ports:\n      - "127.0.0.1:${WEB_PORT:-3104}:80"';

  assert.equal(hasExpectedPublicPort(loopbackOnlyCompose), false);
});

test("rejects health checks outside the root path", () => {
  const privateHealthCheckCompose =
    '    healthcheck:\n      test: ["CMD-SHELL", "wget -q --spider http://localhost/admin || exit 1"]';

  assert.equal(hasRootHealthCheck(privateHealthCheckCompose), false);
});

test("excludes local dependencies, build output, secrets, logs, and editor files from Docker", async () => {
  const patterns = new Set(
    (await readWebFile(".dockerignore"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );

  for (const pattern of [
    ".git",
    "node_modules",
    "dist",
    ".env*",
    "*.log",
    ".vscode",
    ".idea",
    "data",
  ]) {
    assert.ok(patterns.has(pattern), `missing Docker ignore pattern: ${pattern}`);
  }
});

test("contains no nested Git metadata or gitlinks", async () => {
  const entries = await readdir(webDirectory, { recursive: true });
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage", "--", "apps/web"]);

  assert.ok(!entries.some((entry) => entry === ".git" || entry.endsWith("/.git")));
  assert.doesNotMatch(stdout, /^160000\s/m);
});
