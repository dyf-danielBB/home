import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("PHP 文件语法正确（如果本机安装了 php）", async () => {
  try {
    await execFileAsync("php", ["--version"]);
  } catch {
    console.log("本机未安装 php，跳过 PHP 语法检查；请在 NAS 或安装 PHP 的环境运行 php -l");
    return;
  }

  const { stdout, stderr } = await execFileAsync("find", [
    "apps/web/src/templates/dlc",
    "apps/web/scripts",
    "-name",
    "*.php",
    "-exec",
    "php",
    "-l",
    "{}",
    "+",
  ]);

  const output = `${stdout}\n${stderr}`;
  const errors = output
    .split("\n")
    .filter((line) => line.includes("Parse error") || line.includes("Syntax error"));

  assert.equal(errors.length, 0, `发现 PHP 语法错误：\n${errors.join("\n")}`);
  assert.match(output, /No syntax errors detected/);
});
