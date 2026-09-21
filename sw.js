/* 栖匣 · Service Worker v45
   策略：stale-while-revalidate（秒开 + 后台自动更新）
   
   适用场景：
   - APP / PWA 都需要秒开体验
   - 网站更新了，后台静默下载，下次打开就是最新版
   - 离线可用
   
   关键点：
   - 导航请求：stale-while-revalidate（有缓存秒开，后台更新）
   - 静态资源：stale-while-revalidate
   - version.txt / sw.js：永远网络，绝不缓存
   - activate：仅清除旧版本缓存（保留本次刚预缓存好的资源，加快二次打开）
   - skipWaiting + clients.claim：新SW立即接管 */
var VERSION = '2026.09.21.v85';
var PRE = 'centrove-pre-' + VERSION;
var RUN = 'centrove-run-' + VERSION;

var PRECACHE_URLS = [
  './',
  './index.html',
  './share.html',
  './css/upgrade.css?v=84',
  './css/qx.css?v=75',
  './js/upgrade.js',
  './js/qx.app.min.js?v=84',
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
      /* 重要修复：只清除「旧版本」的缓存，必须保留本次刚预缓存好的 PRE 与运行缓存 RUN。
         旧版逻辑在这里把 ALL 缓存全删了，等于每次部署都把自己刚建好的预缓存删掉，
         导致每次更新后整站冷加载、第一次打开特别慢。改为按版本号精准清理。 */
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('centrove-') === 0 && k !== PRE && k !== RUN) {
          return caches.delete(k);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      /* 版本升级后，强制所有受控的旧窗口重载一次，避免继续跑在旧 JS/CSS 上
         （旧版曾把 body 锁死导致“划不动”，必须立刻切到新代码）。 */
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (ws) {
          ws.forEach(function (c) {
            try { c.navigate(c.url); } catch (e) {}
          });
        });
    })
  );
});

function fromCache(request) {
  return caches.match(request).then(function (m) { return m || null; });
}

/* stale-while-revalidate 核心策略
   - 有缓存 → 立即返回（秒开），同时后台 fetch 更新缓存
   - 无缓存 → 等 network（首次访问），成功后缓存
   - 网络失败且无缓存 → 返回离线提示 */
function staleWhileRevalidate(request, isNav) {
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
      // 后台更新完成后，不影响当前页面（用户感知不到）
      return cached;
    }
    // 无缓存：等 network
    return networkUpdate.then(function (resp) {
      if (resp) return resp;
      // 网络也失败，回退预缓存的 index.html（仅导航）
      if (isNav) {
        return fromCache('./index.html').then(function (m) {
          return m || new Response('离线模式，请检查网络', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        });
      }
      return new Response('', { status: 504 });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* version.txt & sw.js：永远网络，绝不缓存
     确保版本检查和SW更新永远拿到最新版 */
  if (url.pathname.indexOf('version.txt') !== -1 || url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(function () {
      return fromCache(req).then(function(m){ return m || new Response('', { status: 503 }); });
    }));
    return;
  }

  // 视频/音频 Range 请求：直接走网络
  if (req.headers.get('range')) {
    e.respondWith(fetch(req).catch(function () { return caches.match('./share.html'); }));
    return;
  }

  /* 导航：stale-while-revalidate */
  if (req.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(req, true));
    return;
  }

  /* 静态资源：stale-while-revalidate */
  e.respondWith(staleWhileRevalidate(req, false));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
