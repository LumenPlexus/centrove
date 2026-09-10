/* 栖匣 · Service Worker
   功能：为「添加到主屏幕」提供离线可用能力。
   - 预缓存全部静态资源，离线时页面仍可打开并读取本地 localStorage 数据；
   - 使用「版本号 + 缓存名」控制更新：每次发版更换 VERSION，activate 时自动清除旧版缓存，
     因此不会像以往那样把用户锁死在旧版；
   - HTML 导航采用网络优先（保证每次拿到最新页面），静态资源采用 stale-while-revalidate
     （离线秒开、在线自动后台刷新）。
   安全说明：本 SW 只缓存本站静态资源，绝不读写、上传任何 localStorage 用户数据。 */
var VERSION = '2026.09.10.v9';
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
  './favicon-chest20260910-16.png',
  './favicon-chest20260910-32.png',
  './favicon-chest20260910-96.png',
  './favicon-chest20260910-192.png',
  './favicon-chest20260910-180.png',
  './pwa/icon-chest20260910-192.png',
  './pwa/icon-chest20260910-512.png',
  './pwa/logo-chest20260910.png',
  './pwa/share-chest20260910.png'
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

// stale-while-revalidate：缓存优先秒开，后台网络刷新缓存，断网回退缓存。
// 大幅改善首屏加载（不再每次白屏等整包下载），同时保证在线时内容持续更新。
function staleWhileRevalidate(request, fallbackUrl) {
  var cached = fromCache(request);
  var network = fetch(request).then(function (resp) {
    if (resp && (resp.ok || resp.type === 'opaque')) {
      var cl = request.clone();
      caches.open(RUN).then(function (cache) { cache.put(cl, resp).catch(function () {}); }).catch(function () {});
    }
    return resp;
  });
  return cached.then(function (m) {
    if (m) return m;               // 命中缓存：秒开
    return network;                // 无缓存：等网络 / 离线回退缓存
  }).catch(function () {
    if (fallbackUrl) return fromCache(fallbackUrl);
    return network;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只处理同源，外链不拦截

  // 0) 带 Range 的请求（启动器的分段拉取）：原样转交网络，绝不重建丢头；
  //    断网时回退完整缓存（离线场景由加载器自动降级为整段拉取）。
  if (req.headers.get('range')) {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('./share.html');
      })
    );
    return;
  }

  // 1) 页面导航：缓存优先（预缓存已含 index/share），打开即显示；
  //    后台网络拉最新版本替换缓存，断网回退缓存。
  if (req.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(req, './index.html'));
    return;
  }

  // 2) 静态资源：缓存优先秒开，后台网络刷新；断网回退缓存。
  e.respondWith(staleWhileRevalidate(req));
});