/* 栖匣 · Service Worker v31
   彻底重构：解决"加载慢"和"看不到新版"两大问题。
   
   核心策略变更：
   - 导航请求改为 stale-while-revalidate（缓存秒开 + 后台更新），
     不再每次都等网络，解决"每次点击都要加载好久"。
   - 所有 fetch 都带 cache: 'no-cache'，绕过浏览器 HTTP 缓存和 CDN 缓存，
     确保后台更新拿到的永远是最新版。
   
   更新机制：
   - SW 注册时使用 updateViaCache: 'none'，浏览器每次导航都检查新版 sw.js。
   - 页面端每次加载调用 reg.update() 强制检查 SW 更新。
   - 新 SW 安装后 skipWaiting + clients.claim 立即接管。
   - 页面端监听 controllerchange 自动刷新。
   
   安全说明：本 SW 只缓存本站静态资源，绝不读写 localStorage 用户数据。 */
var VERSION = '2026.09.13.v32';
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
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k.indexOf('centrove-pre-') === 0 || k.indexOf('centrove-run-') === 0 ||
                 k === 'upgrade' || k === 'qixia' || k === 'v1' || k === 'v2';
        }).map(function (k) { return caches.delete(k); })
      );
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
  
  // 后台更新：带 cache: 'no-cache' 绕过 HTTP 缓存
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
      // ✅ 有缓存：立即返回，后台继续更新（秒开）
      return cached;
    }
    // 无缓存：等 network
    return networkUpdate.then(function (resp) {
      if (resp) return resp;
      // 网络也失败，回退预缓存的 index.html
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

  // Range 请求：直接走网络
  if (req.headers.get('range')) {
    e.respondWith(fetch(req).catch(function () { return caches.match('./share.html'); }));
    return;
  }

  // 导航：stale-while-revalidate（秒开 + 后台更新）
  if (req.mode === 'navigate') {
    e.respondWith(navSWR(req));
    return;
  }

  // 静态资源
  e.respondWith(assetSWR(req));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
