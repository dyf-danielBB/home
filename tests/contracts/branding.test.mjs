import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("DLC 品牌资源包含固定文案和色值", async () => {
  const [css, svg] = await Promise.all([
    readFile("shared/theme/tokens.css", "utf8"),
    readFile("shared/branding/dlc-logo.svg", "utf8"),
  ]);
  for (const token of ["#090e19", "#111a2e", "#55d6be", "#3b82f6", "#eff6ff"]) assert.match(css, new RegExp(token));
  assert.match(css, /--dlc-radius-card:\s*14px/);
  assert.match(css, /--dlc-radius-panel:\s*20px/);
  assert.match(svg, />DLC</);
});
