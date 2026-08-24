const API_ROOT = 'https://api.github.com/users/';

const form = document.querySelector('#search-form');
const input = document.querySelector('#username');
const searchButton = document.querySelector('#search-button');
const statusPanel = document.querySelector('#status-panel');
const result = document.querySelector('#result');
const loadingTemplate = document.querySelector('#loading-template');

const fields = {
  avatar: document.querySelector('#avatar'),
  name: document.querySelector('#result-name'),
  login: document.querySelector('#result-login'),
  bio: document.querySelector('#bio'),
  meta: document.querySelector('#profile-meta'),
  type: document.querySelector('#account-type'),
  joinDate: document.querySelector('#join-date'),
  age: document.querySelector('#account-age'),
  id: document.querySelector('#user-id'),
  nodeId: document.querySelector('#node-id'),
  repos: document.querySelector('#public-repos'),
  followers: document.querySelector('#followers'),
  following: document.querySelector('#following'),
  updatedAt: document.querySelector('#updated-at'),
  rateLimit: document.querySelector('#rate-limit'),
  viewProfile: document.querySelector('#view-profile'),
  recordNumber: document.querySelector('#record-number'),
};

const numberFormat = new Intl.NumberFormat('zh-CN');
const longDateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

function normalizeUsername(value) {
  return value.trim().replace(/^@/, '');
}

function isValidUsername(username) {
  return /^(?!-)(?!.*--)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username);
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  input.disabled = isLoading;
  searchButton.querySelector('.button-label').textContent = isLoading ? '查询中' : '查询账户';
}

function showLoading() {
  result.hidden = true;
  statusPanel.hidden = false;
  statusPanel.replaceChildren(loadingTemplate.content.cloneNode(true));
}

function showError(title, message) {
  result.hidden = true;
  statusPanel.hidden = false;
  const wrapper = document.createElement('div');
  wrapper.className = 'error-state';
  const strong = document.createElement('strong');
  const detail = document.createElement('p');
  strong.textContent = title;
  detail.textContent = message;
  wrapper.append(strong, detail);
  statusPanel.replaceChildren(wrapper);
}

function daysSince(isoDate) {
  const created = new Date(isoDate);
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
}

function safeExternalUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function addMetaItem(container, icon, content, href) {
  if (!content) return;
  const item = href ? document.createElement('a') : document.createElement('span');
  item.textContent = `${icon} ${content}`;
  if (href) {
    item.href = href;
    item.target = '_blank';
    item.rel = 'noreferrer';
  }
  container.append(item);
}

function renderProfile(user, response) {
  const createdAt = new Date(user.created_at);
  const updatedAt = new Date(user.updated_at);
  const displayName = user.name || user.login;

  fields.avatar.src = user.avatar_url;
  fields.avatar.alt = `${displayName} 的 GitHub 头像`;
  fields.name.textContent = displayName;
  fields.login.textContent = `@${user.login}`;
  fields.login.href = user.html_url;
  fields.bio.textContent = user.bio || '这个账户暂时没有填写个人简介。';
  fields.type.textContent = user.type.toUpperCase();
  fields.joinDate.textContent = longDateFormat.format(createdAt);
  fields.age.textContent = numberFormat.format(daysSince(user.created_at));
  fields.id.textContent = numberFormat.format(user.id);
  fields.nodeId.textContent = user.node_id;
  fields.repos.textContent = numberFormat.format(user.public_repos);
  fields.followers.textContent = numberFormat.format(user.followers);
  fields.following.textContent = numberFormat.format(user.following);
  fields.updatedAt.textContent = shortDateFormat.format(updatedAt);
  fields.viewProfile.href = user.html_url;
  fields.recordNumber.textContent = `NO. ${String(user.id).padStart(8, '0')}`;

  fields.meta.replaceChildren();
  addMetaItem(fields.meta, '⌖', user.location);
  addMetaItem(fields.meta, '◫', user.company);
  const blogUrl = safeExternalUrl(user.blog);
  addMetaItem(fields.meta, '↗', user.blog, blogUrl);

  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  fields.rateLimit.textContent = remaining && limit
    ? `GitHub REST API · 本时段剩余 ${remaining} / ${limit} 次请求`
    : '数据来自 GitHub REST API';

  statusPanel.hidden = true;
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function lookup(username, { updateUrl = true } = {}) {
  const normalized = normalizeUsername(username);
  input.value = normalized;

  if (!normalized) {
    showError('还没有输入用户名', '请输入一个 GitHub 用户名，例如 octocat。');
    input.focus();
    return;
  }

  if (!isValidUsername(normalized)) {
    showError('用户名格式不正确', '仅支持字母、数字和单个连字符，且不能以连字符开头或结尾。');
    input.focus();
    return;
  }

  setLoading(true);
  showLoading();

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('user', normalized);
    history.replaceState(null, '', url);
  }

  try {
    const response = await fetch(`${API_ROOT}${encodeURIComponent(normalized)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) {
      showError('没有找到这个账户', `GitHub 上不存在 @${normalized}，请检查拼写后重试。`);
      return;
    }

    if (response.status === 403 || response.status === 429) {
      const resetAt = response.headers.get('x-ratelimit-reset');
      const resetText = resetAt ? `预计 ${new Date(Number(resetAt) * 1000).toLocaleTimeString('zh-CN')} 后恢复。` : '请稍后再试。';
      showError('请求次数已用完', `GitHub 限制了当前网络的匿名请求次数，${resetText}`);
      return;
    }

    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const user = await response.json();
    renderProfile(user, response);

  } catch (error) {
    console.error(error);
    showError('暂时无法连接 GitHub', '请检查网络连接，或稍后再试。');
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  lookup(input.value);
});

document.querySelectorAll('[data-user]').forEach((button) => {
  button.addEventListener('click', () => lookup(button.dataset.user));
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = document.querySelector(`#${button.dataset.copy}`).textContent.replaceAll(',', '');
    await navigator.clipboard.writeText(value);
    const previous = button.textContent;
    button.textContent = '已复制';
    setTimeout(() => { button.textContent = previous; }, 1400);
  });
});

document.querySelector('#share-button').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(window.location.href);
  const button = event.currentTarget;
  button.textContent = '链接已复制';
  setTimeout(() => { button.textContent = '复制查询链接'; }, 1400);
});

const initialUser = new URLSearchParams(window.location.search).get('user');
if (initialUser) lookup(initialUser, { updateUrl: false });
