/* 平·万象 Service Worker：让网站可安装为桌面 App、并支持断网也能打开 */
/* v18 · 关键更新：
   1) 导航策略改为「网络优先」——只要联网就取最新页面，彻底解决旧缓存导致的
      按钮/导航失灵（如系统设置跳错、主题切换无反应）等"内容还是旧版"的问题；
   2) 断网时仍可用本地缓存秒开，离线兜底不变。*/
/* v22 · 缓存版本 v33：板块改名（长期规划→生涯蓝图、学业规划→学业精进、远见蓝图→行进罗盘）、新增「平安护航」防诈骗板块、品牌风页脚+时效说明按当前年月自动更新、外链逐一核验。 */
/* v23 · 缓存版本 v34：修复「新手上手」3按钮点了没反应（qsGo 作用域）、产品介绍页脚升级、并强制刷新旧缓存，消除侧边导航偶发显示错位。 */
/* v24 · 缓存版本 v35：隐私透明提示改为「每个新会话显示一次」恢复显示；新手上手卡片跳过分组、并确保隐私提示置于最上方。 */
/* v25 · 缓存版本 v36：新手上手卡片点行动按钮不再消失(仅跳过关闭)；产品导览页脚升级更高级有特色；职业发展+简历面试合并为单一深度版块并新增可复制简历模板。 */
/* v26 · 缓存版本 v37：新手上手卡片按钮改为记灵感/写复盘/做专注；移除跨设备同步中"自行发布/生成链接"说明(防搬运)；更新说明补齐并突出新价值；产品导览口号改"四年，去过，不是路过"。 */
/* v27 · 缓存版本 v38：侧边栏重新排序(效率与工具提前、优先级重排)；"考试倒计时"更名"蟾宫折桂"(正文/手机端/提示语同步)；新增差异化板块「学分衡算」(绩点/加权/保研综测计算器)、「金榜题名」(奖学金与资助速查)、「惠学专享」(学生权益/羊毛地图)；深化蟾宫折桂(2026考试日程)、竞赛科研(2026报名窗口)、搞钱副业(合规与真实行情)、职业发展(2026就业行情)。 */
/* v28 · 缓存版本 v39：板块改名统一（蟾宫折桂→备考宝典、金榜题名→奖助指南、惠学专享→学子福利、学分衡算并入学业精进、学业与升学→学业成长）；修复失效外链（会计资格报名 kzp.mof 已下线→ausm.mof 全国会计人员统一平台），并在备考宝典/生涯蓝图新增会计资格、公务员考试入口与「打不开别慌」白屏兜底提示；产品导览收尾 CTA 升级(渐变+印章+价值卡)，表述去掉绝对化；清理重复使用提示内容。 */
/* v29 · 缓存版本 v40：导航瘦身合并——「奖助指南」并入「学子福利」成为单一深度板块「奖助福利」（放理财与副业，按「该先办什么」做了六档优先级总览并扩充内容）；侧边栏与首页分类同步更新。 */
/* v30 · 缓存版本 v41：返回恢复优化——切换出/刷新回来后，停留在当前板块内「上次激活的标签页」（如英语六级），不再重置回第一个标签（如四级）。 */
/* v32 · 缓存版本 v43：产品导览收尾板块彻底重做为「终章 · 掌控感」浅色版本——摒弃深色金调星盘，改走与整个产品总览一致的浅色留白×青绿点缀×宋体排印；保留「把四年，过出掌控感」一句，其余以眉标「终·四年有迹可循」+ 六维白色轻卡片 + 安抚带 + 按钮收束。 */
/* v33 · 缓存版本 v44：浏览器实测审计修补——① 修复任务删除/完成失效（任务 id 改为「时间戳_随机串」后 onclick 注入未加引号导致变成 JS 标识符报错，已统一加引号）；② 新增口碑：习惯可删除（带确认+重绘热力图/统计）、习惯名做 HTML 转义防注入；③ 强制刷新旧缓存，消除旧版残留导致的「Numeric separator」报错。 */
/* v34 · 缓存版本 v45：产品导览收官板块彻底重做为《四年之书·档案盖章》——跳出六维卡片网格，改走「朱红印信 + 宋体大字 + 归档格线 + 签名横线」的独有归档叙事，凸显"只存你手"的差异化价值；主按钮文案改"开启我的四年记录"并修复居中、次按钮描边加粗，整体更高级、更适配浅色留白页底。 */
const CACHE = 'pingwanxiang-v45';
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