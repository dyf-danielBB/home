import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const smokeScript = join(projectDirectory, "deploy/scripts/smoke-test.sh");
const readProjectFile = (path) => readFile(join(projectDirectory, path), "utf8");

async function run(command, arguments_, options = {}) {
  return execFileAsync(command, arguments_, {
    cwd: projectDirectory,
    encoding: "utf8",
    ...options,
  });
}

async function writeExecutable(path, contents) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function makeSmokeFixture({ env } = {}) {
  const root = await mkdtemp(join(tmpdir(), "dlc-phase1-smoke-"));
  const scriptsDirectory = join(root, "deploy/scripts");
  const binDirectory = join(root, "bin");
  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(binDirectory);
  await cp(smokeScript, join(scriptsDirectory, "smoke-test.sh"));

  if (env !== undefined) await writeFile(join(root, "deploy/.env"), env);

  return { root, scriptsDirectory, binDirectory };
}

async function runSmoke(fixture, environment = {}) {
  try {
    const result = await run("/bin/sh", [join(fixture.scriptsDirectory, "smoke-test.sh")], {
      env: { PATH: fixture.binDirectory, ...environment },
    });
    return { status: 0, ...result };
  } catch (error) {
    return {
      status: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

test("主页保留其他链接且四个 DLC 入口各有唯一 URL", async () => {
  const links = JSON.parse(await readProjectFile("src/assets/siteLinks.json"));
  const expectedEntries = ["博客", "网盘", "起始页", "网址集"];

  assert.ok(Array.isArray(links), "siteLinks.json 必须是数组");
  for (const name of expectedEntries) {
    const matches = links.filter((entry) => entry.name === name);
    assert.equal(matches.length, 1, `${name} 入口必须恰好一个`);
    assert.match(matches[0].link, /^https:\/\/[^\s/]+\/$/, `${name} 必须使用完整 HTTPS URL`);
  }

  assert.equal(
    new Set(links.map((entry) => entry.link)).size,
    links.length,
    "主页链接 URL 不得重复",
  );
  assert.ok(links.some((entry) => !expectedEntries.includes(entry.name)), "不得覆盖用户的其他链接");
});

test("博客、起始页与 Compose 关键契约可从单条本地命令验收", async () => {
  const { NODE_TEST_CONTEXT: _testContext, ...standaloneEnvironment } = process.env;
  const { stdout, stderr } = await run(process.execPath, [
    "--test",
    "tests/blog/blog-content.test.mjs",
    "tests/nav/config.test.mjs",
    "tests/deploy/phase1-compose.test.mjs",
  ], { env: standaloneEnvironment });

  assert.equal(stderr, "");
  assert.match(stdout, /fail 0/);

  const [about, hello, rss] = await Promise.all([
    readProjectFile("apps/blog/dist/blog/about-dlc-space/index.html"),
    readProjectFile("apps/blog/dist/blog/hello-dlc-space/index.html"),
    readProjectFile("apps/blog/dist/rss.xml"),
  ]);
  assert.match(about, /DLC 空间/);
  assert.match(hello, /DLC 空间/);
  assert.match(rss, /about-dlc-space/);
  assert.match(rss, /hello-dlc-space/);
});

test("阶段一跟踪文件不包含真实敏感信息", async () => {
  const { stdout } = await run("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "src/assets/siteLinks.json",
    "apps/blog",
    "apps/nav",
    "shared",
    "deploy",
    "tests",
  ]);
  const trackedFiles = stdout.split("\0").filter(Boolean);
  const forbiddenPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    /^\s*(?!#)(?:PASSWORD|TOKEN|SECRET|API_KEY)\s*=\s*(?!replace-|example-|fixture|test)[^\s#]+/im,
  ];

  assert.ok(trackedFiles.length > 0, "必须找到阶段一跟踪文件");
  assert.ok(!trackedFiles.some((path) => basename(path) === ".env"), "不得跟踪 .env");

  for (const path of trackedFiles) {
    const contents = await readFile(join(projectDirectory, path));
    if (contents.includes(0)) continue;
    const text = contents.toString("utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(text, pattern, `${path} 疑似包含真实敏感信息`);
    }
  }
});

test("NAS 冒烟脚本安全处理本地、配置和凭证缺失", async () => {
  await access(smokeScript, constants.X_OK);
  const script = await readFile(smokeScript, "utf8");

  assert.match(script, /3101/);
  assert.match(script, /3105/);
  assert.match(script, /dlc-blog/);
  assert.match(script, /dlc-nav/);
  assert.match(script, /dlc-nav-auth/);
  assert.match(script, /--connect-timeout/);
  assert.match(script, /--max-time/);
  assert.match(script, /SMOKE_MAX_ATTEMPTS/);
  assert.doesNotMatch(script, /set\s+-x|docker\s+(?:compose\s+)?(?:down|rm|prune)|rm\s+-rf/);

  const noDocker = await makeSmokeFixture();
  const noDockerResult = await runSmoke(noDocker);
  assert.notEqual(noDockerResult.status, 0);
  assert.match(`${noDockerResult.stdout}${noDockerResult.stderr}`, /NAS.*Docker|Docker.*NAS/s);

  const noEnvironment = await makeSmokeFixture();
  await writeExecutable(join(noEnvironment.binDirectory, "docker"), "#!/bin/sh\nexit 0\n");
  const noEnvironmentResult = await runSmoke(noEnvironment);
  assert.notEqual(noEnvironmentResult.status, 0);
  assert.match(`${noEnvironmentResult.stdout}${noEnvironmentResult.stderr}`, /\.env/);

  const noCredentials = await makeSmokeFixture({ env: "BLOG_PORT=3101\nNAV_AUTH_PORT=3105\n" });
  await writeExecutable(join(noCredentials.binDirectory, "docker"), "#!/bin/sh\nexit 0\n");
  const noCredentialsResult = await runSmoke(noCredentials);
  assert.notEqual(noCredentialsResult.status, 0);
  assert.match(`${noCredentialsResult.stdout}${noCredentialsResult.stderr}`, /NAV_USERNAME/);
});

test("NAS 冒烟脚本检查三容器与 200、401、认证后 200", async () => {
  const password = "sensitive-password-sentinel";
  const passwordHash = "sensitive-hash-sentinel";
  const fixture = await makeSmokeFixture({
    env: [
      "BLOG_PORT=3101",
      "NAV_AUTH_PORT=3105",
      "NAV_USERNAME=smoke-user",
      `NAV_PASSWORD='${password}'`,
      `NAV_PASSWORD_HASH='${passwordHash}'`,
      "",
    ].join("\n"),
  });
  await writeExecutable(
    join(fixture.binDirectory, "docker"),
    `#!/bin/sh
case "$1" in
  info) exit 0 ;;
  inspect) printf '%s\\n' healthy ;;
  *) exit 1 ;;
esac
`,
  );
  await writeExecutable(
    join(fixture.binDirectory, "curl"),
    `#!/bin/sh
authenticated=0
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --user) authenticated=1; shift ;;
    http://*) url=$1 ;;
  esac
  shift
done
case "$url" in
  *:3101/*) printf '%s' 200 ;;
  *:3105/*) if [ "$authenticated" -eq 1 ]; then printf '%s' 200; else printf '%s' 401; fi ;;
  *) printf '%s' 000 ;;
esac
`,
  );

  const result = await runSmoke(fixture);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /三个容器.*健康|3 个容器.*健康/);
  assert.match(output, /3101.*200/s);
  assert.match(output, /3105.*401/s);
  assert.match(output, /认证.*3105.*200|3105.*认证.*200/s);
  assert.doesNotMatch(output, new RegExp(`${password}|${passwordHash}`));
});
