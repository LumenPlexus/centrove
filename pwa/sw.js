/* 平·万象 Service Worker：让网站可安装为桌面 App、并支持断网也能打开 */
/* v13 · 首页改为缓存优先+后台刷新：每次打开秒开不再卡顿，更新静默完成 */
const CACHE = 'pingwanxiang-v13';
const CORE = ['./', './index.html', './pwa/manifest.json', './pwa/icon-192.png', './pwa/icon-512.png', './pwa/splash-6.1.png', './pwa/splash-5.8.png', './pwa/splash-4.7.png'];

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

  // 页面导航：缓存优先，立即返回本地内容（秒开），再在后台拉新版本静默更新。
  if (isNav) {
    e.respondWith(
      caches.match('./index.html').then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        return hit || network;
      })
    );
    return;
  }

  // 静态资源：缓存优先；缓存未命中再走网络
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});