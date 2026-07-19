import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const composePath = fileURLToPath(new URL("deploy/compose.yml", root));
const deployDirectory = dirname(composePath);
const expectedLogging = {
  driver: "json-file",
  options: {
    "max-size": "10m",
    "max-file": "3",
  },
};
const expectedHomepageEnvironment = {
  HOMEPAGE_ALLOWED_HOSTS: "nav.dailecheng.xyz",
  HOMEPAGE_VAR_LATITUDE: "${HOMEPAGE_VAR_LATITUDE:-31.2304}",
  HOMEPAGE_VAR_LONGITUDE: "${HOMEPAGE_VAR_LONGITUDE:-121.4737}",
};

function parseYaml(path) {
  assert.ok(existsSync(path), "deploy/compose.yml 不存在");
  const output = execFileSync(
    "ruby",
    [
      "-ryaml",
      "-rjson",
      "-e",
      "puts JSON.generate(YAML.safe_load(File.read(ARGV.fetch(0)), aliases: false))",
      path,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

function environmentObject(environment) {
  if (!Array.isArray(environment)) {
    assert.ok(environment && typeof environment === "object", "environment 必须是数组或映射");
    return environment;
  }

  const pairs = environment.map((entry) => {
    assert.equal(typeof entry, "string", "environment 数组项必须是 NAME=value 字符串");
    const separator = entry.indexOf("=");
    assert.ok(separator > 0, "environment 数组项必须包含变量名和值");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  });
  assert.equal(new Set(pairs.map(([name]) => name)).size, pairs.length, "environment 不得重复");
  return Object.fromEntries(pairs);
}

function assertExactKeys(object, expected, label) {
  assert.deepEqual(Object.keys(object).sort(), [...expected].sort(), `${label} 字段必须精确匹配白名单`);
}

function assertCommonRuntime(service) {
  assert.equal(service.restart, "unless-stopped");
  assert.deepEqual(service.logging, expectedLogging);
  assert.ok(service.healthcheck && typeof service.healthcheck === "object", "每个服务都必须有健康检查");
}

function assertExactEnvironment(environment, expected) {
  assert.deepEqual(environmentObject(environment), expected);
}

function assertLocalSource(relativePath, expectedType) {
  const source = resolve(deployDirectory, relativePath);
  assert.ok(existsSync(source), `${relativePath} 必须相对 deploy/ 正确解析`);
  assert.equal(statSync(source)[expectedType](), true, `${relativePath} 类型不正确`);
}

test("总 Compose 只编排博客、起始页与认证网关", () => {
  const compose = parseYaml(composePath);

  assertExactKeys(compose, ["services"], "Compose 顶层");
  assert.deepEqual(Object.keys(compose.services).sort(), ["dlc-blog", "dlc-nav", "dlc-nav-auth"]);
  assert.doesNotMatch(JSON.stringify(compose), /(?:^|[-_])(pan|web)(?:$|[-_])/i);
});

test("博客构建路径、公开端口和运行策略精确固定", () => {
  const blog = parseYaml(composePath).services["dlc-blog"];

  assertExactKeys(blog, ["build", "container_name", "ports", "restart", "healthcheck", "logging"], "dlc-blog");
  assert.equal(blog.build, "../apps/blog");
  assert.equal(blog.container_name, "dlc-blog");
  assert.deepEqual(blog.ports, ["${BLOG_PORT:-3101}:80"]);
  assert.deepEqual(blog.healthcheck, {
    test: ["CMD-SHELL", "wget -q --spider http://localhost/ || exit 1"],
    interval: "30s",
    timeout: "5s",
    retries: 3,
    start_period: "5s",
  });
  assertCommonRuntime(blog);
  assertLocalSource(blog.build, "isDirectory");
  assert.ok(existsSync(resolve(deployDirectory, blog.build, "Dockerfile")), "博客构建上下文必须包含 Dockerfile");
});

test("起始页复用 N1 的镜像、回环端口、只读卷和三项环境变量", () => {
  const homepage = parseYaml(composePath).services["dlc-nav"];

  assertExactKeys(
    homepage,
    ["image", "container_name", "environment", "ports", "volumes", "restart", "healthcheck", "logging"],
    "dlc-nav",
  );
  assert.equal(homepage.image, "ghcr.io/gethomepage/homepage:v1.13.1");
  assert.equal(homepage.container_name, "dlc-nav");
  assert.deepEqual(homepage.ports, ["127.0.0.1:${NAV_PORT:-3103}:3000"]);
  assertExactEnvironment(homepage.environment, expectedHomepageEnvironment);
  assert.deepEqual(homepage.volumes, [
    "../apps/nav/config:/app/config:ro",
    "../apps/nav/config/icons:/app/public/icons:ro",
  ]);
  assert.deepEqual(homepage.healthcheck, {
    test: [
      "CMD-SHELL",
      "wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/healthcheck || exit 1",
    ],
    interval: "30s",
    timeout: "5s",
    retries: 3,
    start_period: "10s",
  });
  assertCommonRuntime(homepage);
  assertLocalSource("../apps/nav/config", "isDirectory");
  assertLocalSource("../apps/nav/config/icons", "isDirectory");
});

test("认证网关只接收无默认值凭证并等待起始页健康", () => {
  const auth = parseYaml(composePath).services["dlc-nav-auth"];

  assertExactKeys(
    auth,
    [
      "image",
      "container_name",
      "environment",
      "ports",
      "volumes",
      "depends_on",
      "restart",
      "healthcheck",
      "logging",
    ],
    "dlc-nav-auth",
  );
  assert.equal(auth.image, "caddy:2.10.2-alpine");
  assert.equal(auth.container_name, "dlc-nav-auth");
  assert.deepEqual(auth.ports, ["${NAV_AUTH_PORT:-3105}:80"]);
  assertExactEnvironment(auth.environment, {
    NAV_USERNAME: "${NAV_USERNAME}",
    NAV_PASSWORD_HASH: "${NAV_PASSWORD_HASH}",
  });
  assert.deepEqual(auth.volumes, ["./auth/Caddyfile:/etc/caddy/Caddyfile:ro"]);
  assert.deepEqual(auth.depends_on, {
    "dlc-nav": { condition: "service_healthy" },
  });
  assert.deepEqual(auth.healthcheck, {
    test: ["CMD", "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"],
    interval: "30s",
    timeout: "5s",
    retries: 3,
    start_period: "5s",
  });
  assertCommonRuntime(auth);
  assertLocalSource("./auth/Caddyfile", "isFile");
});

test("安全白名单拒绝 latest、Docker Socket、额外环境变量和敏感字面量", () => {
  const compose = parseYaml(composePath);
  const serialized = JSON.stringify(compose);

  assert.doesNotMatch(serialized, /:latest\b/i);
  assert.doesNotMatch(serialized, /\/var\/run\/docker\.sock/i);
  assert.doesNotMatch(serialized, /\$(?:2[aby]|argon2)[^"\s]*/i, "不得提交真实密码哈希");
  assertExactEnvironment(compose.services["dlc-nav"].environment, expectedHomepageEnvironment);
  assertExactEnvironment(compose.services["dlc-nav-auth"].environment, {
    NAV_USERNAME: "${NAV_USERNAME}",
    NAV_PASSWORD_HASH: "${NAV_PASSWORD_HASH}",
  });

  assert.throws(() => assertExactEnvironment(
    { ...expectedHomepageEnvironment, API_TOKEN: "fixture" },
    expectedHomepageEnvironment,
  ));
  assert.throws(() => assertExactEnvironment(
    { NAV_USERNAME: "admin", NAV_PASSWORD_HASH: "plaintext" },
    { NAV_USERNAME: "${NAV_USERNAME}", NAV_PASSWORD_HASH: "${NAV_PASSWORD_HASH}" },
  ));
});

test("环境模板保留后续阶段预检字段但不提供真实凭证", async () => {
  const envExample = await readFile(new URL("deploy/env.example", root), "utf8");

  assert.match(envExample, /^BLOG_PORT=3101$/m);
  assert.match(envExample, /^PAN_PORT=3102$/m);
  assert.match(envExample, /^NAV_PORT=3103$/m);
  assert.match(envExample, /^WEB_PORT=3104$/m);
  assert.match(envExample, /^NAV_AUTH_PORT=3105$/m);
  assert.match(envExample, /^HOMEPAGE_VAR_LATITUDE=31\.2304$/m);
  assert.match(envExample, /^HOMEPAGE_VAR_LONGITUDE=121\.4737$/m);
  assert.match(envExample, /PAN_PORT.*WEB_PORT.*第二阶段|第二阶段.*PAN_PORT.*WEB_PORT/s);
  assert.match(envExample, /^# NAV_USERNAME=replace-with-your-username$/m);
  assert.match(envExample, /^# NAV_PASSWORD_HASH='replace-with-your-caddy-hash'$/m);
  assert.doesNotMatch(envExample, /^NAV_(?:USERNAME|PASSWORD_HASH)=.+$/m);
  assert.doesNotMatch(envExample, /\$(?:2[aby]|argon2)[^\s]*/i);
});

test("中文部署说明区分本地边界并覆盖 NAS 部署、检查和回退", async () => {
  assert.ok(existsSync(fileURLToPath(new URL("deploy/README.md", root))), "deploy/README.md 不存在");
  const readme = await readFile(new URL("deploy/README.md", root), "utf8");

  assert.match(readme, /本地.*(?:没有|未安装).*Docker/s);
  assert.match(readme, /NAS 待验证/);
  assert.match(readme, /docker run --rm -it caddy:2\.10\.2-alpine caddy hash-password/);
  assert.match(readme, /docker compose --env-file \.env -f compose\.yml config/);
  assert.match(readme, /docker compose --env-file \.env -f compose\.yml up -d --build/);
  assert.match(readme, /docker compose --env-file \.env -f compose\.yml ps/);
  assert.match(readme, /127\.0\.0\.1:\$\{NAV_PORT:-3103\}/);
  assert.match(readme, /3101.*3105/s);
  assert.match(readme, /回退/);
  assert.match(readme, /docker compose --env-file \.env -f compose\.yml down/);
});
