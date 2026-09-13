/* 栖匣 · Service Worker
   功能：为「添加到主屏幕」提供离线可用能力。
   - 预缓存全部静态资源，离线时页面仍可打开并读取本地 localStorage 数据；
   - 使用「版本号 + 缓存名」控制更新：每次发版更换 VERSION，activate 时自动清除旧版缓存，
     因此不会像以往那样把用户锁死在旧版；
   - HTML 导航采用网络优先（保证每次拿到最新页面），静态资源采用 stale-while-revalidate
     （离线秒开、在线自动后台刷新）。
   - ✅ 修复：Response.clone() 正确保存响应体到缓存，不再导致浏览器收到空响应回退旧缓存。
   - ✅ 新增：SW 更新后自动通知页面刷新，确保用户每次打开看到的都是最新版。
   安全说明：本 SW 只缓存本站静态资源，绝不读写、上传任何 localStorage 用户数据。 */
var VERSION = '2026.09.11.v30';
var PRE = 'centrove-pre-' + VERSION;
var RUN = 'centrove-run-' + VERSION;

var PRECACHE_URLS = [
  './',
  './index.html',
  './share.html',
  './css/upgrade.css',
  './js/upgrade.js',
  './app/pp-sync.js',
  './pwa/manifest.json',
  './pwa/version.txt',
  './pwa/logo-chest20260912.png',
  './pwa/icon-final-192.png',
  './pwa/icon-final-512.png',
  './pwa/maskable-final-192.png',
  './pwa/maskable-final-512.png',
  './pwa/favicon-final-192.png',
  './pwa/favicon-final-96.png',
  './pwa/favicon-final-32.png',
  './pwa/favicon-final-16.png',
  './pwa/apple-touch-icon-final.png',
  './favicon.svg',
  './favicon.ico',
  './pwa/favicon.ico',
  './pwa/share-chest20260912.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(PRE).then(function (cache) {
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
      var respClone = resp.clone();
      caches.open(RUN).then(function (cache) {
        cache.put(request, respClone).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  }).catch(function () { return fromCache(request); });
}

function staleWhileRevalidate(request, fallbackUrl) {
  var cached = fromCache(request);
  var network = fetch(request).then(function (resp) {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      var respClone = resp.clone();
      caches.open(RUN).then(function (cache) {
        cache.put(request, respClone).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  });
  return cached.then(function (m) {
    if (m) return m;
    return network;
  }).catch(function () {
    if (fallbackUrl) return fromCache(fallbackUrl);
    return network;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.headers.get('range')) {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('./share.html');
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    var navReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      mode: req.mode,
      credentials: req.credentials,
      redirect: req.redirect,
      cache: 'no-cache'
    });
    e.respondWith(networkThenCache(navReq));
    return;
  }

  e.respondWith(staleWhileRevalidate(req));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
