const { test, expect } = require('@playwright/test');

const account = {
  login: 'testaccount',
  id: 123456,
  node_id: 'U_testaccount123',
  avatar_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/%3E',
  html_url: 'https://github.com/testaccount',
  repos_url: 'https://api.github.com/users/testaccount/repos',
  name: 'Test Account',
  company: 'Open Source Lab',
  blog: 'https://example.com',
  location: 'Shanghai',
  bio: 'A stable fixture for browser tests.',
  type: 'User',
  public_repos: 2,
  followers: 42,
  following: 7,
  created_at: '2020-01-02T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const repositories = [
  {
    name: 'quiet-project',
    html_url: 'https://github.com/testaccount/quiet-project',
    description: 'A smaller repository.',
    fork: false,
    language: 'CSS',
    stargazers_count: 3,
    forks_count: 1,
  },
  {
    name: 'popular-project',
    html_url: 'https://github.com/testaccount/popular-project',
    description: 'The most popular repository.',
    fork: false,
    language: 'JavaScript',
    stargazers_count: 120,
    forks_count: 18,
  },
];

async function mockGitHub(page, { userStatus = 200 } = {}) {
  let requestCount = 0;

  await page.route('https://api.github.com/users/**', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const isRepositoryRequest = url.pathname.endsWith('/repos');
    const status = isRepositoryRequest ? 200 : userStatus;
    const body = isRepositoryRequest ? repositories : account;
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '58',
      },
      body: status === 404 ? JSON.stringify({ message: 'Not Found' }) : JSON.stringify(body),
    });
  });

  return () => requestCount;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('键盘用户可以通过跳转链接直接进入主要内容', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const skipLink = page.getByRole('link', { name: '跳到查询内容' });
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('用户可以查询账户、查看代表仓库并获得本地历史', async ({ page }) => {
  const getRequestCount = await mockGitHub(page);
  await page.goto('/');

  await page.getByRole('textbox', { name: 'GitHub 用户名' }).fill('testaccount');
  await page.getByRole('button', { name: '查询账户' }).click();

  await expect(page.getByRole('heading', { name: 'Test Account' })).toBeVisible();
  await expect(page.locator('#user-id')).toHaveText('123456');
  await expect(page.locator('.repo-card-name')).toHaveText(['popular-project', 'quiet-project']);
  await expect(page.locator('.language')).toHaveText(['JavaScript', 'CSS']);
  await expect(page.locator('.language').nth(0)).toHaveCSS('--language-color', '#f1e05a');
  await expect(page.locator('.language').nth(1)).toHaveCSS('--language-color', '#663399');
  await expect(
    page.getByRole('link', {
      name: '查看仓库 popular-project，语言 JavaScript，120 个星标，18 个 Fork',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '再次查询 testaccount' })).toBeVisible();
  expect(getRequestCount()).toBe(2);
});

test('重复查询使用缓存，复制摘要会显示成功反馈', async ({ page }) => {
  const getRequestCount = await mockGitHub(page);
  await page.goto('/?user=testaccount');
  await expect(page.getByRole('heading', { name: 'Test Account' })).toBeVisible();

  await page.getByRole('button', { name: '再次查询 testaccount' }).click();
  await expect(page.locator('#rate-limit')).toContainText('本地缓存');
  expect(getRequestCount()).toBe(2);

  await page.getByRole('button', { name: '复制账户摘要' }).click();
  await expect(page.getByRole('status')).toContainText('账户摘要已复制');
});

test('不存在的账户会显示明确的 404 提示', async ({ page }) => {
  await mockGitHub(page, { userStatus: 404 });
  await page.goto('/');

  await page.getByRole('textbox', { name: 'GitHub 用户名' }).fill('missing-account');
  await page.getByRole('button', { name: '查询账户' }).click();

  await expect(page.getByText('没有找到这个账户')).toBeVisible();
  await expect(page.getByText(/不存在 @missing-account/)).toBeVisible();
});
