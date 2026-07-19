import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const fileUrl = (path) => new URL(path, root);
const read = (path) => readFile(fileUrl(path), "utf8");
const expectedHomepageEnvironment = {
  HOMEPAGE_ALLOWED_HOSTS: "nav.dailecheng.xyz",
  HOMEPAGE_VAR_LATITUDE: "${HOMEPAGE_VAR_LATITUDE:-31.2304}",
  HOMEPAGE_VAR_LONGITUDE: "${HOMEPAGE_VAR_LONGITUDE:-121.4737}",
};
const sensitiveNamePattern = /(?:api[_-]?key|token|secret|password|(?:^|[_-])key(?:$|[_-]))/i;

function parseYaml(path) {
  const output = execFileSync(
    "ruby",
    [
      "-ryaml",
      "-rjson",
      "-e",
      "puts JSON.generate(YAML.safe_load(File.read(ARGV.fetch(0)), aliases: false))",
      fileURLToPath(fileUrl(path)),
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
  assert.equal(new Set(pairs.map(([name]) => name)).size, pairs.length, "environment 不得有重复变量");
  return Object.fromEntries(pairs);
}

function assertHomepageEnvironment(environment) {
  assert.deepEqual(environmentObject(environment), expectedHomepageEnvironment);
}

function parseEnvironmentExample(content) {
  return Object.fromEntries(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        assert.ok(separator > 0, "env.example 必须使用 NAME=value 格式");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function collectSensitiveKeys(value, path = "") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSensitiveKeys(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [
      ...(sensitiveNamePattern.test(key) ? [`${path}.${key}`] : []),
      ...collectSensitiveKeys(item, path ? `${path}.${key}` : key),
    ]);
  }
  return [];
}

function assertNoSensitiveFields({ compose, envExample, configValues }) {
  const sensitiveFields = [
    ...collectSensitiveKeys(compose, "compose"),
    ...Object.keys(environmentObject(compose.services.homepage.environment))
      .filter((name) => sensitiveNamePattern.test(name))
      .map((name) => `compose.services.homepage.environment.${name}`),
    ...Object.keys(parseEnvironmentExample(envExample))
      .filter((name) => sensitiveNamePattern.test(name))
      .map((name) => `apps/nav/env.example.${name}`),
    ...configValues.flatMap((value) => collectSensitiveKeys(value)),
  ];
  assert.deepEqual(sensitiveFields, []);
}

test("Compose 精确限制 Homepage 的镜像、端口、主机、配置卷与健康检查", () => {
  const compose = parseYaml("apps/nav/compose.yml");
  const homepage = compose.services.homepage;

  assert.equal(homepage.image, "ghcr.io/gethomepage/homepage:v1.13.1");
  assert.equal(homepage.container_name, "dlc-nav");
  assert.deepEqual(homepage.ports, ["127.0.0.1:${NAV_PORT:-3103}:3000"]);
  assertHomepageEnvironment(homepage.environment);
  assert.deepEqual(homepage.volumes, ["./config:/app/config:ro"]);
  assert.doesNotMatch(JSON.stringify(compose), /\/var\/run\/docker\.sock/);
  assert.deepEqual(homepage.healthcheck.test, [
    "CMD-SHELL",
    "wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/healthcheck || exit 1",
  ]);
});

test("环境断言会拒绝额外 TOKEN 和缺少天气坐标", () => {
  const homepage = parseYaml("apps/nav/compose.yml").services.homepage;
  assert.doesNotThrow(() => assertHomepageEnvironment(homepage.environment));
  assert.throws(() => assertHomepageEnvironment([...homepage.environment, "API_TOKEN=fixture"]));
  assert.throws(() => assertHomepageEnvironment(
    homepage.environment.filter((entry) => !entry.startsWith("HOMEPAGE_VAR_LATITUDE=")),
  ));
});

test("Homepage 配置完整、可只读加载且不包含敏感字段", async () => {
  const configFiles = [
    "apps/nav/config/settings.yaml",
    "apps/nav/config/services.yaml",
    "apps/nav/config/widgets.yaml",
    "apps/nav/config/bookmarks.yaml",
    "apps/nav/config/docker.yaml",
    "apps/nav/config/kubernetes.yaml",
    "apps/nav/config/proxmox.yaml",
  ];
  const [settings, bookmarks, docker, kubernetes, proxmox, customCss, customJs, envExample] = await Promise.all([
    Promise.resolve(parseYaml(configFiles[0])),
    Promise.resolve(parseYaml(configFiles[3])),
    Promise.resolve(parseYaml(configFiles[4])),
    Promise.resolve(parseYaml(configFiles[5])),
    Promise.resolve(parseYaml(configFiles[6])),
    read("apps/nav/config/custom.css"),
    read("apps/nav/config/custom.js"),
    read("apps/nav/env.example"),
  ]);

  assert.equal(settings.language, "zh-Hans");
  assert.equal(settings.theme, "dark");
  assert.equal(settings.headerStyle, "boxedWidgets");
  assert.deepEqual(settings.layout["DLC 空间"], { style: "row", columns: 3 });
  assert.deepEqual(bookmarks, []);
  assert.deepEqual(docker, {});
  assert.deepEqual(kubernetes, { mode: "disabled" });
  assert.deepEqual(proxmox, {});
  assert.ok(customCss.trim(), "custom.css 必须存在且由 N2 主题契约验证内容");
  assert.ok(customJs.trim(), "custom.js 必须存在且由 N2 脚本契约验证内容");

  const configValues = configFiles.map((path) => parseYaml(path));
  const compose = parseYaml("apps/nav/compose.yml");
  assertNoSensitiveFields({ compose, envExample, configValues });
  assert.doesNotThrow(() => assertNoSensitiveFields({
    compose,
    envExample: `${envExample}\nPUID=1000\nPGID=1000\n`,
    configValues,
  }));
  assert.throws(() => assertNoSensitiveFields({
    compose: {
      ...compose,
      services: {
        ...compose.services,
        homepage: {
          ...compose.services.homepage,
          environment: [...compose.services.homepage.environment, "API_TOKEN=fixture"],
        },
      },
    },
    envExample,
    configValues,
  }));
  assert.throws(() => assertNoSensitiveFields({
    compose,
    envExample: `${envExample}\nPASSWORD=fixture\n`,
    configValues,
  }));
});

test("信息组件提供搜索、日期时间与可通过环境变量覆盖的上海天气", async () => {
  const [widgets, env] = await Promise.all([
    Promise.resolve(parseYaml("apps/nav/config/widgets.yaml")),
    read("apps/nav/env.example"),
  ]);
  const widgetByName = new Map(widgets.map((widget) => Object.entries(widget)[0]));

  assert.ok(widgetByName.has("search"));
  assert.ok(widgetByName.has("datetime"));
  assert.deepEqual(widgetByName.get("openmeteo").latitude, "{{HOMEPAGE_VAR_LATITUDE}}");
  assert.deepEqual(widgetByName.get("openmeteo").longitude, "{{HOMEPAGE_VAR_LONGITUDE}}");
  assert.match(env, /^HOMEPAGE_VAR_LATITUDE=31\.2304$/m);
  assert.match(env, /^HOMEPAGE_VAR_LONGITUDE=121\.4737$/m);
});

test("DLC 空间服务组的 href 集合恰为六个既有入口", () => {
  const services = parseYaml("apps/nav/config/services.yaml");
  const group = services.find((item) => Object.hasOwn(item, "DLC 空间"));
  const hrefs = group["DLC 空间"].map((service) => Object.values(service)[0].href);

  assert.deepEqual(new Set(hrefs), new Set([
    "https://dailecheng.xyz/",
    "https://blog.dailecheng.xyz/",
    "https://pan.dailecheng.xyz/",
    "https://web.dailecheng.xyz/",
    "https://hot.dailecheng.xyz/",
    "https://audio.dailecheng.xyz/",
  ]));
  assert.equal(hrefs.length, 6);
});
