/*
 * 平·万象 Service Worker（根目录版）
 * v52 · 关键修复：把 SW 提升到站点根目录，使 scope 默认覆盖整个站点根
 * （含 index.html 主页）。此前 SW 位于 pwa/ 下且未指定 scope，
 * 默认作用域只有 /pwa/，接管不了主页 → 断网即黑屏/加载失败。
 * 另于 v52 收尾：`关于`新增「版权·许可·信息说明」、修正板块数量表述(25+→33)
 * 与离线措辞、引导三步改为「先专注→记灵感→做完再复盘」。
 *
 * 离线能力说明（诚实、不夸大）：
 *  - 只在「支持 Service Worker 的浏览器」里生效（Chrome/Edge/Firefox/
 *    Safari 11.3+、Android、iOS 11.3+，部分内置浏览器可能受限）。
 *  - 必须先「联网成功打开过本页一次」，SW 安装并缓存后才离线可用；
 *    从未开通过的首次断网打开无法生效（还什么缓存都没有）。
 *  - 导航采用「网络优先」，联网取最新、断网用缓存兜底。
 */
const CACHE = 'pingwanxiang-v52';
const SCOPE = new URL('./', self.location);          // 站点根目录
const ROOT  = SCOPE.href;                            // 如 /pingwanxiang/
const INDEX = new URL('./index.html', SCOPE).href;   // 主页绝对地址

const CORE = [ROOT, INDEX, './pwa/manifest.json', './pwa/icon-192.png', './pwa/icon-512.png', './pwa/splash-6.1.png', './pwa/splash-5.8.png', './pwa/splash-4.7.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 不缓存跨域资源

  const isNav = req.mode === 'navigate';

  // 页面导航：网络优先，其次缓存兜底（断网可打开之前已成功的页面）
  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(INDEX, copy)).catch(() => {});
            caches.open(CACHE).then((c) => c.put(ROOT, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(INDEX).then((h) => h || caches.match(ROOT)))
    );
    return;
  }

  // 静态资源：缓存优先；未命中再走网络并回写缓存
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => undefined);
    })
  );
});