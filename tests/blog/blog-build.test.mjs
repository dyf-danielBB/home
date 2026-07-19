import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readBlogFile = (file) => readFile(new URL(`../../apps/blog/${file}`, import.meta.url), 'utf8');

test('records the exact Miniblog upstream revision', async () => {
  const upstream = await readBlogFile('UPSTREAM.md');

  assert.match(upstream, /3d840c3ecde0dcfb91bca14a95d7cb93714ef9d9/);
});

test('builds Miniblog with pnpm and serves it from pinned nginx', async () => {
  const dockerfile = await readBlogFile('Dockerfile');

  assert.match(dockerfile, /pnpm build/);
  assert.match(dockerfile, /nginx:1\.28\.0-alpine/);
});

test('publishes the blog container port with the configured default', async () => {
  const compose = await readBlogFile('compose.yml');

  assert.match(compose, /\$\{BLOG_PORT:-3101\}:80/);
});
