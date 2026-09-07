/* 栖匣 · 桌面 App 预加载脚本（安全隔离，最小暴露面） */
'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('qixiaNative', {
  platform: process.platform,
  version: process.versions.electron
});