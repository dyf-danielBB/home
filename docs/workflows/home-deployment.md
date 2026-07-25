# 个人主页发布工作流

## 适用范围

本文用于发布当前 Vue 3 + Vite 个人主页到 `https://home.dailecheng.xyz/`。发布对象是本项目构建生成的 `dist/`，不是 DLC 博客、网盘或相册站。

## 线上链路

```text
用户浏览器
  → https://home.dailecheng.xyz/
  → 腾讯云 VPS Nginx
  → VPS FRP 端口 22445
  → NAS 192.168.1.210:12445
  → NAS 静态目录 /volume1/web/home
```

固定参数：

| 项目 | 默认值 |
| --- | --- |
| NAS SSH 地址 | `192.168.1.210` |
| NAS SSH 用户 | `dyf8430` |
| SSH 私钥 | `~/.ssh/id_ed25519` |
| 线上目录 | `/volume1/web/home` |
| 备份目录 | `/volume1/web/home-backups` |
| NAS 源站 | `http://127.0.0.1:12445/` |
| VPS FRP 端口 | `22445` |
| 正式域名 | `https://home.dailecheng.xyz/` |

仓库和文档不得保存 NAS 密码、私钥、GitHub 令牌或 FRP 令牌。

## 前置条件

- 当前目录是个人主页仓库根目录。
- 已安装 `pnpm`、`ssh`、`tar`、`curl` 和 `rg`。
- `dyf8430@192.168.1.210` 已配置 SSH 公钥登录。
- 本地 `.env` 已包含正式构建所需的站点配置；`.env` 不提交到 Git。
- 本地网络能够访问 NAS，公网能够访问正式域名。

## 自动发布

正常发布只需运行：

```sh
scripts/deploy-home.sh
```

查看参数：

```sh
scripts/deploy-home.sh --help
```

需要临时覆盖默认参数时，通过脚本帮助中列出的环境变量传入。不要直接修改脚本保存敏感信息。

## 脚本执行顺序

1. 检查本地命令和 SSH 私钥。
2. 执行 `pnpm build`。
3. 从 `dist/index.html` 解析本次带哈希的 JavaScript 文件。
4. 检查构建资源包含“相册集”和 `https://me.dailecheng.xyz/`。
5. 把 NAS 当前 `/volume1/web/home` 完整打包到 `/volume1/web/home-backups`。
6. 使用 SSH tar 数据流覆盖上传 `dist/`；不主动删除旧哈希资源。
7. 在 NAS 内请求 `http://127.0.0.1:12445/`，验证新资源和相册链接。
8. 绕过缓存请求正式域名，验证正式域名引用同一份新资源。
9. 输出 Git 提交、备份路径、资源名称和验收结果。

任何一步失败，脚本都会返回非零退出码。此时只能报告已完成到哪一步，不得宣称发布成功。

## 缓存说明

站点启用了 PWA 和静态资源缓存。脚本在公网验收时会添加 `Cache-Control: no-cache` 和版本查询参数。用户浏览器若仍显示旧页面，可执行强制刷新；新旧 JavaScript 使用不同哈希文件名，不需要删除旧文件才能生效。

## 常见故障

### SSH 登录失败

确认使用的是 NAS `192.168.1.210`，不要误连其他局域网设备。测试命令：

```sh
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes \
  dyf8430@192.168.1.210 'hostname; id'
```

正确主机名应为 `daiyongfanas`。密码不要发送到聊天中。

### 公网仍引用旧资源

先检查 NAS 源站。如果源站已经引用新资源而公网仍是旧资源，检查 VPS Nginx 或中间缓存；不要重复覆盖 NAS 文件。如果 NAS 源站仍是旧资源，检查上传是否成功以及 `/volume1/web/home/index.html`。

### 端口可用但找不到 Docker 容器

主页静态文件直接位于 `/volume1/web/home`，发布不依赖在普通 `docker ps` 中定位容器。FRP 把 NAS 的 `12445` 映射到 VPS 的 `22445`。

## 恢复旧版

先列出备份并确认要恢复的准确文件名：

```sh
ssh -i ~/.ssh/id_ed25519 dyf8430@192.168.1.210 \
  'ls -lh /volume1/web/home-backups/'
```

确认后执行：

```sh
ssh -i ~/.ssh/id_ed25519 dyf8430@192.168.1.210 \
  'tar -xzf /volume1/web/home-backups/指定备份.tar.gz -C /volume1/web/home'
```

恢复操作会覆盖同名线上文件。恢复后必须重新验证 NAS 源站和正式域名，确认 HTML 引用的哈希资源与备份版本一致。
