/* 栖匣 · 自我卸载版 Service Worker
   用途：彻底清除历史遗留的 Service Worker 及其全部缓存（它们会让用户永远停留在旧版、且可能引起"一直加载中"）。
   安装后立即接管并：卸载自身、删除全部缓存、刷新所有已打开的页面。
   作用目标：已经被旧 SW 控制的设备，下一次更新检查时被抓取到本脚本，从而自动跳出"旧版锁死"。
   ============================================================ */
var CD = '2026.09.02.3';
self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    Promise.all([
      Promise.resolve(self.registration && self.registration.unregister()),
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).catch(function () {})
    ]).then(function () {
      try {
        return self.clients.matchAll({ type: 'window' }).then(function (cls) {
          cls.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
        });
      } catch (err) { return null; }
    }).catch(function () {})
  );
});
/* 不注册任何 fetch 拦截：放行全部请求，彻底停止"缓存锁旧版"。 */
self.addEventListener('fetch', function () {});