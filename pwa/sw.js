/* 平·万象 Service Worker：让网站可安装为桌面 App、并支持断网也能打开 */
/* v18 · 关键更新：
   1) 导航策略改为「网络优先」——只要联网就取最新页面，彻底解决旧缓存导致的
      按钮/导航失灵（如系统设置跳错、主题切换无反应）等"内容还是旧版"的问题；
   2) 断网时仍可用本地缓存秒开，离线兜底不变。*/
/* v22 · 缓存版本 v33：板块改名（长期规划→生涯蓝图、学业规划→学业精进、远见蓝图→行进罗盘）、新增「平安护航」防诈骗板块、品牌风页脚+时效说明按当前年月自动更新、外链逐一核验。 */
/* v23 · 缓存版本 v34：修复「新手上手」3按钮点了没反应（qsGo 作用域）、产品介绍页脚升级、并强制刷新旧缓存，消除侧边导航偶发显示错位。 */
/* v24 · 缓存版本 v35：隐私透明提示改为「每个新会话显示一次」恢复显示；新手上手卡片跳过分组、并确保隐私提示置于最上方。 */
/* v25 · 缓存版本 v36：新手上手卡片点行动按钮不再消失(仅跳过关闭)；产品导览页脚升级更高级有特色；职业发展+简历面试合并为单一深度版块并新增可复制简历模板。 */
const CACHE = 'pingwanxiang-v36';
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

  // 页面导航：网络优先，其次缓存。
  // 联网时永远返回最新页面（配合 v17 之前的缓存版本自动作废），
  // 断网时用最后缓存的页面兜底，保证离线也能打开。
  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
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