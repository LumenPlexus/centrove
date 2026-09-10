# 栖匣 · 多端部署与使用说明

一套静态网站 + 自托管同步服务端 + 桌面/手机 App 壳，实现「网站内容实时同步、多端数据互通」。

## 目录结构

```
centrove-deploy-package/
├─ index.html / share.html / css / js      # 栖匣主站点（数据经 end-to-end 加密后云端同步）
├─ app/pp-sync.js                          # 云同步核心（嵌入站点，右下角 ⇄ 面板操作）
├─ sync-server/                            # 自托管同步服务端（Node，零依赖）
├─ apps/electron/                          # 桌面 App（Windows / macOS 安装包）
├─ apps/capacitor/                         # Android App（APK）
└─ pwa/  sw.js  manifest.json              # 安装到主屏 / 离线能力
```

## 一、产品图标已统一

你选定的产品图标（`pwa/logo-v3circle.png`，赭金细圆框 + 白圆角方 + 棕色栖匣）现已用于**所有**品牌图标出现的位置：

| 位置 | 图标 | 状态 |
|---|---|---|
| 启动屏（index + share） | logo-v3circle.png，150px 容器 / 116px，无装饰环 | ✅ 已统一 |
| 顶栏品牌 logo、侧栏 logo、欢迎卡片、PDF 导出品牌栏 | logo-v3circle.png | ✅ 已统一 |
| 加载失败兜底图 LOGO_DATA_URI（index + share） | 已刷新为选定图标 | ✅ 已统一 |
| 64px 内联 favicon（index + share） | 已刷新为选定图标 | ✅ 已统一 |
| favicon-v3circle-*、favicon.ico | 与选定图标一致（感知距离 0.0） | ✅ 已统一 |
| PWA 应用图标（manifest / icon-v3circle-*） | 选定图标 | ✅ 已统一 |
| 微信分享图 og:image / twitter:image | logo-v3circle.png | ✅ 已统一 |
| 桌面 & 手机 App 应用图标 | 选定图标 | ✅ 已统一 |

## 二、部署网站（内容实时同步的前提）

App 采用「加载线上地址」方式，所以只要站点更新，App 打开就是最新版。

1. 把 `centrove-deploy-package/` 内全部文件部署到任意静态托管（GitHub Pages、Nginx、Cloudflare Pages 等）。
2. 记住线上地址，例如 `https://your-domain.com/qi-xia/`。

## 三、部署同步服务端（多端数据互通）

```bash
cd sync-server
node server.js                 # 默认监听 8787
PORT=9000 node server.js       # 自定义端口
BASE=/pp-sync node server.js   # 挂在子路径（推荐配 Nginx 反代）
```

- 用 Nginx 反代到域名，并务必开启 HTTPS（浏览器端 Web Crypto 只在安全上下文可用）。
- 数据目录 `sync-server/data/`，请定期备份。
- 服务端**只存密文**；每个桶的读写都要求「同步口令」派生出的令牌，无口令即无法读写。
- 建议 Nginx 示例：
  ```nginx
  location /pp-sync/ {
      proxy_pass http://127.0.0.1:8787/pp-sync/;
      proxy_set_header Host $host;
  }
  ```

使用姿势：在站点/App 右下角点「⇄」→ 输入服务端地址与**同步口令** → 立即同步；新设备输入**同一口令**即可拉取合并。口令务必牢记，丢失无法找回。

## 四、桌面 App（Windows/macOS）

```bash
cd apps/electron
# 1) 修改线上地址
#    编辑 config.js → WEB_URL = '你的线上地址'
# 2) 安装依赖并启动预览
npm install
npm start
# 3) 打包安装包
npm run dist:win     # Windows 生成 release/栖匣-Setup-x.x.x.exe
npm run dist:mac     # macOS 生成 .dmg
npm run dist:linux   # Linux 生成 AppImage
```
App 图标已内置为选定产品图标（`apps/electron/assets/`）。

## 五、Android App（APK）

需要本机装有 Android Studio（含 SDK）。

```bash
cd apps/capacitor
# 1) 修改线上地址
#    编辑 capacitor.config.json → server.url = '你的线上地址'
# 2) 生成 App 图标（用选定产品图标，resources/icon.png 已备好）
npm install
npx capacitor-assets generate
# 3) 添加并构建 Android
npm run sync:web
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug   # 产出 app/build/outputs/apk/debug/app-debug.apk
```
也可用 Android Studio 打开 `android/` 目录后一键 Build。

## 六、安全与隐私

- 所有数据先在本机用「同步口令」派生的 AES-256 密钥加密，密钥与明文**均不上传**。
- 服务器只能看到：口令哈希（分桶键）+ 密文 + 修订号，无法还原任何内容。
- 数组条目多端去重合并，标量冲突自动备份进 `pp_sync_conflicts`，绝不丢数据。

## 七、当前待你补充的配置项

| 配置 | 位置 | 说明 |
|---|---|---|
| 网站线上地址 | `apps/electron/config.js` 的 `WEB_URL`；`apps/capacitor/capacitor.config.json` 的 `server.url` | 改成你的真实部署地址 |
| 同步服务端地址 | App/网页「⇄」面板内输入，或 `window.__PP_SYNC_SERVER__` | 填入你部署的 sync-server 域名 |