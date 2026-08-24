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

test('用户可以查询账户、查看代表仓库并获得本地历史', async ({ page }) => {
  const getRequestCount = await mockGitHub(page);
  await page.goto('/');

  await page.getByRole('textbox', { name: 'GitHub 用户名' }).fill('testaccount');
  await page.getByRole('button', { name: '查询账户' }).click();

  await expect(page.getByRole('heading', { name: 'Test Account' })).toBeVisible();
  await expect(page.locator('#user-id')).toHaveText('123456');
  await expect(page.locator('.repo-card-name')).toHaveText(['popular-project', 'quiet-project']);
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
