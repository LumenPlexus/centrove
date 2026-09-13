/* 栖匣 · Service Worker v34
   彻底重构：解决"加载慢"和"看不到新版"两大问题。

   核心策略：
   - 导航：stale-while-revalidate（缓存秒开 + 后台更新）
   - 所有 fetch 带 cache: 'no-cache'，绕过浏览器 HTTP 缓存和 CDN
   - version.txt 永远走网络，绝不缓存

   更新机制：
   - SW 注册 updateViaCache: 'none'，每次导航检查新版 sw.js
   - 页面端每次加载 reg.update() 强制检查
   - 新 SW skipWaiting + clients.claim 立即接管
   - 页面端监听 controllerchange 自动刷新
   - activate 时清空 ALL 缓存（不限于特定前缀）

   安全说明：本 SW 只缓存本站静态资源，绝不读写 localStorage。 */
var VERSION = '2026.09.13.v34';
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

/* activate：清空 ALL 缓存，不限于特定前缀，彻底根除旧缓存残留 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(request){
  return caches.match(request).then(function (m) { return m || null; });
}

/* 导航：stale-while-revalidate
   - 有缓存 → 立即返回缓存（秒开），同时后台 fetch 更新缓存
   - 无缓存 → 等 network（首次访问），成功后缓存
   - 网络失败 → 返回缓存（离线可用） */
function navSWR(request){
  var cachedPromise = fromCache(request);

  var networkUpdate = fetch(request, { cache: 'no-cache' }).then(function (resp) {
    if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
      var respClone = resp.clone();
      caches.open(RUN).then(function (cache) {
        cache.put(request, respClone).catch(function () {});
      }).catch(function () {});
    }
    return resp;
  }).catch(function () { return null; });

  return cachedPromise.then(function (cached) {
    if (cached) {
      return cached;
    }
    return networkUpdate.then(function (resp) {
      if (resp) return resp;
      return fromCache('./index.html').then(function (m) {
        return m || new Response('离线模式，请检查网络', { status: 503 });
      });
    });
  });
}

/* 静态资源：stale-while-revalidate */
function assetSWR(request, fallbackUrl) {
  var cached = fromCache(request);
  var network = fetch(request, { cache: 'no-cache' }).then(function (resp) {
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
    if (fallbackUrl) return fromCache(fallbackUrl).then(function(m){return m||network;});
    return network;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* version.txt：永远走网络，绝不缓存，确保版本检查准确 */
  if (url.pathname.indexOf('version.txt') !== -1) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(function () {
      return new Response('', { status: 503 });
    }));
    return;
  }

  /* sw.js 自身：永远走网络，确保浏览器拿到最新 SW */
  if (url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(function () {
      return new Response('', { status: 503 });
    }));
    return;
  }

  if (req.headers.get('range')) {
    e.respondWith(fetch(req).catch(function () { return caches.match('./share.html'); }));
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(navSWR(req));
    return;
  }

  e.respondWith(assetSWR(req));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
