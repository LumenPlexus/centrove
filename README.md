# 「平·万象」GitHub Pages 发布说明

这是一键发布的最终成品包，包含全部修复后的主站 `index.html` 和“装桌面当 App”所需的 PWA 文件（清单、图标、离线脚本）。

## 这个包里有什么
- `index.html` — 最终成品（时间表格子可填色、链接微信直开、数据本地私密、一键装桌面）
- `sw.js`（站点根目录）— 离线脚本：在支持 Service Worker 的浏览器里，首次联网打开一次后即可离线打开已载入内容
- `pwa/manifest.json` — 安装为 App 的配置
- `pwa/icon-192.png / 512 / 180` — 应用图标

## 为什么用它
- 免费、永久在线、不用备案
- 微信里直接打开
- 可添加到手机/电脑桌面，像 App 一样用
- 数据存在用户自己的浏览器里，各自独立、彼此看不到、不上传后台

## 一次性操作：把它上线到 GitHub Pages（之后更新全由 AI 完成，不花一分钱）

### 第1步：注册免费 GitHub 账号
打开 https://github.com 注册（邮箱即可，免费）。记住用户名。

### 第2步：新建仓库
登录后，右上角「+」→「New repository」。仓库名写 `pingwanxiang`，选 **Public（公开）**，然后 Create repository。

### 第3步：关闭 Pages 的自动 GitHub Actions 干扰（可选但推荐）
仓库页面 → Settings → Pages，先不动；后续发布方式选「Deploy from a branch」。

### 第4步：把权限交给 AI，让 AI 替你发布并持续更新
在 GitHub：右上头像 → Settings → 最下面 Developer settings → Personal access tokens → Tokens (classic) → Generate new token。
- 勾选 `repo` 权限
- 到期时间建议设长一点（如 1 年）
- 生成后复制 token

把这个 token 和你的 GitHub 用户名、仓库名 `pingwanxiang` 告诉执行 AI，AI 会把包推送上去并开启 Pages，之后每次都自己更新、自动发布你的网址。

> 站点上线地址即为：`https://你的用户名.github.io/pingwanxiang/`
> 由于用的是相对路径（./ 和 pwa/），放在子目录也完全可用。

## 数据安全与“更新不丢记录”
- 用户填写的数据存在各自浏览器本地，绑定在“这个网址”上。只要网址不变，更新网页不会动任何人的记录。
- 各人只见自己的数据，无后台、无上传，隐私有保障。

## 版权与许可
本项目为原创作品，作者：尹平平。以 `LICENSE`（CC BY-NC-ND 4.0 署名—非商业性使用—禁止演绎）发布。你可以非商用分享并署名，但不可商用、不可改动后再发布。涉及就业/保研/考试/政策等时效性内容以官方最新发布为准。

## 以后如何更新
想改任何内容，直接告诉 AI 即可：AI 改好后自动推送发布，你无需再登录 GitHub、不花积分。