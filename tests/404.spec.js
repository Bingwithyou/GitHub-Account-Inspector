const { test, expect } = require('@playwright/test');

test('未知地址会显示品牌化 404 页面并提供返回入口', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response.status()).toBe(404);
  await expect(page).toHaveTitle('页面未找到 · GitScope');
  await expect(page.getByRole('heading', { name: '这条记录不存在。' })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回 GitScope 首页' })).toHaveAttribute(
    'href',
    'https://bingwithyou.github.io/GitHub-Account-Inspector/',
  );
});
