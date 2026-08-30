/*
 * 栖匣 · Service Worker（离线缓存）
 * 如实说明：
 *  - 本脚本只缓存本站静态文件，用于「可安装为桌面 App」与「断网时仍可打开」。
 *  - 用户所有记录数据一律保存在本机浏览器 localStorage，绝不上传任何服务器、
 *    也绝不经由本 Service Worker 发送或中转任何数据。
 *  - 升级版号后，浏览器会自动拉取新版缓存并刷新一次，此后再次打开即为最新内容。
 * 版本：2026.08.30.7
 */
var CACHE_DATE = '2026.08.30';

var CACHE_NAME = 'qi-xia-' + CACHE_DATE.replace(/\./g, '');
var PRECACHE = [
  './',
  './index.html',
  './css/upgrade.css',
  './js/upgrade.js',
  './pwa/manifest.json',
  './pwa/icon-180.png',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/logo.png',
  './pwa/version.txt'
];

/* 安装：预取核心文件（缺一个不阻塞，逐条容错） */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(PRECACHE.map(function (url) {
          return fetch(url, { cache: 'no-cache' })
            .then(function (r) { if (r.ok) return cache.put(url, r); return undefined; })
            .catch(function () { return undefined; });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* 激活：清除旧版本缓存 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 请求：优先取网络（保证最新），失败回退缓存，缓存不到再兜底 index.html */
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (e.request.method !== 'GET' || !url.match(/^https?:/)) return;
  if (url.match(/\.(js|css|png|jpg|jpeg|webp|svg|gif|woff2?|txt)(\?.*)?$/i)) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (r) {
          var copy = r.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, copy); }).catch(function(){});
          return r;
        }).catch(function () { return caches.match('./'); });
      })
    );
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function () {
      return caches.match('./').then(function (h) { return h || caches.match('./index.html'); });
    })
  );
});