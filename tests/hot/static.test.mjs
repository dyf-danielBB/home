import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// 工作区路径含中文，需 fileURLToPath 解码（.pathname 会保留百分号编码导致 ENOENT）
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../apps/hot/", import.meta.url));

test("server.js 引用 API 构建产物与前端静态目录", () => {
  const src = readFileSync(`${root}server.js`, "utf8");
  assert.match(src, /api\/dist\/app\.js/);
  assert.match(src, /web\/dist/);
  assert.match(src, /PORT/);
});

test("前端 .env 的 VITE_GLOBAL_API 置空（同源请求）", () => {
  const env = readFileSync(`${root}web/.env`, "utf8");
  assert.match(env, /^VITE_GLOBAL_API\s*=\s*""\s*$/m);
  assert.doesNotMatch(env, /VITE_GLOBAL_API\s*=\s*"https?:\/\//);
});

test("start.sh 存在且调用 server.js", () => {
  const sh = readFileSync(`${root}start.sh`, "utf8");
  assert.match(sh, /server\.js/);
  assert.ok(existsSync(`${root}start.sh`));
});
