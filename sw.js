/* 栖匣 · Service Worker v35
   策略：导航请求 network-first（2.5s超时→缓存兜底）
   - 在线时：优先网络，确保每次拿到最新HTML
   - 离线时：超时后回退缓存
   - 静态资源：stale-while-revalidate
   - version.txt/sw.js：永远网络，绝不缓存
   - activate：清空ALL旧缓存 */
var VERSION = '2026.09.13.v35';
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
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(request) {
  return caches.match(request).then(function (m) { return m || null; });
}

/* 导航：network-first + 超时回退缓存
   - 2.5s 内拿到网络响应 → 返回网络版（最新）+ 更新缓存
   - 2.5s 超时 → 返回缓存（快速兜底）
   - 网络失败 → 返回缓存（离线可用）
   - 全失败 → 离线提示 */
function navNetworkFirst(request) {
  var timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, 2500);
  });

  var networkPromise = fetch(request, { cache: 'no-cache' }).then(function (resp) {
    if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
      var respClone = resp.clone();
      caches.open(RUN).then(function (cache) {
        cache.put(request, respClone).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  }).catch(function () { return null; });

  return Promise.race([networkPromise, timeoutPromise]).then(function (result) {
    if (result) return result;
    // 超时或网络失败：回退缓存
    return fromCache(request).then(function (cached) {
      if (cached) return cached;
      return fromCache('./index.html').then(function (m) {
        return m || new Response('离线模式，请检查网络', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      });
    });
  });
}

/* 静态资源：stale-while-revalidate */
function assetSWR(request) {
  var cached = fromCache(request);
  var network = fetch(request, { cache: 'no-cache' }).then(function (resp) {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      var respClone = resp.clone();
      caches.open(RUN).then(function (cache) {
        cache.put(request, respClone).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  }).catch(function () { return null; });
  return cached.then(function (m) {
    if (m) return m;
    return network.then(function (resp) {
      if (resp) return resp;
      return new Response('', { status: 504 });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* version.txt & sw.js：永远网络，绝不缓存 */
  if (url.pathname.indexOf('version.txt') !== -1 || url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(function () {
      return new Response('', { status: 503 });
    }));
    return;
  }

  if (req.headers.get('range')) {
    e.respondWith(fetch(req).catch(function () { return caches.match('./share.html'); }));
    return;
  }

  /* 导航：network-first */
  if (req.mode === 'navigate') {
    e.respondWith(navNetworkFirst(req));
    return;
  }

  e.respondWith(assetSWR(req));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
