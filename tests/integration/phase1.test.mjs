import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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

  return {
    root,
    scriptsDirectory,
    binDirectory,
    logFile: join(root, "calls.log"),
    expectedConfigFile: join(root, "expected-curl-config"),
  };
}

async function runSmoke(fixture, environment = {}) {
  try {
    const result = await run("/bin/sh", [join(fixture.scriptsDirectory, "smoke-test.sh")], {
      env: { PATH: fixture.binDirectory, SMOKE_TEST_LOG: fixture.logFile, ...environment },
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

async function readSmokeLog(fixture) {
  try {
    return await readFile(fixture.logFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function installForwardingTimeout(fixture) {
  await writeExecutable(
    join(fixture.binDirectory, "timeout"),
    `#!/bin/sh
duration=$1
shift
command_name=$1
command_action=$2
target=
if [ "$command_action" = inspect ]; then
  for argument in "$@"; do target=$argument; done
fi
printf 'timeout:%s:%s:%s:%s\\n' "$duration" "$command_name" "$command_action" "$target" >> "$SMOKE_TEST_LOG"
exec "$@"
`,
  );
}

async function installHealthyDocker(fixture) {
  await writeExecutable(
    join(fixture.binDirectory, "docker"),
    `#!/bin/sh
case "$1" in
  info) printf '%s\\n' 'docker:info' >> "$SMOKE_TEST_LOG"; exit 0 ;;
  inspect)
    for argument in "$@"; do target=$argument; done
    printf 'docker:inspect:%s\\n' "$target" >> "$SMOKE_TEST_LOG"
    printf '%s\\n' healthy
    ;;
  *) exit 1 ;;
esac
`,
  );
}

function assertNoRealSecrets(path, text) {
  const forbiddenPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(text, pattern, `${path} 疑似包含真实敏感信息`);
  }

  const assignmentPattern = /(?:^|[\s{,;])(["']?[A-Z0-9_]*(?:PASSWORD(?:_HASH)?|TOKEN|SECRET|API_KEY)["']?)\s*(?:=|:)\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gim;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    for (const match of line.matchAll(assignmentPattern)) {
      const value = match[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
      const safeReference = /^\$\{[A-Z0-9_]+(?::[?+\-][^}]*)?\}$/i.test(value);
      const safePlaceholder =
        /^(?:replace|example|fixture|test)(?:[-_]|$)/i.test(value) || /^<[^>]+>$/.test(value);
      assert.ok(
        safeReference || safePlaceholder,
        `${path} 疑似对 ${match[1]} 进行了真实字面量赋值`,
      );
    }
  }
}

test("主页保留其他链接且四个 DLC 入口各有唯一 URL", async () => {
  const links = JSON.parse(await readProjectFile("src/assets/siteLinks.json"));
  const expectedEntries = new Map([
    ["博客", "https://blog.dailecheng.xyz/"],
    ["网盘", "https://pan.dailecheng.xyz/"],
    ["起始页", "https://nav.dailecheng.xyz/"],
    ["网址集", "https://web.dailecheng.xyz/"],
  ]);

  assert.ok(Array.isArray(links), "siteLinks.json 必须是数组");
  for (const [name, expectedUrl] of expectedEntries) {
    const matches = links.filter((entry) => entry.name === name || entry.link === expectedUrl);
    assert.equal(matches.length, 1, `${name} 入口必须恰好一个`);
    assert.equal(matches[0].name, name);
    assert.equal(matches[0].link, expectedUrl);
  }

  assert.equal(
    new Set(links.map((entry) => entry.link)).size,
    links.length,
    "主页链接 URL 不得重复",
  );
  assert.ok(links.some((entry) => !expectedEntries.has(entry.name)), "不得覆盖用户的其他链接");
});

test("博客、起始页与 Compose 关键契约可从单条本地命令验收", async () => {
  const completeTestFiles = async (directory) =>
    (await readdir(join(projectDirectory, directory)))
      .filter((file) => file.endsWith(".test.mjs"))
      .sort()
      .map((file) => `${directory}/${file}`);
  const selectedTests = [
    ...(await completeTestFiles("tests/blog")),
    ...(await completeTestFiles("tests/nav")),
    "tests/deploy/phase1-compose.test.mjs",
  ];
  const testSources = await Promise.all(selectedTests.map((path) => readProjectFile(path)));
  const expectedTestCount = testSources.reduce(
    (count, source) => count + (source.match(/^test\(/gm)?.length ?? 0),
    0,
  );
  const { NODE_TEST_CONTEXT: _testContext, ...standaloneEnvironment } = process.env;
  const { stdout, stderr } = await run(
    process.execPath,
    ["--test", ...selectedTests],
    { env: standaloneEnvironment },
  );

  assert.equal(stderr, "");
  assert.equal(expectedTestCount, 39);
  assert.match(stdout, new RegExp(`tests ${expectedTestCount}\\b`));
  assert.match(stdout, /fail 0/);
  assert.match(stdout, /records the exact Miniblog upstream revision/);
  assert.match(stdout, /Caddy 仅通过环境变量认证并代理到 dlc-nav/);

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
  ]);
  const trackedFiles = stdout.split("\0").filter(Boolean);

  assert.ok(trackedFiles.length > 0, "必须找到阶段一跟踪文件");
  assert.ok(!trackedFiles.some((path) => basename(path) === ".env"), "不得跟踪 .env");

  for (const path of trackedFiles) {
    const contents = await readFile(join(projectDirectory, path));
    if (contents.includes(0)) continue;
    assertNoRealSecrets(path, contents.toString("utf8"));
  }
});

test("敏感扫描拒绝非行首真实字面量并允许变量引用", () => {
  assert.throws(
    () => assertNoRealSecrets("fixture.yml", "service: { NAV_PASSWORD: 'actual-secret-value' }"),
    /真实字面量赋值/,
  );
  assert.doesNotThrow(() =>
    assertNoRealSecrets(
      "fixture.yml",
      'NAV_PASSWORD: "${NAV_PASSWORD}"\nNAV_PASSWORD_HASH: "${NAV_PASSWORD_HASH:?required}"',
    ),
  );
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
  assert.match(script, /SMOKE_COMMAND_TIMEOUT/);
  assert.match(script, /--config\s+-/);
  assert.doesNotMatch(
    script,
    /set\s+-[a-z]*[ax]|--user|docker\s+(?:compose\s+)?(?:down|rm|prune)|rm\s+-rf/,
  );

  for (const [variable, values] of [
    ["SMOKE_MAX_ATTEMPTS", ["0", "-1", "abc"]],
    ["SMOKE_COMMAND_TIMEOUT", ["0", "-2", "1.5"]],
  ]) {
    for (const value of values) {
      const invalid = await makeSmokeFixture();
      const result = await runSmoke(invalid, { [variable]: value });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, new RegExp(`${variable}.*十进制正整数`));
      assert.equal(await readSmokeLog(invalid), "", "无效参数不得触发 Docker/HTTP 检查");
    }
  }

  const noTimeout = await makeSmokeFixture();
  const noTimeoutResult = await runSmoke(noTimeout);
  assert.notEqual(noTimeoutResult.status, 0);
  assert.match(`${noTimeoutResult.stdout}${noTimeoutResult.stderr}`, /timeout/);

  const noDocker = await makeSmokeFixture();
  await installForwardingTimeout(noDocker);
  const noDockerResult = await runSmoke(noDocker);
  assert.notEqual(noDockerResult.status, 0);
  assert.match(`${noDockerResult.stdout}${noDockerResult.stderr}`, /NAS.*Docker|Docker.*NAS/s);

  const noEnvironment = await makeSmokeFixture();
  await installForwardingTimeout(noEnvironment);
  await installHealthyDocker(noEnvironment);
  const noEnvironmentResult = await runSmoke(noEnvironment);
  assert.notEqual(noEnvironmentResult.status, 0);
  assert.match(`${noEnvironmentResult.stdout}${noEnvironmentResult.stderr}`, /\.env/);

  const noCredentials = await makeSmokeFixture({ env: "BLOG_PORT=3101\nNAV_AUTH_PORT=3105\n" });
  await installForwardingTimeout(noCredentials);
  await installHealthyDocker(noCredentials);
  const noCredentialsResult = await runSmoke(noCredentials);
  assert.notEqual(noCredentialsResult.status, 0);
  assert.match(`${noCredentialsResult.stdout}${noCredentialsResult.stderr}`, /NAV_USERNAME/);
});

test("NAS 冒烟脚本检查三容器与 200、401、认证后 200", async () => {
  const password = 'sensitive\\password"sentinel';
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
  const escapedCredential = `smoke-user:${password}`
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  await writeFile(fixture.expectedConfigFile, `user = "${escapedCredential}"\n`, { mode: 0o600 });
  await installForwardingTimeout(fixture);
  await installHealthyDocker(fixture);
  await writeExecutable(join(fixture.binDirectory, "sed"), '#!/bin/sh\nexec /usr/bin/sed "$@"\n');
  await writeExecutable(
    join(fixture.binDirectory, "curl"),
    `#!/bin/sh
printf '%s' 'curl-argv:' >> "$SMOKE_TEST_LOG"
for argument in "$@"; do printf '<%s>' "$argument" >> "$SMOKE_TEST_LOG"; done
printf '\\n' >> "$SMOKE_TEST_LOG"
/usr/bin/env | while IFS='=' read -r name value; do
  printf 'curl-env:%s\\n' "$name" >> "$SMOKE_TEST_LOG"
done
authenticated=0
connect_timeout=
max_time=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config)
      [ "$2" = - ] || exit 91
      authenticated=1
      shift
      ;;
    --connect-timeout) connect_timeout=$2; shift ;;
    --max-time) max_time=$2; shift ;;
    --user) exit 92 ;;
    http://*) url=$1 ;;
  esac
  shift
done
[ "$connect_timeout" = 3 ] || exit 93
[ "$max_time" = 10 ] || exit 94
if [ "$authenticated" -eq 1 ]; then
  supplied_config=$(/bin/dd bs=4096 count=1 2>/dev/null)
  expected_config=$(/bin/cat "$SMOKE_EXPECTED_CONFIG_FILE")
  [ "$supplied_config" = "$expected_config" ] || exit 95
  printf '%s\\n' 'curl-stdin-config:valid' >> "$SMOKE_TEST_LOG"
fi
case "$url" in
  *:3101/*) printf '%s' 200 ;;
  *:3105/*) if [ "$authenticated" -eq 1 ]; then printf '%s' 200; else printf '%s' 401; fi ;;
  *) printf '%s' 000 ;;
esac
`,
  );

  const result = await runSmoke(fixture, {
    SMOKE_COMMAND_TIMEOUT: "7",
    SMOKE_EXPECTED_CONFIG_FILE: fixture.expectedConfigFile,
  });
  const output = `${result.stdout}${result.stderr}`;
  const calls = await readSmokeLog(fixture);
  assert.equal(result.status, 0, output);
  assert.match(output, /三个容器.*健康|3 个容器.*健康/);
  assert.match(output, /3101.*200/s);
  assert.match(output, /3105.*401/s);
  assert.match(output, /认证.*3105.*200|3105.*认证.*200/s);
  assert.doesNotMatch(output, new RegExp(`${password}|${passwordHash}`));
  assert.deepEqual(
    [...calls.matchAll(/^docker:inspect:(.+)$/gm)].map((match) => match[1]),
    ["dlc-blog", "dlc-nav", "dlc-nav-auth"],
  );
  assert.deepEqual(
    [...calls.matchAll(/^timeout:7:docker:(info|inspect):?(.*)$/gm)].map((match) =>
      [match[1], match[2]].filter(Boolean).join(":"),
    ),
    ["info", "inspect:dlc-blog", "inspect:dlc-nav", "inspect:dlc-nav-auth"],
  );
  const curlArguments = calls.match(/^curl-argv:.*$/gm) ?? [];
  assert.equal(curlArguments.length, 3);
  assert.match(curlArguments[0], /--connect-timeout.*<3>.*--max-time.*<10>.*3101/);
  assert.doesNotMatch(curlArguments[0], /--config/);
  assert.match(curlArguments[1], /--connect-timeout.*<3>.*--max-time.*<10>.*3105/);
  assert.doesNotMatch(curlArguments[1], /--config/);
  assert.match(curlArguments[2], /--config><->.*--connect-timeout.*<3>.*--max-time.*<10>.*3105/);
  assert.match(calls, /curl-stdin-config:valid/);
  assert.doesNotMatch(calls, /curl-env:NAV_(?:PASSWORD|PASSWORD_HASH)/);
  assert.doesNotMatch(calls, new RegExp(`${password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${passwordHash}`));
});
