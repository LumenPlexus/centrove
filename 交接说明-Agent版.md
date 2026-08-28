# 栖匣（Centrove）· 项目交接说明

> 给接手维护本项目的任何 Agent / 开发者。请先完整读本说明，再动任何文件。

## 一、项目是什么

- **产品**：栖匣 —— 大学生成长中枢，一款纯前端单文件网页应用（零安装、零登录、数据全存浏览器本地）。
- **网站英文名 / 仓库**：Centrove（唯一在线地址 `https://lumenplexus.github.io/centrove/`）。
- **作者**：尹平平。版权 © 2026 尹平平，授权 CC BY-NC-ND 4.0（署名—非商业—禁止演绎）。

### 命名铁律（务必遵守，用户对此非常敏感）
| 用途 | 用什么名字 |
|---|---|
| 产品界面内品牌、页面标题 | 中文 **栖匣**（含「心有所栖 · 匣纳成长」等口号） |
| 装桌面后的 APP 名（PWA manifest 的 short_name） | 中文 **栖匣** |
| 网站 / 仓库 / 网址 | 英文 **Centrove** |
| 导出备份的默认文件名 | 中文 **栖匣-备份-日期.json** |

**严禁**把英文名 Centrove 写进产品界面正文；也**严禁**在网址域名层面出现旧名 `qixia`/`pingwanxiang`/`nestbox`（仓库当前就是 `centrove`）。涉及"界面文字"一律用中文「栖匣」，涉及"网址/仓库名"一律用英文 `Centrove`。

## 二、文件结构与职责

| 文件 | 职责 | 是否需随版本改动 |
|---|---|---|
| `index.html` | 全部产品（CSS+HTML+JS 内联在一份文件约 1.2MB） | 是，核心 |
| `sw.js` | Service Worker：离线缓存、版本缓存管理 | 每次改版都需抬缓存版本（见下） |
| `pwa/manifest.json` | PWA 清单（name / short_name / icons） | 改 APP 名时 |
| `pwa/*.png` | 应用图标、logo、启动屏（各尺寸） | 改图标时 |
| `pwa/version.txt` | 版本自检用的版本号（内容如 `2026.08.28.4`） | **每次发版必须更新** |
| `README.md` / `LICENSE.md` | 发布说明 / 版权许可 | 改版时同步 |

## 三、发版必须同步改的 4 处（漏一都会出问题）

1. **`index.html` 顶部** `data-ver="2026.08.28.4"`（约第 2 行）
2. **`index.html` 内 JS 常量** `var V='2026.08.28.4'`（约第 12645 行）
3. **`pwa/version.txt`** 内容写 `<版本号>`
4. **`sw.js` 缓存名** `const CACHE = 'qixia-vXX'`（每次发版把 XX +1，强制所有用户设备丢弃旧缓存、换新页面对比缓存，这是根治"用户看到旧/损坏页面"的关键）
   同时 `index.html` 里服务注册 `navigator.serviceWorker.register('./sw.js?v=YYYYMMDD', ...)` 的日期戳也要+1。

> 版本号格式形如 `2026.08.28.4`（日期.序号）。版本自检逻辑：`fetch('pwa/version.txt')` 读到更大的版本号且不等于本地 `V` 时，会提示用户有新版本。

## 四、已修复的历史问题（勿回退）

- **更新提示弹窗显示源码**：根因是「旧版 Service Worker 缓存 + version.txt 缺失」叠加导致客户拿到损坏的中间版。已通过「重建 version.txt + 抬升缓存版本 v85→v86」解决。**保证 version.txt 存在且版本正确**，切勿再删除它。
- **日 / 夜模式切换不流畅**：源码本身就是**点击即时切换**（直接 setAttribute，无延迟）。若用户仍反馈不流畅，几乎都是旧缓存导致，抬升 SW 缓存版本即可。切换逻辑在 `toggleTheme()` / `applySavedTheme()`（约 10795 行起），`data-theme="dark"` 为夜间。
- **移动端（≤768px）横向溢出 / 侧边栏文字被压缩**：已在 `index.html` 约 449 行新增移动端兜底媒体查询（`overflow-x:hidden`、元素 `max-width:100%`、表格横向滚动、标题 `text-overflow:ellipsis`）。侧边栏在手机端默认隐藏，点左上角 ☰ 抽屉展开（`.sidebar.show`）。
- **命名迭代**：产品名已从「平·万象」→「栖匣」；英文名已从 Nestbox/Roost/qixia 定为 **Centrove**；仓库也完成重命名与旧地址跳转。请保持现状，勿再改名。

## 五、如何发布到 GitHub Pages（已配置好，全程由 Agent 完成）

仓库 `git` 已连到 `origin`（`https://github.com/LumenPlexus/centrove.git`）。现有凭证已在远程 URL 内。

```bash
cd <本目录>
# 1) 按第三节同步版本 4 处
# 2) 提交并推送 master 分支
git add -A
git commit -m "简要改动说明"
git push origin master
# 3) GitHub Actions 自动构建 Pages，约 1~2 分钟生效
```

**验证上线**（构建完成后）：
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lumenplexus.github.io/centrove/            # 应为 200
curl -s https://lumenplexus.github.io/centrove/pwa/version.txt                              # 显示新版本号
curl -s https://lumenplexus.github.io/centrove/sw.js | head                                # 显示新缓存名
```

## 六、数据与隐私红线（勿破坏）

- 数据存 `localStorage`，键名如 `sportLog`、`myCountdowns`、`userMetrics`、`essayHistory`、`pp_checklist` 等。
- localStorage 存储键 `qx_toured_v1` 是"新手导览已看过"的记忆键，**不要改、不要删**，否则老用户会反复看到引导。
- 主题记忆键 `pp_theme_v2`，默认日间。
- 原则：**升级绝不能破坏用户本地已有数据**；任何改动后都应做"旧数据兼容"检查。
- 全站无后端、无上传，隐私声明与免责小字不可删（涉及教育培训、竞赛、理财、论文诚信、副业防骗等板块）。

## 七、给新 Agent 的自查清单（改完后执行）

1. 版本号 4 处一致（index 顶部、`var V`、version.txt、sw 缓存名）。
2. 无旧名残留：grep 页面正文不应出现 `Centrove`/`nestbox`/`qixia`/`pingwanxiang` 做产品名（Centrove 只允许在网址/仓库语境）。
3. `curl` 三条线上验证通过。
4. 本地 `python3 -m http.server 端口` 起服务，浏览器验证：主题切换即时、移动端 320px 不溢出、弹窗正常、无 console 报错。
5. 图标：当前应用图标为「核桃木开盖匣 + 内透暖光」（用户已认可方向但对细节仍在挑选）。若用户未最终确认图标，勿反复用 AI 生成"花哨/加植物/加鸟巢/手绘线稿"的图标——用户明确反感，且提示积分有限。

## 八、给用户的核心交付（可转发）

- 完整源码包（zip，含 `index.html`+`pwa`+`sw`+`README`+`LICENSE`+git 历史）
- 单页成品（`Centrove_栖匣_单页成品.html`，图标内嵌、离线双击即用、适合微信分享）
- 在线成品 `https://lumenplexus.github.io/centrove/`