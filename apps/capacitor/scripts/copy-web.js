/*
 * 栖匣 · Android App 复制脚本
 * 将调试/离线所需的整站静态文件拷入 Capacitor 的 web 目录。
 * 说明：正式使用建议改为「server.url 加载线上地址」以保证内容实时同步；
 *     本脚本保留，用于本地调试或完全离线打包。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC = path.join(__dirname, '..', '..', '..'); // centrove-deploy-package
const DST = path.join(__dirname, '..', 'web');

const KEEP = ['index.html', 'share.html', 'sw.js', 'css', 'js', 'app', 'pwa', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon.ico', 'favicon.svg'];

function rm(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

function main() {
  rm(DST);
  fs.mkdirSync(DST, { recursive: true });
  let copied = 0;
  KEEP.forEach((name) => {
    const s = path.join(SRC, name);
    if (!fs.existsSync(s)) return;
    fs.cpSync(s, path.join(DST, name), { recursive: true });
    copied++;
  });
  console.log('[copy-web] copied ' + copied + ' items -> web/');
}

if (require.main === module) main();