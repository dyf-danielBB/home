# DLC 网址集

基于固定版本 OneNav v1.2.4 的公开网址集子站，使用 DLC 极光深海主题。

## 技术栈

- OneNav v1.2.4
- PHP 8.2 Apache
- SQLite 3
- Docker Compose

## 目录说明

- `src/`：固定版本的 OneNav 源码
- `scripts/seed.php`：幂等初始化器，向数据库写入默认分类和链接
- `templates/dlc/`：DLC 极光深海主题
- `compose.yml`：独立 Compose 入口
- `Dockerfile`：容器镜像构建

## 首次部署

### 1. 准备环境变量

复制项目级配置模板并填写：

```bash
cp deploy/env.example deploy/.env
# 编辑 deploy/.env，确认 WEB_PORT、DLC_DATA_ROOT 等字段
```

### 2. 启动容器

```bash
cd apps/web
docker compose --env-file ../../deploy/.env -f compose.yml up -d --build
```

### 3. 初始化管理员

访问 `http://<NAS-IP>:3104/?c=admin`（或你在 `.env` 中指定的 `WEB_PORT`），按安装向导设置管理员账号、密码和邮箱。

> 注意：OneNav 要求用户名 3-32 位小写字母/数字，密码 6-16 位且仅含允许字符。

### 4. 修改默认密码

初始化完成后立即登录后台并修改密码。

### 5. 选择 DLC 主题

进入后台 **主题设置**，选择 `DLC 极光深海` 并保存。

### 6. 写入默认数据

进入容器运行初始化脚本：

```bash
docker exec dlc-web php /var/www/html/scripts/seed.php /var/www/html/data/onenav.db3
```

重复运行不会产生重复记录。

### 7. 验证后台保护

使用匿名窗口访问 `http://<NAS-IP>:3104/?c=admin`，应跳转到登录页或返回登录页内容，不能直接进入管理界面。

### 8. 运行自动化验收

```bash
sh tests/web/runtime.sh
```

脚本会检查前台 200、后台保护、seed 幂等性和重启持久化。

## 备份

定期备份 NAS 上的数据目录：

```bash
${DLC_DATA_ROOT}/web/data
```

该目录包含 SQLite 数据库、配置文件和 OneNav 运行数据。

## 版本回退

1. 停止并删除当前容器：`docker compose down`
2. 恢复 `data` 目录备份
3. 重新启动容器

## 本地测试（无 Docker）

在仅有 Node 的环境中可运行静态契约测试：

```bash
node --test tests/web/*.test.mjs
```

容器构建和运行时验收需要在安装 Docker 的环境（如 NAS）上执行。
