/* 栖匣 · Service Worker
   功能：为「添加到主屏幕」提供离线可用能力。
   - 预缓存全部静态资源，离线时页面仍可打开并读取本地 localStorage 数据；
   - 使用「版本号 + 缓存名」控制更新：每次发版更换 VERSION，activate 时自动清除旧版缓存，
     因此不会像以往那样把用户锁死在旧版；
   - HTML 导航采用网络优先（保证每次拿到最新页面），静态资源采用 stale-while-revalidate
     （离线秒开、在线自动后台刷新）。
   安全说明：本 SW 只缓存本站静态资源，绝不读写、上传任何 localStorage 用户数据。 */
var VERSION = '2026.09.05.content8';
var PRE = 'centrove-pre-' + VERSION;
var RUN = 'centrove-run-' + VERSION;

var PRECACHE_URLS = [
  './',
  './index.html',
  './css/upgrade.css',
  './js/upgrade.js',
  './pwa/manifest.json',
  './pwa/version.txt',
  './favicon-chest20260911-16.png',
  './favicon-chest20260911-32.png',
  './favicon-chest20260911-96.png',
  './favicon-chest20260911-192.png',
  './favicon-chest20260911-180.png',
  './pwa/icon-chest20260911-192.png',
  './pwa/icon-chest20260911-512.png',
  './pwa/logo-chest20260911.png',
  './pwa/share-chest20260911.png',
  './favicon.ico',
  './favicon-16.png',
  './favicon-32.png',
  './favicon-48.png',
  './favicon-96.png',
  './favicon.svg',
  './pwa/apple-touch-icon.png',
  './pwa/logo.png',
  './pwa/icon-20260910-192.png',
  './pwa/icon-20260910-512.png',
  './pwa/logo.png',
  './pwa/maskable-192.png',
  './pwa/maskable-512.png',
  './pwa/maskable-20260910-192.png',
  './pwa/maskable-20260910-512.png',
  './pwa/share-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(PRE).then(function (cache) {
      // 逐个添加，任一失败不阻断整体安装
      return Promise.all(PRECACHE_URLS.map(function (u) {
        return cache.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  var keep = [PRE, RUN];
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return keep.indexOf(k) === -1 &&
                 (k.indexOf('centrove-pre-') === 0 || k.indexOf('centrove-run-') === 0 ||
                  k === 'upgrade' || k === 'qixia' || k === 'v1' || k === 'v2');
        }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(request){
  return caches.match(request).then(function (m) { return m || Response.error(); });
}
function networkThenCache(request){
  return fetch(request).then(function (resp) {
    if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
      var clone = request.clone();
      caches.open(RUN).then(function (cache) { cache.put(clone, resp).catch(function () {}); }).catch(function () {});
    }
    return resp;
  }).catch(function () { return fromCache(request); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只处理同源，外链不拦截

  // 1) 页面导航：网络优先，断网回退缓存（离线可打开）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var c = req.clone();
          caches.open(PRE).then(function (cache) { cache.put('./index.html', c).catch(function () {}); }).catch(function () {});
          return resp;
        }
        return resp;
      }).catch(function () { return fromCache('./index.html'); })
    );
    return;
  }

  // 2) 静态资源：网络优先（在线永远拿最新，杜绝陈旧图标/资源被缓存优先策略锁死），
  //    绕过浏览器 HTTP 缓存刷新后再存 SW 缓存；断网时回退缓存（保持离线可用）。
  var freshReq = new Request(req.url, { method: 'GET', cache: 'reload' });
  e.respondWith(
    fetch(freshReq).then(function (resp) {
      if (resp && (resp.ok || resp.type === 'opaque')) {
        var cl = req.clone();
        caches.open(RUN).then(function (cache) { cache.put(cl, resp).catch(function () {}); }).catch(function () {});
      }
      return resp;
    }).catch(function () { return fromCache(req); })
  );
});