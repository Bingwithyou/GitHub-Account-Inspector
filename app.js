const API_ROOT = 'https://api.github.com/users/';
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
const CACHE_KEY = 'gitscope-account-cache-v2';
const HISTORY_KEY = 'gitscope-recent-searches-v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 6;
// Colors follow GitHub Linguist's language definitions:
// https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml
const LANGUAGE_COLORS = Object.freeze({
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#7355dd',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Go: '#00ADD8',
  Rust: '#dea584',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  PowerShell: '#012456',
  HTML: '#e34c26',
  CSS: '#663399',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  SCSS: '#c6538c',
  Less: '#1d365d',
  'Objective-C': '#438eff',
  R: '#198CE7',
  MATLAB: '#e16737',
  Lua: '#000080',
  Perl: '#0298c3',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Erlang: '#B83998',
  Scala: '#c22d40',
  Groovy: '#4298b8',
  Solidity: '#AA6746',
  Zig: '#ec915c',
  Nix: '#7e7eff',
  Dockerfile: '#384d54',
  Assembly: '#6E4C13',
  'Jupyter Notebook': '#DA5B0B',
});

const form = document.querySelector('#search-form');
const input = document.querySelector('#username');
const searchButton = document.querySelector('#search-button');
const statusPanel = document.querySelector('#status-panel');
const result = document.querySelector('#result');
const loadingTemplate = document.querySelector('#loading-template');
const recentSearches = document.querySelector('#recent-searches');
const recentList = document.querySelector('#recent-list');
const reposGrid = document.querySelector('#repos-grid');

const fields = {
  avatar: document.querySelector('#avatar'),
  name: document.querySelector('#result-name'),
  login: document.querySelector('#result-login'),
  bio: document.querySelector('#bio'),
  meta: document.querySelector('#profile-meta'),
  type: document.querySelector('#account-type'),
  joinDate: document.querySelector('#join-date'),
  age: document.querySelector('#account-age'),
  ageUnit: document.querySelector('#account-age-unit'),
  ageConversion: document.querySelector('#account-age-conversion'),
  ageToggle: document.querySelector('#age-toggle'),
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
const yearFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let currentProfile = null;
let currentRepositories = [];
let currentAgeDays = 0;
let ageDisplayMode = 'days';
let toastTimer;
let toastHideTimer;
let activeController;
let requestSequence = 0;

function normalizeUsername(value) {
  return value.trim().replace(/^@/, '');
}

function isValidUsername(username) {
  return /^(?!-)(?!.*--)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username);
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function getCachedAccount(username) {
  const storedCache = readStorage(CACHE_KEY, {});
  const cache = storedCache && typeof storedCache === 'object' && !Array.isArray(storedCache) ? storedCache : {};
  const key = username.toLowerCase();
  const entry = cache[key];
  if (!entry) return null;

  if (!entry.cachedAt || Date.now() - entry.cachedAt > CACHE_TTL) {
    delete cache[key];
    writeStorage(CACHE_KEY, cache);
    return null;
  }

  return entry;
}

function cacheAccount(user, repositories, reposState) {
  const storedCache = readStorage(CACHE_KEY, {});
  const cache = storedCache && typeof storedCache === 'object' && !Array.isArray(storedCache) ? storedCache : {};
  cache[user.login.toLowerCase()] = {
    user,
    repositories,
    reposState,
    cachedAt: Date.now(),
  };

  const trimmedEntries = Object.entries(cache)
    .sort(([, a], [, b]) => (b.cachedAt || 0) - (a.cachedAt || 0))
    .slice(0, 12);
  writeStorage(CACHE_KEY, Object.fromEntries(trimmedEntries));
}

function renderHistory() {
  const storedHistory = readStorage(HISTORY_KEY, []);
  const historyItems = Array.isArray(storedHistory) ? storedHistory : [];
  recentList.replaceChildren();
  recentSearches.hidden = historyItems.length === 0;

  historyItems.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-user';
    button.dataset.recentUser = item.login;
    button.setAttribute('aria-label', `再次查询 ${item.login}`);

    const avatar = document.createElement('img');
    avatar.src = item.avatarUrl;
    avatar.alt = '';
    avatar.loading = 'lazy';

    const login = document.createElement('span');
    login.textContent = `@${item.login}`;
    button.append(avatar, login);
    recentList.append(button);
  });
}

function addToHistory(user) {
  const storedHistory = readStorage(HISTORY_KEY, []);
  const historyItems = Array.isArray(storedHistory) ? storedHistory : [];
  const nextHistory = [
    { login: user.login, avatarUrl: user.avatar_url, viewedAt: Date.now() },
    ...historyItems.filter((item) => item.login.toLowerCase() !== user.login.toLowerCase()),
  ].slice(0, HISTORY_LIMIT);
  writeStorage(HISTORY_KEY, nextHistory);
  renderHistory();
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

function renderAccountAge() {
  const years = currentAgeDays / 365.2425;
  const showYears = ageDisplayMode === 'years';
  fields.age.textContent = showYears ? yearFormat.format(years) : numberFormat.format(currentAgeDays);
  fields.ageUnit.textContent = showYears ? '年' : '天';
  fields.ageConversion.textContent = showYears
    ? `共 ${numberFormat.format(currentAgeDays)} 天`
    : `约合 ${yearFormat.format(years)} 年`;
  fields.ageToggle.textContent = showYears ? '查看天数' : '换算为年';
  fields.ageToggle.setAttribute('aria-label', showYears ? '将注册时长切换为天数' : '将注册时长换算为年数');
}

function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast');
  const toastMessage = document.querySelector('#toast-message');
  const toastIcon = document.querySelector('#toast-icon');
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastMessage.textContent = message;
  toastIcon.textContent = type === 'error' ? '!' : '✓';
  toast.classList.toggle('is-error', type === 'error');
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toast.hidden = true; }, 200);
  }, 2200);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy command failed');
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

function getRateInfo(response) {
  if (!response) return null;
  return {
    remaining: response.headers.get('x-ratelimit-remaining'),
    limit: response.headers.get('x-ratelimit-limit'),
  };
}

function renderRateLimit(rateInfo, cachedAt) {
  if (cachedAt) {
    const minutes = Math.floor((Date.now() - cachedAt) / 60_000);
    fields.rateLimit.textContent = `本地缓存 · ${minutes < 1 ? '刚刚' : `${minutes} 分钟前`}更新 · 未消耗 API 请求`;
    return;
  }

  fields.rateLimit.textContent = rateInfo?.remaining && rateInfo?.limit
    ? `GitHub REST API · 本时段剩余 ${rateInfo.remaining} / ${rateInfo.limit} 次请求`
    : '数据来自 GitHub REST API';
}

function renderProfile(user, { rateInfo = null, cachedAt = null } = {}) {
  const createdAt = new Date(user.created_at);
  const updatedAt = new Date(user.updated_at);
  const displayName = user.name || user.login;
  currentProfile = user;

  fields.avatar.src = user.avatar_url;
  fields.avatar.alt = `${displayName} 的 GitHub 头像`;
  fields.name.textContent = displayName;
  fields.login.textContent = `@${user.login}`;
  fields.login.href = user.html_url;
  fields.bio.textContent = user.bio || '这个账户暂时没有填写个人简介。';
  fields.type.textContent = user.type.toUpperCase();
  fields.joinDate.textContent = longDateFormat.format(createdAt);
  currentAgeDays = daysSince(user.created_at);
  ageDisplayMode = 'days';
  renderAccountAge();
  fields.id.textContent = String(user.id);
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
  addMetaItem(fields.meta, '↗', user.blog, safeExternalUrl(user.blog));
  renderRateLimit(rateInfo, cachedAt);

  statusPanel.hidden = true;
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectRepresentativeRepositories(repositories) {
  const originalRepositories = repositories.filter((repository) => !repository.fork);
  const candidates = originalRepositories.length ? originalRepositories : repositories;
  return candidates
    .sort((a, b) => b.stargazers_count - a.stargazers_count || b.forks_count - a.forks_count)
    .slice(0, 6);
}

function getLanguageColor(language) {
  if (LANGUAGE_COLORS[language]) return LANGUAGE_COLORS[language];

  let hash = 0;
  for (const character of language) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 58% 48%)`;
}

function createSvgIcon(viewBox) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('repo-icon');
  return svg;
}

function createStarIcon() {
  const svg = createSvgIcon('0 0 16 16');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}

function createForkIcon() {
  const svg = createSvgIcon('0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const shapes = [
    ['circle', { cx: '12', cy: '18', r: '3' }],
    ['circle', { cx: '6', cy: '6', r: '3' }],
    ['circle', { cx: '18', cy: '6', r: '3' }],
    ['path', { d: 'M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9m6 3v3' }],
  ];

  shapes.forEach(([tagName, attributes]) => {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
    svg.append(shape);
  });

  return svg;
}

function renderRepositories(repositories, state = 'ready') {
  currentRepositories = repositories;
  reposGrid.replaceChildren();

  if (state === 'unavailable') {
    const message = document.createElement('p');
    message.className = 'repos-empty';
    message.textContent = '仓库信息暂时不可用，账户基础资料仍可正常查看。';
    reposGrid.append(message);
    return;
  }

  if (repositories.length === 0) {
    const message = document.createElement('p');
    message.className = 'repos-empty';
    message.textContent = '这个账户暂时没有可展示的公开仓库。';
    reposGrid.append(message);
    return;
  }

  repositories.forEach((repository) => {
    const card = document.createElement('a');
    card.className = 'repo-card';
    card.href = repository.html_url;
    card.target = '_blank';
    card.rel = 'noreferrer';

    const top = document.createElement('div');
    top.className = 'repo-card-top';
    const name = document.createElement('h4');
    name.className = 'repo-card-name';
    name.textContent = repository.name;
    const arrow = document.createElement('span');
    arrow.className = 'repo-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    top.append(name, arrow);

    const description = document.createElement('p');
    description.className = 'repo-description';
    description.textContent = repository.description || '暂无仓库描述。';

    const meta = document.createElement('div');
    meta.className = 'repo-meta';
    if (repository.language) {
      const language = document.createElement('span');
      language.className = 'language';
      language.textContent = repository.language;
      language.style.setProperty('--language-color', getLanguageColor(repository.language));
      meta.append(language);
    }
    const stars = document.createElement('span');
    stars.className = 'repo-stat';
    const starCount = numberFormat.format(repository.stargazers_count);
    stars.append(
      createStarIcon(),
      document.createTextNode(starCount),
    );
    const forks = document.createElement('span');
    forks.className = 'repo-stat';
    const forkCount = numberFormat.format(repository.forks_count);
    forks.append(
      createForkIcon(),
      document.createTextNode(forkCount),
    );
    meta.append(stars, forks);

    const accessibleName = [
      `查看仓库 ${repository.name}`,
      repository.language ? `语言 ${repository.language}` : null,
      `${starCount} 个星标`,
      `${forkCount} 个 Fork`,
    ].filter(Boolean).join('，');
    card.setAttribute('aria-label', accessibleName);

    card.append(top, description, meta);
    reposGrid.append(card);
  });
}

async function fetchRepositories(user, signal) {
  if (!user.public_repos) return { repositories: [], state: 'ready', rateInfo: null };

  try {
    const url = `${API_ROOT}${encodeURIComponent(user.login)}/repos?type=owner&sort=updated&direction=desc&per_page=100`;
    const response = await fetch(url, { headers: API_HEADERS, signal });
    const rateInfo = getRateInfo(response);
    if (!response.ok) return { repositories: [], state: 'unavailable', rateInfo };
    const repositories = selectRepresentativeRepositories(await response.json());
    return { repositories, state: 'ready', rateInfo };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn('Repository lookup failed', error);
    return { repositories: [], state: 'unavailable', rateInfo: null };
  }
}

function buildAccountSummary() {
  if (!currentProfile) return '';
  const user = currentProfile;
  const years = yearFormat.format(currentAgeDays / 365.2425);
  const repositoryNames = currentRepositories.slice(0, 3).map((repository) => repository.name).join('、');
  return [
    `${user.name || user.login} (@${user.login})`,
    `数字用户 ID：${user.id}`,
    `注册日期：${longDateFormat.format(new Date(user.created_at))}`,
    `注册时长：${numberFormat.format(currentAgeDays)} 天（约 ${years} 年）`,
    `公开仓库：${numberFormat.format(user.public_repos)}`,
    `关注者：${numberFormat.format(user.followers)}`,
    repositoryNames ? `代表仓库：${repositoryNames}` : null,
    `GitHub：${user.html_url}`,
  ].filter(Boolean).join('\n');
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

  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;
  const requestId = ++requestSequence;
  setLoading(true);
  showLoading();

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('user', normalized);
    history.replaceState(null, '', url);
  }

  try {
    const cached = getCachedAccount(normalized);
    if (cached) {
      addToHistory(cached.user);
      renderProfile(cached.user, { cachedAt: cached.cachedAt });
      renderRepositories(cached.repositories || [], cached.reposState || 'ready');
      return;
    }

    const response = await fetch(`${API_ROOT}${encodeURIComponent(normalized)}`, {
      headers: API_HEADERS,
      signal,
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
    const repositoriesResult = await fetchRepositories(user, signal);
    const rateInfo = repositoriesResult.rateInfo || getRateInfo(response);
    addToHistory(user);
    renderProfile(user, { rateInfo });
    renderRepositories(repositoriesResult.repositories, repositoriesResult.state);
    cacheAccount(user, repositoriesResult.repositories, repositoriesResult.state);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    showError('暂时无法连接 GitHub', '请检查网络连接，或稍后再试。');
  } finally {
    if (requestId === requestSequence) setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  lookup(input.value);
});

document.querySelectorAll('[data-user]').forEach((button) => {
  button.addEventListener('click', () => lookup(button.dataset.user));
});

recentList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-recent-user]');
  if (button) lookup(button.dataset.recentUser);
});

document.querySelector('#clear-history').addEventListener('click', () => {
  removeStorage(HISTORY_KEY);
  removeStorage(CACHE_KEY);
  renderHistory();
  if (currentProfile) fields.rateLimit.textContent = '当前结果仍在页面中 · 本地查询历史与缓存已清空';
  showToast('本地查询历史与缓存已清空');
});

document.querySelectorAll('[data-help-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const help = document.querySelector(`#${button.dataset.helpToggle}`);
    const willOpen = help.hidden;
    help.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
  });
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = document.querySelector(`#${button.dataset.copy}`).textContent;
    try {
      await copyText(value);
      const previous = button.textContent;
      button.textContent = '已复制';
      showToast(button.dataset.copy === 'user-id' ? '数字用户 ID 已复制' : 'Node ID 已复制');
      setTimeout(() => { button.textContent = previous; }, 1400);
    } catch (error) {
      console.error(error);
      showToast('复制失败，请手动复制', 'error');
    }
  });
});

document.querySelector('#copy-summary-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await copyText(buildAccountSummary());
    button.textContent = '✓ 摘要已复制';
    showToast('账户摘要已复制');
    setTimeout(() => { button.textContent = '复制账户摘要'; }, 1800);
  } catch (error) {
    console.error(error);
    showToast('复制失败，请稍后重试', 'error');
  }
});

document.querySelector('#share-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await copyText(window.location.href);
    button.textContent = '✓ 链接已复制';
    showToast('查询链接已复制，可以分享了');
    setTimeout(() => { button.textContent = '复制查询链接'; }, 1800);
  } catch (error) {
    console.error(error);
    showToast('复制失败，请从地址栏复制链接', 'error');
  }
});

fields.ageToggle.addEventListener('click', () => {
  ageDisplayMode = ageDisplayMode === 'days' ? 'years' : 'days';
  renderAccountAge();
});

renderHistory();
const initialUser = new URLSearchParams(window.location.search).get('user');
if (initialUser) lookup(initialUser, { updateUrl: false });
