<?php
/**
 * DLC 网址集初始化器
 *
 * 幂等地向 OneNav 数据库写入默认分类和链接。
 * 重复运行不会产生重复记录。
 */

$dbPath = $argv[1] ?? '/var/www/html/data/onenav.db3';

if (!file_exists($dbPath)) {
    fwrite(STDERR, "数据库不存在：{$dbPath}\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$categories = [
    ['name' => '个人站点', 'description' => 'DLC 空间旗下站点', 'font_icon' => 'fa fa-user'],
    ['name' => '常用工具', 'description' => '日常实用工具', 'font_icon' => 'fa fa-wrench'],
    ['name' => '开发资源', 'description' => '开发与学习资源', 'font_icon' => 'fa fa-code'],
];

$personalLinks = [
    ['title' => '博客', 'url' => 'https://blog.dailecheng.xyz/', 'description' => 'DLC 空间博客'],
    ['title' => '网盘', 'url' => 'https://pan.dailecheng.xyz/', 'description' => 'DLC 空间网盘'],
    ['title' => '音乐', 'url' => 'https://audio.dailecheng.xyz/', 'description' => 'DLC 空间音乐站'],
    ['title' => '相册集', 'url' => 'https://me.dailecheng.xyz/', 'description' => 'DLC 空间个人主页'],
    ['title' => '网址集', 'url' => 'https://web.dailecheng.xyz/', 'description' => 'DLC 空间网址集'],
    ['title' => '今日热榜', 'url' => 'https://hot.dailecheng.xyz/', 'description' => '今日热榜'],
];

$now = (string)time();

try {
    $pdo->beginTransaction();

    foreach ($categories as $category) {
        $stmt = $pdo->prepare('SELECT id FROM on_categorys WHERE name = :name');
        $stmt->execute([':name' => $category['name']]);
        $existing = $stmt->fetchColumn();

        if ($existing === false) {
            $stmt = $pdo->prepare(
                'INSERT INTO on_categorys (name, add_time, up_time, weight, property, description, font_icon, fid) ' .
                'VALUES (:name, :add_time, :up_time, :weight, :property, :description, :font_icon, :fid)'
            );
            $stmt->execute([
                ':name' => $category['name'],
                ':add_time' => $now,
                ':up_time' => $now,
                ':weight' => 0,
                ':property' => 0,
                ':description' => $category['description'],
                ':font_icon' => $category['font_icon'],
                ':fid' => 0,
            ]);
        }
    }

    $stmt = $pdo->prepare('SELECT id FROM on_categorys WHERE name = :name');
    $stmt->execute([':name' => '个人站点']);
    $personalCategoryId = $stmt->fetchColumn();

    if ($personalCategoryId === false) {
        throw new RuntimeException('未找到“个人站点”分类');
    }

    foreach ($personalLinks as $link) {
        $stmt = $pdo->prepare('SELECT id FROM on_links WHERE url = :url');
        $stmt->execute([':url' => $link['url']]);
        $existing = $stmt->fetchColumn();

        if ($existing === false) {
            $stmt = $pdo->prepare(
                'INSERT INTO on_links (fid, title, url, description, add_time, up_time, weight, property, click, topping) ' .
                'VALUES (:fid, :title, :url, :description, :add_time, :up_time, :weight, :property, :click, :topping)'
            );
            $stmt->execute([
                ':fid' => $personalCategoryId,
                ':title' => $link['title'],
                ':url' => $link['url'],
                ':description' => $link['description'],
                ':add_time' => $now,
                ':up_time' => $now,
                ':weight' => 0,
                ':property' => 0,
                ':click' => 0,
                ':topping' => 0,
            ]);
        }
    }

    $pdo->commit();
    echo "DLC 网址集初始化完成。\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "初始化失败：" . $e->getMessage() . "\n");
    exit(1);
}
