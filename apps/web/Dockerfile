FROM php:8.2.29-apache

# 安装 SQLite 扩展与常用工具
RUN docker-php-ext-install pdo_sqlite sqlite3 \
    && apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# 启用 Apache rewrite
RUN a2enmod rewrite

# 设置工作目录
WORKDIR /var/www/html

# 复制 OneNav 源码与初始化脚本
COPY src/ /var/www/html/
COPY scripts/ /var/www/html/scripts/

# 确保数据目录存在并允许 Apache 用户写入
RUN mkdir -p /var/www/html/db /var/www/html/data \
    && chown -R www-data:www-data /var/www/html

EXPOSE 80
