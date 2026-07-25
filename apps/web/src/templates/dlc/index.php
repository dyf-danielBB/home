<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="keywords" content="<?php echo htmlspecialchars($site['keywords'] ?? ''); ?>">
  <meta name="description" content="<?php echo htmlspecialchars($site['description'] ?? ''); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo htmlspecialchars(($site['title'] ?? 'DLC 空间') . ($site['subtitle'] ? ' - ' . $site['subtitle'] : '')); ?></title>
  <link rel="stylesheet" href="/templates/<?php echo $template; ?>/static/style.css?v=<?php echo $version ?? '1'; ?>">
  <?php echo $site['custom_header'] ?? ''; ?>
</head>
<body>
  <div class="container">
    <header>
      <img src="/templates/<?php echo $template; ?>/static/dlc-logo.svg" alt="DLC 空间 Logo">
      <h1><?php echo htmlspecialchars($site['title'] ?? 'DLC 空间'); ?></h1>
    </header>

    <form class="search" action="/" method="get" onsubmit="return false;">
      <input type="text" class="search" placeholder="搜索书签..." autocomplete="off">
      <button type="submit">搜索</button>
    </form>

    <main>
      <?php foreach ($categorys as $category): ?>
        <?php
          $fid = $category['id'];
          $category_links = is_callable($get_links ?? null) ? $get_links($fid) : [];
          if (empty($category_links)) {
            continue;
          }
        ?>
        <section class="category" id="category-<?php echo (int)$fid; ?>">
          <h2 class="category-title">
            <?php echo !empty($category['font_icon']) ? '<i class="' . htmlspecialchars($category['font_icon']) . '"></i> ' : ''; ?>
            <?php echo htmlspecialchars_decode($category['name'] ?? ''); ?>
          </h2>
          <div class="link-grid">
            <?php foreach ($category_links as $link): ?>
              <?php
                $url = ($site['link_model'] ?? '') === 'direct'
                  ? ($link['url'] ?? '#')
                  : '/index.php?c=click&id=' . (int)($link['id'] ?? 0);
                $title = htmlspecialchars($link['title'] ?? '');
                $description = htmlspecialchars($link['description'] ?? '');
              ?>
              <a href="<?php echo htmlspecialchars($url); ?>" target="_blank" title="<?php echo $description; ?>">
                <article class="link-card">
                  <div class="link-icon">
                    <img src="/index.php?c=ico&text=<?php echo urlencode($link['title'] ?? ''); ?>" alt="" width="20" height="20">
                  </div>
                  <div class="link-info">
                    <div class="link-name"><?php echo $title; ?></div>
                    <div class="link-url"><?php echo htmlspecialchars($link['url'] ?? ''); ?></div>
                  </div>
                </article>
              </a>
            <?php endforeach; ?>
          </div>
        </section>
      <?php endforeach; ?>
    </main>

    <footer>
      <?php echo $site['custom_footer'] ?? ''; ?>
      <p>© <?php echo date('Y'); ?> DLC 空间 · Powered by <a href="https://www.onenav.top/" target="_blank" rel="nofollow">OneNav</a></p>
    </footer>
  </div>

  <a class="admin-entry" href="/index.php?c=admin" target="_blank">后台管理</a>

  <script src="/templates/<?php echo $template; ?>/static/embed.js?v=<?php echo $version ?? '1'; ?>"></script>
</body>
</html>
