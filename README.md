# GitScope

一个可直接部署到 GitHub Pages 的 GitHub 账户公开信息查询页。输入用户名后可查看：

- 账户注册日期，以及注册时长的天数／年数切换
- 数字用户 ID 与 Node ID
- 公开仓库、关注者、正在关注
- 从最近更新的仓库中选出的代表仓库
- 账户类型、简介、位置、公司、个人网站
- 资料最后更新时间、当前 API 请求余量与清晰的复制反馈
- 最近查询、本地 15 分钟缓存与一键复制账户摘要
- 完整的 Open Graph、Twitter Card、结构化数据与分享封面
- 与主站视觉一致的自定义 404 页面

## 本地预览

项目没有构建步骤。在项目目录运行任意静态文件服务器：

```bash
npx serve .
```

然后打开终端输出的网址即可。

> 不建议直接双击 `index.html` 预览，因为部分浏览器会限制 `file://` 页面发起网络请求。

## 自动化测试

测试会拦截 GitHub API 并使用固定数据，不消耗真实 API 请求额度：

```bash
npm install
npx playwright install chromium
npm test
```

推送或提交 Pull Request 时，GitHub Actions 会先执行浏览器测试；只有测试通过后，`main` 分支才会部署到 Pages。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，将本目录中的所有文件推送到 `main` 分支。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
4. 打开 **Actions** 页签，等待 `Deploy GitScope to GitHub Pages` 完成。

站点地址通常为 `https://你的用户名.github.io/仓库名/`。

## 数据与限额

页面只请求 GitHub 的公开 REST API，不使用后端，也不需要 Token。最近查询和 15 分钟结果缓存仅保存在访问者自己的浏览器中，可在页面上一键清空。GitHub 对未认证的公开 API 请求通常限制为每个来源 IP 每小时 60 次。不要把个人访问令牌写入前端代码；公开部署后任何人都能看到它。

## 文件结构

```text
.
├── index.html
├── styles.css
├── app.js
└── .github/workflows/deploy-pages.yml
```
