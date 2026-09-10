/* ============================================================================
   栖匣 · 桌面 App 主进程  (main.js)
   ----------------------------------------------------------------------------
   原理：桌面窗口直接加载线上部署好的栖匣网页 → 网站内容一更新、
   App 打开即是新版，实现「与网站一模一样 + 实时同步」。多端数据同步
   由网页内置的 pp-sync 完成（端到端加密，见 app/pp-sync.js）。

   配置：见 config.js 中的 WEB_URL 与 SYNC_SERVER。
   ========================================================================== */
'use strict';
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');
const cfg = require('./config.js');

let win = null;

function loadTarget() {
  // 优先线上地址；若配置为 local:true，则加载打包进来的整站静态目录（离线自足）
  if (cfg.WEB_URL === '' || cfg.WEB_URL.indexOf('http') === 0) {
    return win.loadURL(cfg.WEB_URL || `file://${path.join(__dirname, '..', 'centrove-deploy-package', 'index.html')}`);
  }
  return win.loadURL(cfg.WEB_URL);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: '栖匣 · 心有所栖 · 匣纳成长',
    backgroundColor: '#F6F1E6',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon-v3circle-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 外部链接一律交给系统浏览器，不在 App 内跳走
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url && url.indexOf(cfg.WEB_URL) !== 0) e.preventDefault();
  });

  win.once('ready-to-show', () => win.show());
  loadTarget().catch(() => {
    // 兜底：加载本地整站
    win.loadFile(path.join(__dirname, '..', 'centrove-deploy-package', 'index.html'));
  });
}

app.whenReady().then(() => {
  // 允许同步请求不被 CORS/严格源策略拦截（服务端已放开）
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: Object.assign({}, details.responseHeaders, {
      'Access-Control-Allow-Origin': ['*'],
      'Access-Control-Allow-Headers': ['Content-Type','X-Write-Token'],
      'Access-Control-Allow-Methods': ['GET','PUT','OPTIONS']
    })});
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });