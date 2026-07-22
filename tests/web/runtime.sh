#!/bin/sh
# DLC 网址集运行时验收脚本
# 在 NAS 上运行，验证容器构建、前台访问、后台保护、seed 幂等和重启持久化。

set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="${PROJECT_ROOT}/apps/web"
ENV_FILE="${PROJECT_ROOT}/deploy/.env"
SERVICE="web"
CONTAINER="dlc-web"
MAX_WAIT=60

if [ ! -f "${ENV_FILE}" ]; then
  echo "缺少 ${ENV_FILE}，请先复制 deploy/env.example 并填写配置。"
  exit 1
fi

cd "${WEB_DIR}"

echo "启动 dlc-web..."
docker compose --env-file "${ENV_FILE}" -f compose.yml up -d --build

wait_for_healthy() {
  echo "等待服务健康 (${MAX_WAIT}s)..."
  for i in $(seq 1 "${MAX_WAIT}"); do
    status=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER}" 2>/dev/null || echo "starting")
    if [ "${status}" = "healthy" ]; then
      echo "服务已健康"
      return 0
    fi
    sleep 1
  done
  echo "服务未在 ${MAX_WAIT}s 内变为健康"
  docker compose --env-file "${ENV_FILE}" -f compose.yml logs --tail=50 "${SERVICE}"
  exit 1
}

wait_for_healthy

echo "检查前台访问..."
front_status=$(docker exec "${CONTAINER}" sh -c 'wget -q -O /dev/null -o /dev/null http://localhost/ && echo 200 || echo fail')
if [ "${front_status}" != "200" ]; then
  echo "前台 / 访问失败"
  exit 1
fi
echo "前台 / 返回 200"

echo "检查后台保护..."
admin_status=$(docker exec "${CONTAINER}" sh -c 'wget -q -O /dev/null -o /dev/null http://localhost/?c=admin && echo 200 || echo fail')
if [ "${admin_status}" != "200" ]; then
  echo "后台 /?c=admin 未返回 200"
  exit 1
fi
echo "后台 /?c=admin 可访问（需登录）"

# 检查是否已完成初始化；未完成则跳过 seed 验证
if ! docker exec "${CONTAINER}" test -f /var/www/html/data/config.php; then
  echo "OneNav 尚未初始化，跳过 seed 与持久化验证。"
  echo "请访问 http://<nas-ip>:<WEB_PORT>/?c=admin 完成管理员初始化后再运行本脚本。"
  exit 0
fi

echo "运行 seed（第一次）..."
docker exec "${CONTAINER}" php /var/www/html/scripts/seed.php /var/www/html/data/onenav.db3

echo "运行 seed（第二次，验证幂等）..."
docker exec "${CONTAINER}" php /var/www/html/scripts/seed.php /var/www/html/data/onenav.db3

count_categories() {
  docker exec "${CONTAINER}" sqlite3 /var/www/html/data/onenav.db3 "SELECT name, COUNT(*) FROM on_categorys WHERE name IN ('个人站点','常用工具','开发资源') GROUP BY name;"
}

echo "验证分类数量..."
category_counts=$(count_categories)
echo "${category_counts}"

for name in 个人站点 常用工具 开发资源; do
  count=$(echo "${category_counts}" | grep "^${name}|" | cut -d'|' -f2 || echo 0)
  if [ "${count}" != "1" ]; then
    echo "分类 ${name} 数量错误：期望 1，实际 ${count}"
    exit 1
  fi
done

echo "重启容器..."
docker compose --env-file "${ENV_FILE}" -f compose.yml restart "${SERVICE}"
wait_for_healthy

echo "重启后验证分类数量..."
category_counts_after=$(count_categories)
echo "${category_counts_after}"

if [ "${category_counts}" != "${category_counts_after}" ]; then
  echo "重启后分类数量发生变化"
  exit 1
fi

echo "全部验收通过。"
