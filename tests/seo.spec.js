const { test, expect } = require('@playwright/test');

test('首页提供完整的搜索与社交分享元数据', async ({ page, request }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('GitScope · GitHub 账户查询');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://bingwithyou.github.io/GitHub-Account-Inspector/',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /注册时间.*代表仓库/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /GitScope/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /social-preview\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './assets/favicon.svg');

  const cover = await request.get('/assets/social-preview.png');
  expect(cover.status()).toBe(200);
  expect(cover.headers()['content-type']).toContain('image/png');

  const favicon = await request.get('/assets/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
});
