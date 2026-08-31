/* ============================================================
   栖匣 · 全面升级改造层 (upgrade.js)
   目标：在保留既有功能与数据的前提下，统一体验、修复风险、补齐增强能力。
   所有函数优先防御式编写，不破坏旧版全局函数。
   ============================================================ */
(function () {
  'use strict';

  var NS = window.QixiaUpgrade = {};
  var STORE_KEY = 'pp_cu_config_v1';
  var DATA_VERSION = '2026.08.31.3';

  /* ============================================================
     1. 通用工具
     ============================================================ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); });
  }
  function safeJsonParse(s, def) { if (s == null) return def; try { return JSON.parse(s); } catch (e) { return def; } }
  function getConfig() { return safeJsonParse(localStorage.getItem(STORE_KEY), {}); }
  function setConfig(cfg) { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); }
  function storeSize() {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), v = localStorage.getItem(k);
      total += (k.length + (v ? v.length : 0)) * 2;
    }
    return total;
  }
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  /* ============================================================
     2. Toast（替代旧 flash，更可控）
     ============================================================ */
  var toastEl = null;
  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = el('div', 'cu-toast');
    document.body.appendChild(toastEl);
    return toastEl;
  }
  var toastTimer = null;
  function toast(msg, type) {
    var t = ensureToast();
    t.textContent = msg;
    t.className = 'cu-toast' + (type ? ' ' + type : '');
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  NS.toast = toast;

  // 安全地接管旧 flash
  if (typeof window.flash === 'function') {
    // 统一走 toast：.cu-toast 已被 CSS 隐藏并转发到 #flash，只渲染一次，杜绝同一条消息双弹
    window.flash = function (msg) { toast(msg); };
  } else {
    window.flash = toast;
  }

  /* ============================================================
     3. 确认弹窗（高危操作二次确认）
     ============================================================ */
  function confirmDanger(title, text, onConfirm) {
    var ov = el('div', 'cu-overlay');
    ov.innerHTML = '<div class="cu-modal">' +
      '<h4>' + escapeHtml(title) + '</h4>' +
      '<p>' + escapeHtml(text) + '</p>' +
      '<div class="cu-actions">' +
      '<button class="btn btn-ghost cu-cancel">取消</button>' +
      '<button class="btn btn-danger cu-confirm">确认删除</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('show'); });
    function close() { ov.classList.remove('show'); setTimeout(function () { ov.remove(); }, 220); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('.cu-cancel', ov).addEventListener('click', close);
    $('.cu-confirm', ov).addEventListener('click', function () { close(); if (onConfirm) onConfirm(); });
  }
  NS.confirmDanger = confirmDanger;

  // 接管部分旧 uiConfirm，使其使用新皮肤
  if (typeof window.uiConfirm === 'function') {
    var oldUiConfirm = window.uiConfirm;
    window.uiConfirm = function (msg, onYes) {
      if (msg.indexOf('移除') !== -1 || msg.indexOf('删除') !== -1 || msg.indexOf('清空') !== -1) {
        confirmDanger('请确认', msg, onYes);
      } else {
        oldUiConfirm(msg, onYes);
      }
    };
  }

  /* ============================================================
     4. 主题同步与 meta theme-color
     ============================================================ */
  var themeMeta = document.getElementById('themeColorMeta');
  function updateThemeMeta() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (themeMeta) themeMeta.setAttribute('content', isDark ? '#2C2620' : '#6E4F37');
  }
  if (typeof window.toggleTheme === 'function') {
    var oldToggle = window.toggleTheme;
    window.toggleTheme = function () {
      oldToggle();
      updateThemeMeta();
    };
  }
  updateThemeMeta();

  /* ============================================================
     5. switchView 防御式加固 + 视图切换回调
     ============================================================ */
  if (typeof window.switchView === 'function') {
    var oldSwitch = window.switchView;
    window.switchView = function (name) {
      if (!name || !document.getElementById('view-' + name)) {
        console.warn('未知视图:', name, '，已降级到 home');
        name = 'home';
      }
      // 若视图存在但无对应导航项，临时创建一个隐藏占位，避免原始 switchView 抛错
      var navItem = document.querySelector('.nav-item[data-view="' + name + '"]');
      if (!navItem) {
        navItem = el('div', 'nav-item');
        navItem.setAttribute('data-view', name);
        navItem.style.display = 'none';
        var sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.appendChild(navItem);
      }
      oldSwitch(name);
      onViewChanged(name);
    };
  }
  function onViewChanged(name) {
    closeSearch();
    if (name === 'home') enhanceHome();
    if (name === 'stats') renderDashboard();
    if (name === 'finance') renderExpenseChart();
    if (name === 'settings') renderSettingsExtras();
    if (name === 'journal') enhanceJournal();
    if (name === 'help') renderHelpCenter();
    if (name === 'exam' || name === 'study' || name === 'career' || name === 'perk' || name === 'college' || name === 'life') addDateDisclaimer(name);
    if (name === 'study') addGpaDisclaimer();
  }

  /* ============================================================
     6. 顶部导航增强（全局搜索、帮助入口）
     ============================================================ */
  function injectTopNav() {
    /* 顶栏搜索/帮助图标已在 index.html 的 .topbar .tools 中内置（搜索升级为全屏搜索覆盖层）。
       此处旧版动态注入的 .cu-topnav 会与内置图标重复，导致搜索/问号各出现两次，
       故彻底停用该注入。全局搜索能力仍由 QixiaUpgrade.openSearch() 提供并被顶栏搜索复用。 */
    return;
    var topbar = $('.topbar');
    if (!topbar || $('.cu-topnav', topbar)) return;
    var nav = el('div', 'cu-topnav');
    nav.innerHTML = '<button title="全局搜索" aria-label="全局搜索" onclick="QixiaUpgrade.openSearch()"><span>🔍</span><small>搜索</small></button>' +
      '<button title="帮助中心" aria-label="帮助中心" onclick="switchView(\'help\')"><span>❓</span><small>帮助</small></button>';
    var tbTitle = $('.tb-title', topbar);
    if (tbTitle && tbTitle.nextSibling) {
      topbar.insertBefore(nav, tbTitle.nextSibling);
    } else {
      topbar.appendChild(nav);
    }
  }

  function injectHelpNav() {
    var sidebar = $('#sidebar');
    if (sidebar && !$('.nav-item[data-view="help"]', sidebar)) {
      var set = $('.nav-item[data-view="settings"]', sidebar);
      var item = el('div', 'nav-item');
      item.setAttribute('data-view', 'help');
      item.setAttribute('onclick', "switchView('help')");
      item.innerHTML = '<span>❓</span>帮助中心';
      if (set && set.parentNode) set.parentNode.insertBefore(item, set);
      else sidebar.appendChild(item);
    }
  }

  /* ============================================================
     7. 全局搜索
     ============================================================ */
  var searchOverlay = null;
  function ensureSearch() {
    if (searchOverlay) return searchOverlay;
    searchOverlay = el('div', 'cu-search-overlay');
    searchOverlay.innerHTML = '<div class="cu-search-box">' +
      '<input class="cu-search-input" placeholder="搜索待办、打卡、笔记、记账、错题、单词、书摘…" autocomplete="off">' +
      '<div class="cu-search-results"></div></div>';
    document.body.appendChild(searchOverlay);
    searchOverlay.addEventListener('click', function (e) { if (e.target === searchOverlay) closeSearch(); });
    var inp = $('.cu-search-input', searchOverlay);
    inp.addEventListener('input', function () { doSearch(inp.value.trim()); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
      else if (e.key === 'ArrowDown') { e.preventDefault(); searchMove(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); searchMove(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var items = $$('.cu-search-item', searchOverlay);
        var active = items[searchKbIndex];
        if (active) active.click();
        else if (items.length === 1) items[0].click();
      }
    });
    return searchOverlay;
  }
  function openSearch() { ensureSearch(); requestAnimationFrame(function () { searchOverlay.classList.add('show'); var inp = $('.cu-search-input', searchOverlay); inp.value = ''; inp.focus(); doSearch(''); }); }
  function closeSearch() { if (searchOverlay) searchOverlay.classList.remove('show'); }
  NS.openSearch = openSearch;
  NS.closeSearch = closeSearch;

  /* 模块导航索引：用于全局搜索快速定位板块 */
  var NAV_INDEX = [
    { view: 'home', name: '今日概览', keywords: '首页 概览 待办 倒数 心语 知识 备份' },
    { view: 'quadrant', name: '轻重缓急', keywords: '四象限 优先级 紧急 重要 时间管理' },
    { view: 'plans', name: '行进罗盘', keywords: '计划 日程 周计划 月计划 时间线' },
    { view: 'goals', name: '目标拆解', keywords: '目标 OKR 拆解 里程碑 长期目标' },
    { view: 'habits', name: '习惯养成', keywords: '习惯 打卡 签到 坚持  streak 21天' },
    { view: 'life', name: '生涯蓝图', keywords: '生涯 规划 大学 未来 职业 人生' },
    { view: 'study', name: '学业精进', keywords: '学习 GPA 绩点 课程 学分 错题 单词' },
    { view: 'exam', name: '考试规划', keywords: '考试 四六级 考研 考证 雅思 托福 教资 备考' },
    { view: 'contest', name: '竞赛科研', keywords: '竞赛 科研 大创 挑战杯 论文 专利' },
    { view: 'paper', name: '论文写作', keywords: '论文 查重 文献 开题 答辩 格式' },
    { view: 'tpl', name: '专项模板', keywords: '模板 范文 申请书 简历 邮件' },
    { view: 'campus', name: '校园生活', keywords: '校园 宿舍 食堂 社团 学生会 选课' },
    { view: 'career', name: '职业发展', keywords: '实习 求职 简历 面试 就业 秋招 春招' },
    { view: 'growth', name: '个人提升', keywords: '提升 技能 阅读 英语 演讲 表达' },
    { view: 'journal', name: '时光札记', keywords: '日记 笔记 记录 复盘 周记 月记' },
    { view: 'stats', name: '成长档案', keywords: '统计 档案 数据 分析 图表 年度报告' },
    { view: 'health', name: '运动健康', keywords: '运动 健身 跑步 睡眠 饮食 健康' },
    { view: 'mind', name: '心灵成长', keywords: '心理 情绪 焦虑 压力 冥想 自测' },
    { view: 'safety', name: '平安护航', keywords: '安全 防诈骗 网络 隐私 保护' },
    { view: 'creative', name: '灵感看板', keywords: '灵感 创意 想法 收藏 随记' },
    { view: 'shelf', name: '书海拾贝', keywords: '读书 书摘 书单 阅读 笔记' },
    { view: 'podcast', name: '耳畔星河', keywords: '播客 电台 音频 听力' },
    { view: 'movie', name: '幕间观澜', keywords: '电影 影单 观影 推荐 影评' },
    { view: 'fun', name: '轻松一下', keywords: '娱乐 放松 游戏 笑话 休闲' },
    { view: 'finance', name: '理财管理', keywords: '记账 支出 预算 理财 存钱 钱包' },
    { view: 'save', name: '省钱技巧', keywords: '省钱 优惠 学生 折扣 薅羊毛' },
    { view: 'earn', name: '搞钱副业', keywords: '兼职 副业 赚钱 奖学金 实习' },
    { view: 'shop', name: '购物指南', keywords: '购物 数码 宿舍好物 推荐 清单' },
    { view: 'perk', name: '助学帮扶', keywords: '奖学金 助学金 贷款 贫困 补助' },
    { view: 'timer', name: '心流计时', keywords: '番茄钟 专注 计时 倒计时 效率' },
    { view: 'tools', name: '高效方法', keywords: '效率 工具 方法 技巧 学习法' },
    { view: 'ai', name: '智造工坊', keywords: 'AI 人工智能 提示词 ChatGPT 辅助' },
    { view: 'party', name: '入团入党', keywords: '团员 党员 入党 入团 申请 政审' },
    { view: 'college', name: '大学须知', keywords: '新生 入学 报到 军训 学籍 转专业' },
    { view: 'settings', name: '系统设置', keywords: '设置 导出 导入 备份 主题 数据' },
    { view: 'about', name: '关于栖匣', keywords: '关于 创作者 尹平平 隐私 协议' }
  ];

  // 把任意存储值安全转为数组（对象→Object.values，非数组/解析失败→空数组）
  function asArr(key) {
    try {
      var v = safeJsonParse(localStorage.getItem(key), []);
      return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
    } catch (e) { return []; }
  }
  function searchIndex() {
    var idx = [];
    function add(view, type, title, text, extra) {
      if (!text && !title) return;
      idx.push({ view: view, type: type, title: title, text: String(text || '').slice(0, 200), extra: extra });
    }
    // 待办
    asArr('pp_tasks').forEach(function (t) { add('home', '待办', t.text, t.text, t.date); });
    // 日记（按日期索引的对象 → Object.values）
    asArr('pp_journals').forEach(function (j) { add('journal', '札记', j.title || '无标题', (j.title || '') + ' ' + (j.body || ''), j.date); });
    // 记账
    asArr('pp_expenses').forEach(function (x) { add('finance', '记账', x.item || '支出', (x.item || '') + ' ' + (x.amount || '') + ' ' + (x.category || ''), x.date); });
    // 错题
    asArr('pp_wrongs').forEach(function (w) { add('study', '错题', w.q || '错题', (w.q || '') + ' ' + (w.a || ''), ''); });
    // 单词
    asArr('pp_words').forEach(function (w) { add('study', '单词', w.word || '', w.word + ' ' + (w.mean || ''), ''); });
    // 书摘/笔记
    asArr('pp_bookNotes').forEach(function (n) { add('shelf', '书摘', n.book || '书摘', n.note || '', ''); });
    // 灵感
    asArr('pp_inspire').forEach(function (i) { add('creative', '灵感', i.title || '灵感', i.text || '', ''); });
    // 目标
    asArr('pp_goalChecks').forEach(function (g) { add('goals', '目标', g.title || '目标', g.title || '', ''); });
    // 习惯
    asArr('pp_habits').forEach(function (h) { add('habits', '习惯', h.name || '', h.name || '', ''); });
    // 电影
    asArr('pp_movies').forEach(function (m) { add('movie', '影单', m.title || '', m.title + ' ' + (m.note || ''), ''); });
    // 倒数日
    asArr('pp_countdowns').forEach(function (c) { add('home', '倒数日', c.name || '倒数日', c.name || '', c.date); });
    // 模块导航
    NAV_INDEX.forEach(function (n) { add(n.view, '板块', n.name, n.keywords, ''); });
    // 内置内容：扫描各视图的标题卡片
    $$('section.view[id^="view-"]').forEach(function (view) {
      var vid = view.id.replace('view-', '');
      var heads = Array.from(view.querySelectorAll('.card > h3, .card > h2, .page-head h1'));
      heads.forEach(function (h) {
        var t = h.textContent.trim();
        if (t) add(vid, '内容', t, t, '');
      });
    });
    return idx;
  }

  var SEARCH_HOT = ['待办', '习惯', '记账', '备考', '四六级', '倒数日', '番茄钟', 'GPA'];

  function renderSearchSuggestions(box) {
    box.innerHTML = '<div class="cu-search-empty" style="text-align:left">' +
      '<div style="font-weight:600;margin-bottom:8px;color:var(--text)">你可以搜索：</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
      SEARCH_HOT.map(function (k) { return '<span class="cu-search-tag" onclick="QixiaUpgrade.doSearch(\'' + k + '\')">' + escapeHtml(k) + '</span>'; }).join('') +
      '</div>' +
      '<div style="font-size:12px;color:var(--hint);line-height:1.7">支持搜索板块名称、页面内容、你的待办、日记、记账、错题、单词、书摘、灵感、习惯、目标、电影等记录。</div>' +
      '</div>';
  }

  var searchKbIndex = -1;
  function doSearch(q) {
    var box = $('.cu-search-results', searchOverlay);
    searchKbIndex = -1;
    if (!q) { renderSearchSuggestions(box); return; }
    var idx = searchIndex();
    var qw = q.toLowerCase().split(/\s+/).filter(Boolean);
    var res = idx.filter(function (it) {
      var hay = (it.title + ' ' + it.text + ' ' + (it.extra || '')).toLowerCase();
      return qw.every(function (w) { return hay.indexOf(w) !== -1; });
    }).slice(0, 40);
    if (!res.length) {
      box.innerHTML = '<div class="cu-search-empty" style="text-align:left">' +
        '<p>未找到包含 “<b>' + escapeHtml(q) + '</b>” 的记录。</p>' +
        '<p style="font-size:12px;color:var(--hint);margin-top:8px">试试：输入板块名称（如“理财”）、功能关键词（如“番茄钟”）或已有记录中的文字。</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' +
        SEARCH_HOT.map(function (k) { return '<span class="cu-search-tag" onclick="QixiaUpgrade.doSearch(\'' + k + '\')">' + escapeHtml(k) + '</span>'; }).join('') +
        '</div></div>';
      return;
    }
    box.innerHTML = res.map(function (it, i) {
      return '<div class="cu-search-item" data-idx="' + i + '" onclick="switchView(\'' + it.view + '\');QixiaUpgrade.closeSearch();">' +
        '<div><b>' + escapeHtml(it.title) + '</b><br><small>' + escapeHtml(it.type) + (it.extra ? ' · ' + escapeHtml(it.extra) : '') + '</small></div></div>';
    }).join('');
  }

  function searchMove(dir) {
    var items = $$('.cu-search-item', searchOverlay);
    if (!items.length) return;
    searchKbIndex = Math.max(-1, Math.min(searchKbIndex + dir, items.length - 1));
    items.forEach(function (el, i) { el.classList.toggle('active', i === searchKbIndex); });
    var active = items[searchKbIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  NS.doSearch = doSearch;

  /* ============================================================
     8. 模块开关（用户可隐藏不需要的板块）
     ============================================================ */
  var MODULES = [
    { id: 'home', name: '今日概览' },
    { id: 'quadrant', name: '轻重缓急' }, { id: 'plans', name: '行进罗盘' }, { id: 'goals', name: '目标拆解' }, { id: 'habits', name: '习惯养成' }, { id: 'life', name: '生涯蓝图' },
    { id: 'study', name: '学业精进' }, { id: 'exam', name: '考试规划' }, { id: 'contest', name: '竞赛科研' }, { id: 'paper', name: '论文写作' }, { id: 'tpl', name: '专项模板' }, { id: 'campus', name: '校园生活' },
    { id: 'career', name: '职业发展' }, { id: 'growth', name: '个人提升' },
    { id: 'journal', name: '时光札记' }, { id: 'stats', name: '成长档案' },
    { id: 'health', name: '运动健康' }, { id: 'mind', name: '心灵成长' }, { id: 'safety', name: '平安护航' },
    { id: 'creative', name: '灵感看板' }, { id: 'shelf', name: '书海拾贝' }, { id: 'podcast', name: '耳畔星河' }, { id: 'movie', name: '幕间观澜' }, { id: 'fun', name: '轻松一下' },
    { id: 'finance', name: '理财管理' }, { id: 'save', name: '省钱技巧' }, { id: 'earn', name: '搞钱副业' }, { id: 'shop', name: '购物指南' }, { id: 'perk', name: '助学帮扶' },
    { id: 'timer', name: '心流计时' }, { id: 'tools', name: '高效方法' }, { id: 'ai', name: '智造工坊' }, { id: 'party', name: '入团入党' }, { id: 'college', name: '大学须知' }
  ];

  function applyModuleVisibility() {
    var cfg = getConfig();
    var hidden = cfg.hiddenModules || [];
    $$('.nav-item[data-view]').forEach(function (n) {
      var v = n.getAttribute('data-view');
      n.classList.toggle('cu-hidden-module', hidden.indexOf(v) !== -1);
    });
    $$('.bottom-nav-item[data-view]').forEach(function (n) {
      var v = n.getAttribute('data-view');
      n.classList.toggle('cu-hidden-module', hidden.indexOf(v) !== -1);
    });
  }

  function toggleModule(id) {
    var cfg = getConfig();
    var hidden = cfg.hiddenModules || [];
    var i = hidden.indexOf(id);
    if (i === -1) hidden.push(id); else hidden.splice(i, 1);
    cfg.hiddenModules = hidden;
    setConfig(cfg);
    applyModuleVisibility();
    var mod = MODULES.find(function (m) { return m.id === id; });
    var name = mod ? mod.name : id;
    toast(id === 'home' ? '首页不可隐藏' : (i === -1 ? '已隐藏「' + name + '」' : '已显示「' + name + '」'));
  }

  function renderModuleToggles() {
    var host = $('#cu-module-toggles');
    if (!host) return;
    host.innerHTML = MODULES.map(function (m) {
      var cfg = getConfig();
      var hidden = (cfg.hiddenModules || []).indexOf(m.id) !== -1;
      var disabled = m.id === 'home' || m.id === 'settings' || m.id === 'help';
      return '<div class="cu-module-toggle">' +
        '<span>' + escapeHtml(m.name) + '</span>' +
        '<div class="cu-switch' + (hidden ? '' : ' on') + (disabled ? ' disabled' : '') + '" data-id="' + m.id + '"></div>' +
        '</div>';
    }).join('');
    $$('.cu-switch', host).forEach(function (sw) {
      if (sw.classList.contains('disabled')) return;
      sw.addEventListener('click', function () { toggleModule(sw.getAttribute('data-id')); renderModuleToggles(); });
    });
  }

  /* ============================================================
     9. 设置页扩展（模块开关、存储预警、单模块重置）
     ============================================================ */
  function renderSettingsExtras() {
    var view = $('#view-settings');
    if (!view) return;
    var card = $('#cu-settings-extras', view);
    if (!card) {
      card = el('div', 'card');
      card.id = 'cu-settings-extras';
      card.style.marginTop = '16px';
      view.appendChild(card);
    }
    var size = storeSize();
    var warn = size > 4 * 1024 * 1024 ? '<span style="color:var(--danger);font-weight:600">存储已接近浏览器上限，请尽快导出备份。</span>' : '';
    card.innerHTML = '<h3>升级功能</h3>' +
      '<div style="margin:12px 0">' +
      '<b>存储占用：</b>' + fmtBytes(size) + ' ' + warn +
      '<p style="font-size:12px;color:var(--hint);margin-top:4px">数据全部保存在浏览器本地，清理缓存或卸载应用会导致数据丢失，请定期导出备份。</p>' +
      '</div>' +
      '<h4 style="margin-top:16px">模块显示开关</h4>' +
      '<div id="cu-module-toggles"></div>' +
      '<h4 style="margin-top:16px">危险操作</h4>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-danger btn-sm" onclick="QixiaUpgrade.resetModuleDialog()">单模块重置数据</button>' +
      '<button class="btn btn-danger btn-sm" onclick="QixiaUpgrade.clearAllData()">清空全部本地数据</button>' +
      '</div>';
    renderModuleToggles();
  }

  var RESETTABLE = [
    { key: 'pp_tasks', name: '待办清单' }, { key: 'pp_checkins', name: '打卡记录' }, { key: 'pp_checkinDefs', name: '打卡项定义' },
    { key: 'pp_habits', name: '习惯' }, { key: 'pp_journals', name: '时光札记' }, { key: 'pp_expenses', name: '记账' },
    { key: 'pp_words', name: '单词本' }, { key: 'pp_wrongs', name: '错题本' }, { key: 'pp_books', name: '书架' },
    { key: 'pp_movies', name: '影单' }, { key: 'pp_inspire', name: '灵感' }, { key: 'pp_goalChecks', name: '目标' }
  ];
  function resetModuleDialog() {
    var html = RESETTABLE.map(function (r) {
      return '<button class="btn btn-sm" style="margin:4px" onclick="QixiaUpgrade.resetModule(\'' + r.key + '\')">' + escapeHtml(r.name) + '</button>';
    }).join('');
    uiAlert('选择要重置数据的模块（不可恢复）：\n\n' + html);
  }
  function resetModule(key) {
    var name = (RESETTABLE.find(function (r) { return r.key === key; }) || {}).name || key;
    confirmDanger('重置确认', '确定清空「' + name + '」的全部数据吗？此操作不可恢复。', function () {
      localStorage.removeItem(key);
      toast('已重置「' + name + '」');
      if (typeof window.renderAll === 'function') renderAll();
    });
  }
  function clearAllData() {
    confirmDanger('清空全部数据', '确定删除浏览器中保存的所有栖匣数据吗？请确保已导出备份。', function () {
      localStorage.clear();
      toast('全部数据已清空');
      setTimeout(function () { location.reload(); }, 800);
    });
  }
  NS.resetModuleDialog = resetModuleDialog;
  NS.resetModule = resetModule;
  NS.clearAllData = clearAllData;

  /* ============================================================
     10. 数据导入导出加固 + 隐私函数加固（会被后续脚本再次覆盖，
        因此封装为 applyLatePatches，在 boot 和 800ms 后各执行一次）
     ============================================================ */
  function applyLatePatches() {

    // 导入值结构白名单校验：拒绝把缓存值改成会令渲染崩溃的形态（如 pp_tasks 变成对象）。
    function _safeImportValue(k, v) {
      var LIST = ['pp_tasks', 'pp_words', 'pp_wrongs', 'pp_books', 'pp_pods', 'pp_decisions', 'pp_grateful', 'pp_inspire', 'pp_vision', 'pp_goals', 'pp_checkinDefs', 'pp_userBooks', 'pp_feedback', 'pp_feedback_local', 'pp_habits'];
      var MAP = ['pp_checkins', 'pp_journals', 'pp_mood', 'pp_bookNotes', 'pp_expenses', 'pp_bless', 'pp_prepare_done', 'pp_timeBlocks', 'pp_resume_tracks', 'pp_exam_countdowns', 'pp_countdowns', 'pp_wd', 'pp_vision'];
      if (v === null || v === undefined) return { del: true };
      if (LIST.indexOf(k) >= 0) { if (!Array.isArray(v)) return { skip: true }; return { v: JSON.stringify(v) }; }
      if (MAP.indexOf(k) >= 0) { if (!v || typeof v !== 'object' || Array.isArray(v)) return { skip: true }; return { v: JSON.stringify(v) }; }
      var t = typeof v;
      if (t === 'string') return { v: v };
      if (t === 'number' || t === 'boolean') return { v: String(v) };
      if (t === 'object') { if (Array.isArray(v) || v.constructor === Object) return { v: JSON.stringify(v) }; return { skip: true }; }
      return { skip: true };
    }
    if (typeof window.exportData === 'function') {
      window.exportData = function () {
        var payload = { app: '栖匣', version: DATA_VERSION, exportDate: new Date().toISOString(), source: 'centrove', data: {} };
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k === STORE_KEY) continue;
          payload.data[k] = localStorage.getItem(k);
        }
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '栖匣-完整备份-' + todayKey() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast('完整备份已下载（包含 ' + Object.keys(payload.data).length + ' 项数据）');
        if (typeof window.uiAlert === 'function') uiAlert('✅ 已导出完整备份\n\n请妥善保存此 JSON 文件。换设备或清缓存后，可通过「导入数据」恢复。');
      };
    }
    if (typeof window.importData === 'function') {
      window.importData = function (e) {
        var f = e.target.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var d = JSON.parse(r.result);
            if (!d || typeof d !== 'object') throw new Error('格式错误');
            var data = d.data || d;
            if (!data || typeof data !== 'object') throw new Error('缺少 data 字段');
            var allowed = /^pp_|^qx_|^sportLog$|^myCountdowns$|^userMetrics$|^essayHistory$|^birthday$|^autoSaveEditable$/;
            var keys = Object.keys(data).filter(function (k) { return allowed.test(k); });
            if (!keys.length) throw new Error('未找到可识别的栖匣数据键');
            confirmDanger('导入确认', '将覆盖 ' + keys.length + ' 项本地数据。建议先导出当前备份。是否继续？', function () {
              keys.forEach(function (k) {
                var r = _safeImportValue(k, data[k]);
                if (r.skip) return;
                try {
                  if (r.del) localStorage.removeItem(k);
                  else localStorage.setItem(k, r.v);
                } catch (err) { console.warn('导入项失败', k, err); }
              });
              toast('数据导入成功');
              if (typeof window.renderAll === 'function') renderAll();
              setTimeout(function () { location.reload(); }, 600);
            });
          } catch (err) {
            toast('导入失败：' + err.message, 'danger');
            if (typeof window.uiAlert === 'function') uiAlert('⚠️ 导入失败\n\n' + err.message + '\n请确认是由本应用「导出数据备份」生成的 JSON 文件。');
          }
        };
        r.readAsText(f);
      };
    }
    if (typeof window.exportAll === 'function') {
      window.exportAll = window.exportData;
    }
    if (typeof window.importAll === 'function') {
      window.importAll = function (e) {
        var f = e.target.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var raw = JSON.parse(r.result);
            if (!raw || typeof raw !== 'object') throw new Error('格式错误');
            var data = raw.data || raw;
            var allowed = /^pp_|^qx_|^sportLog$|^myCountdowns$|^userMetrics$|^essayHistory$|^birthday$|^autoSaveEditable$/;
            var keys = Object.keys(data).filter(function (k) { return allowed.test(k); });
            if (!keys.length) throw new Error('未找到可识别的栖匣数据键');
            confirmDanger('导入确认', '将覆盖 ' + keys.length + ' 项本地数据。建议先导出当前备份。是否继续？', function () {
              keys.forEach(function (k) {
                var r = _safeImportValue(k, data[k]);
                if (r.skip) return;
                try {
                  if (r.del) localStorage.removeItem(k);
                  else localStorage.setItem(k, r.v);
                } catch (err) { console.warn('导入项失败', k, err); }
              });
              toast('数据导入成功');
              if (typeof window.renderAll === 'function') renderAll();
              setTimeout(function () { location.reload(); }, 600);
            });
          } catch (err) {
            toast('导入失败：' + err.message, 'danger');
            if (typeof window.uiAlert === 'function') uiAlert('⚠️ 导入失败\n\n' + err.message);
          }
        };
        r.readAsText(f);
      };
    }
    if (typeof window.clearAll === 'function') {
      var oldClearAll = window.clearAll;
      window.clearAll = function () {
        confirmDanger('清空全部数据', '确定删除浏览器中保存的所有栖匣数据吗？请确保已导出备份。', function () {
          oldClearAll();
        });
      };
    }
    // 隐私反馈函数
    if (typeof window.sendFeedback === 'function') {
      window.sendFeedback = function () {
        var txt = $('#fbText'), contact = $('#fbContact');
        var t = txt ? txt.value.trim() : '', c = contact ? contact.value.trim() : '';
        if (!t) { toast('请先写下你的反馈内容'); return; }
        var list = safeJsonParse(localStorage.getItem('pp_feedback_local'), []);
        list.unshift({ text: t, contact: c, time: new Date().toISOString() });
        localStorage.setItem('pp_feedback_local', JSON.stringify(list.slice(0, 50)));
        if (txt) txt.value = '';
        toast('反馈已保存到本地，感谢你的建议');
      };
    }
    if (typeof window.copyFeedback === 'function') {
      window.copyFeedback = function () {
        var txt = $('#fbText');
        if (!txt || !txt.value.trim()) { toast('没有可复制的内容'); return; }
        navigator.clipboard.writeText(txt.value.trim()).then(function () { toast('反馈内容已复制'); }, function () { toast('复制失败'); });
      };
    }
    if (typeof window.showMyFeedback === 'function') {
      window.showMyFeedback = function () {
        var list = safeJsonParse(localStorage.getItem('pp_feedback_local'), []);
        if (!list.length) { uiAlert('暂无本地反馈记录'); return; }
        var html = list.map(function (f) { return '<div style="border-bottom:1px solid var(--border);padding:8px 0"><div style="font-size:12px;color:var(--hint)">' + (f.time || '').slice(0, 10) + '</div><div>' + escapeHtml(f.text || '') + '</div></div>'; }).join('');
        uiAlert('我的反馈记录（本地）\n\n' + html);
      };
    }
  }
  applyLatePatches();
  setTimeout(applyLatePatches, 800);

  /* ============================================================
     11. WebDAV 密码输入框保护
     ============================================================ */
  (function () {
    var pass = localStorage.getItem('pp_wd_pass');
    if (pass) {
      console.log('检测到本地存有 WebDAV 密码，升级后不再默认保存密码。');
    }
    var wdPass = $('#wdPass');
    if (wdPass) wdPass.setAttribute('type', 'password');
  })();

  /* ============================================================
     12. 首页轻量化与数据安全提示
     ============================================================ */
  function enhanceHome() {
    var view = $('#view-home'); if (!view) return;
    // 首页只做强化的渲染触发，不再插入新提示/不再折叠原有内容
    // 创作者的话、今日心语、今日知识保持原样完整展示
  }

  /* ============================================================
     13. 仪表盘与图表
     ============================================================ */
  function renderDashboard() {
    var view = $('#view-stats'); if (!view) return;
    var host = $('#cu-dashboard', view);
    if (!host) {
      host = el('div', 'card');
      host.id = 'cu-dashboard';
      host.style.marginBottom = '16px';
      view.insertBefore(host, view.firstElementChild || view.firstChild);
    }
    var checkins = safeJsonParse(localStorage.getItem('pp_checkins'), {});
    var defs = safeJsonParse(localStorage.getItem('pp_checkinDefs'), []);
    var n = defs.length || 1;
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = fmtDate(d);
      var done = 0, obj = checkins[k] || {};
      for (var j = 0; j < defs.length; j++) if (obj[defs[j].id]) done++;
      days.push({ label: k.slice(5), pct: Math.round(done / n * 100), done: done, total: n });
    }
    var habits = safeJsonParse(localStorage.getItem('pp_habits'), []);
    var habitStreak = habits.map(function (h) { return (h.name || '').replace(/^\s*\S+\s*/, '') + ' · ' + (h.streak || 0) + '天'; }).join('　');

    var bars = days.map(function (d) {
      return '<div style="flex:1;text-align:center"><div class="cu-bar-item" style="height:' + Math.max(4, d.pct) + '%"></div><div class="cu-bar-label">' + d.label + '<br>' + d.done + '/' + d.total + '</div></div>';
    }).join('');

    host.innerHTML = '<h3>本周打卡趋势</h3>' +
      '<div class="cu-bar" style="height:140px">' + bars + '</div>' +
      '<p style="font-size:12px;color:var(--hint);margin-top:8px">习惯连续：' + (habitStreak || '暂无习惯数据') + '</p>';
  }

  function renderExpenseChart() {
    var view = $('#view-finance'); if (!view) return;
    var host = $('#cu-expense-chart', view);
    if (!host) {
      host = el('div', 'card');
      host.id = 'cu-expense-chart';
      host.style.marginBottom = '16px';
      view.insertBefore(host, view.firstElementChild || view.firstChild);
    }
    var exp = safeJsonParse(localStorage.getItem('pp_expenses'), []);
    var cat = {};
    exp.forEach(function (x) { var c = x.category || '未分类'; cat[c] = (cat[c] || 0) + (Number(x.amount) || 0); });
    var total = Object.values(cat).reduce(function (a, b) { return a + b; }, 0);
    if (!total) { host.innerHTML = '<h3>支出分类</h3><p style="color:var(--hint)">暂无记账数据</p>'; return; }
    var colors = ['#6E4F37', '#C9A45E', '#8A6D48', '#B07F63', '#7D6B51', '#8A6D48', '#A87B5D'];
    var offset = 0, legend = '';
    var slices = Object.keys(cat).map(function (c, i) {
      var v = cat[c], pct = v / total;
      var start = offset, end = offset + pct * 360;
      offset = end;
      var col = colors[i % colors.length];
      legend += '<span><i style="background:' + col + '"></i>' + escapeHtml(c) + ' ' + (pct * 100).toFixed(1) + '%</span>';
      return col + ' ' + start + 'deg ' + end + 'deg';
    }).join(',');
    host.innerHTML = '<h3>支出分类占比（共 ¥' + total.toFixed(2) + '）</h3>' +
      '<div class="cu-pie" style="background:conic-gradient(' + slices + ')"></div>' +
      '<div class="cu-legend">' + legend + '</div>';
  }

  /* ============================================================
     14. 时光札记模板
     ============================================================ */
  function enhanceJournal() {
    var view = $('#view-journal'); if (!view) return;
    var host = $('#cu-journal-templates', view);
    if (!host) {
      host = el('div', 'card');
      host.id = 'cu-journal-templates';
      host.style.marginBottom = '16px';
      host.innerHTML = '<h3>📋 没想好写什么？点模板快速起个头 <span style="font-weight:400;color:var(--hint);font-size:12px">填入后按自己的实际情况改写</span></h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn btn-sm" onclick="QixiaUpgrade.applyJournalTpl(\'daily\')">今日三件小事</button>' +
        '<button class="btn btn-sm" onclick="QixiaUpgrade.applyJournalTpl(\'week\')">周复盘</button>' +
        '<button class="btn btn-sm" onclick="QixiaUpgrade.applyJournalTpl(\'month\')">月复盘</button>' +
        '</div>';
      view.insertBefore(host, view.firstChild);
    }
  }
  var JOURNAL_TEMPLATES = {
    daily: { fn: 'jTomorrow', text: '明天想做好的 3 件事：\n1. ＿＿＿＿＿＿＿＿\n2. ＿＿＿＿＿＿＿＿\n3. ＿＿＿＿＿＿＿＿' },
    week: { fn: 'jFree', text: '【本周回顾】\n· 这周最想记住的一件事：＿＿＿＿＿＿\n· 我做得不错的一点：＿＿＿＿＿＿\n· 下周最想推进的一个小目标：＿＿＿＿＿＿' },
    month: { fn: 'jFree', text: '【本月复盘】\n· 本月完成得最满意的部分：＿＿＿＿＿＿\n· 本月最大的卡点：＿＿＿＿＿＿\n· 下个月的一个核心目标：＿＿＿＿＿＿' }
  };
  function applyJournalTpl(name) {
    var t = JOURNAL_TEMPLATES[name]; if (!t) return;
    var root = $('#view-journal');
    var ta = root ? root.querySelector('#' + t.fn) : null;
    if (!ta) ta = $('#journalBody') || $('#view-journal textarea');
    if (ta) {
      var sep = ta.value && ta.value.trim() ? (ta.value.trim().slice(-1) === '\n' ? '\n' : '\n\n') : '';
      ta.value = ta.value + sep + t.text;
      ta.focus();
      toast('模板已填入，请改成你自己的内容');
    }
  }
  NS.applyJournalTpl = applyJournalTpl;

  /* ============================================================
     15. 帮助中心
     ============================================================ */
  function renderHelpCenter() {
    var view = $('#view-help'); if (!view) return;
    // 帮助中心完整内容已内置于 index.html 的 <section id="view-help"> 静态区块，
    // 此处不再用脚本覆盖重建（旧的 3 步"三分钟上手"已移除），直接保留静态视图。
    return;
    if (view.dataset.rendered) return;
    view.dataset.rendered = '1';
    var h = '<div class="page-head"><h1>帮助中心</h1><p>从上手到进阶，常见问题与使用指南</p></div>' +
      '<div class="card" style="margin-bottom:14px">' +
      '<h3>三分钟上手</h3>' +
      '<ol style="line-height:1.9;color:var(--muted)">' +
      '<li><b>打开即开始：</b>无需注册登录，点击左侧或底部导航切换板块即可使用。</li>' +
      '<li><b>记录一件事：</b>在「今日概览」添加待办、倒数日；在「习惯养成」创建打卡；在「记账」记录收支。</li>' +
      '<li><b>备份数据：</b>点击顶部「更多工具 → 导出数据备份」，把 JSON 文件保存到手机或云盘，数据就不会随浏览器缓存丢失。</li>' +
      '</ol></div>' +
      '<div class="card help-grid">' +
      '<details><summary>数据存在哪里？会不会丢？</summary><p>所有数据都保存在当前浏览器的 localStorage 中，不会自动上传到服务器。这意味着：清理缓存、卸载浏览器、重置手机、使用无痕模式，都会导致数据丢失。<br><b>定期导出 JSON 备份是唯一可靠的保护方式。</b></p></details>' +
      '<details><summary>如何备份与恢复？</summary><p>① 打开「系统设置」。② 点击「导出数据备份」，保存 .json 文件到手机文件管理或云盘。③ 需要恢复时，在同一页面点击「导入数据」并选择该文件即可。<br>备份文件包含你录入的全部内容：待办、习惯、日记、记账、错题、单词、书摘、灵感等。</p></details>' +
      '<details><summary>怎么把栖匣放到手机桌面？</summary><p>在 Safari / Chrome / Edge 中打开栖匣，点击浏览器菜单里的「分享」→「添加到主屏幕」。添加后就像普通 App 一样从桌面打开，首次加载后支持离线使用。<br>安卓/鸿蒙手机若提示「安装应用」，直接安装即可；iPhone 添加到主屏幕后无需下载额外 App。</p></details>' +
      '<details><summary>顶部搜索怎么用？</summary><p>点击顶栏 🔍 搜索图标，输入关键词即可查找。支持搜索：板块名称（如「理财」「备考」）、页面标题、你的待办、日记、记账、错题、单词、书摘、灵感、习惯、目标、电影等。<br>如果没有输入内容，会显示常用关键词，点击即可快速跳转。</p></details>' +
      '<details><summary>为什么有些板块找不到了？</summary><p>在「系统设置 → 升级功能 → 模块显示开关」里，你可以按需要隐藏不常用的板块，让导航更简洁。<br><b>隐藏不会删除数据</b>，重新打开开关即可恢复显示。</p></details>' +
      '<details><summary>待办、习惯、倒数日怎么用？</summary><p><b>待办：</b>在「今日概览」输入任务回车即可，支持打勾完成、拖拽排序。<br><b>习惯：</b>进入「习惯养成」新建习惯，每天点击圆圈打卡，会自动生成月度热力图。<br><b>倒数日：</b>在「今日概览」添加事件名称和目标日期，首页会自动显示剩余天数。</p></details>' +
      '<details><summary>学业/GPA/备考功能怎么用？</summary><p><b>课程与绩点：</b>在「学业精进」输入课程成绩和学分，即可计算 GPA；结果仅供参考，最终以学校教务系统为准。<br><b>备考：</b>「考试规划」内置四六级、考研、教资等考试的时间参考框架，请以当年官方公告为准。<br><b>错题与单词：</b>「学业精进」支持录入错题和背单词，可配合复习计划使用。</p></details>' +
      '<details><summary>理财与记账怎么用？</summary><p>进入「理财管理」添加每笔支出/收入，选择分类并填写金额。页面会自动汇总本周、本月消费，并以饼图展示占比。<br>理财、兼职、省钱技巧等内容仅供个人参考，不构成投资或专业财务建议。</p></details>' +
      '<details><summary>日记、书摘、灵感怎么用？</summary><p><b>时光札记：</b>按日期写日记、周记、月复盘，支持插入模板快速开始。<br><b>书海拾贝：</b>记录书名、书摘和读后感，建立自己的阅读库。<br><b>灵感看板：</b>随时收藏突然冒出的想法、句子、链接，避免灵感流失。</p></details>' +
      '<details><summary>番茄钟/专注计时怎么用？</summary><p>进入「心流计时」选择 25 分钟番茄钟或其他时长，点击开始后保持页面在前台即可。完成一个番茄后会自动记录到当天的专注统计里。<br>部分浏览器在切换标签页后会限制后台计时，建议专注时保持页面可见。</p></details>' +
      '<details><summary>深色/浅色模式怎么切换？</summary><p>点击顶栏的月亮/太阳图标即可切换主题，偏好会自动保存在本地。所有卡片、按钮、图表都适配了两套配色，夜间使用更护眼。</p></details>' +
      '<details><summary>离线后还能用吗？</summary><p>可以。首次打开后，Service Worker 会把网站资源缓存到本地。之后即使断网，只要不清理浏览器缓存，仍可正常打开和使用。<br>注意：首次加载、后续更新版本、以及主动「清除网站数据」后需要重新联网。</p></details>' +
      '<details><summary>更新版本后内容会变吗？</summary><p>网站功能和内置文案会随版本更新，但你的个人数据（待办、日记、记账等）保存在浏览器本地，不会因为我们发布新版而丢失。<br>如果你发现打开的是旧版，请下拉刷新或「退出浏览器重新进入」。</p></details>' +
      '<details><summary>隐私与数据安全</summary><p>栖匣不注册、不登录、默认不上传任何个人信息。反馈内容仅保存在本地；WebDAV 云备份需要手动配置，密码不会被明文保存在本地。<br>心理测评、理财兼职、备考信息等内容仅供成长参考，不构成专业建议。</p></details>' +
      '<details><summary>遇到 Bug 或想提建议？</summary><p>可以通过「系统设置 → 帮助与反馈」提交，反馈会保存在本地，你可以在「我的反馈」中查看历史记录。<br>如需联系创作者，请通过你获得栖匣的渠道留言。</p></details>' +
      '<details><summary>常见问题快速排查</summary><p><b>打开空白：</b>检查网络后刷新；若用微信打开，请换 Safari/Chrome。<br><b>数据不见了：</b>是否清过缓存？是否换了浏览器？可尝试导入之前的 JSON 备份。<br><b>某些按钮点不动：</b>尝试退出重进或关闭省电模式。<br><b>首页显示旧版：</b>下拉刷新或清除浏览器缓存。</p></details>' +
      '</div>';
    view.innerHTML = h;
  }

  /* 更新「关于」页隐私表述，与升级后的实际行为一致 */
  function patchPrivacyText() {
    var view = $('#view-about');
    if (!view || view.dataset.patched) return;
    view.dataset.patched = '1';
    view.innerHTML = view.innerHTML
      .replace(/数据全在本机/g, '数据默认全在本机')
      .replace(/不上传服务器/g, '默认不上传服务器')
      .replace(/不上传任何个人信息/g, '默认不上传任何个人信息');
  }

  /* ============================================================
     16. 硬编码日期与免责声明处理
     ============================================================ */
  function addDateDisclaimer(viewId) {
    var view = $('#view-' + viewId); if (!view) return;
    if (view.dataset.disclaimer) return;
    view.dataset.disclaimer = '1';
    var note = el('div', 'callout callout-warn');
    note.style.marginBottom = '14px';
    note.innerHTML = '<b>时间提示：</b>考试日期、赛事安排、政策标准、就业行情等可能随年度调整，请以当年学校及国家官方公告为准。本页面仅提供通用参考框架。';
    view.insertBefore(note, view.firstElementChild || view.firstChild);
  }

  // 覆盖考试官方日期表：使用当前年份动态生成，并加免责声明
  if (typeof window.EXAM_OFFICIAL_2026 === 'object') {
    var y = new Date().getFullYear();
    // 简单相对规则：保持原 2026 各考试日期，年份平移到当前年（仅示例；实际官方日期请以公告为准）
    var orig = window.EXAM_OFFICIAL_2026;
    var next = {};
    Object.keys(orig).forEach(function (k) {
      var d = orig[k];
      if (typeof d === 'string' && d.indexOf('2026') === 0) next[k] = d.replace(/^2026/, String(y));
      else next[k] = d;
    });
    window.EXAM_OFFICIAL_2026 = next;
  }

  /* WebDAV 隐私加固：密码不再持久化到 localStorage */
  function patchWebDAVPrivacy() {
    localStorage.removeItem('pp_wd_pass');
    var wdPass = $('#wdPass');
    if (wdPass) {
      wdPass.setAttribute('type', 'password');
      wdPass.value = '';
      wdPass.setAttribute('placeholder', '应用密码（不会保存在本地）');
    }
    if (typeof window.prefill === 'function') {
      var _origPrefill = window.prefill;
      window.prefill = function (id, key, def) {
        if (key === 'pp_wd_pass') { try { var el = document.getElementById(id); if (el) el.value = ''; } catch (e) { } return; }
        return _origPrefill(id, key, def);
      };
    }
  }

  /* 学业页 GPA 计算器专属免责声明 */
  function addGpaDisclaimer() {
    var view = $('#view-study');
    if (!view || view.dataset.gpaWarn) return;
    view.dataset.gpaWarn = '1';
    var gpaResult = $('#gpaResult');
    if (!gpaResult || !gpaResult.parentNode) return;
    var note = el('div', 'callout callout-info');
    note.style.marginTop = '12px';
    note.innerHTML = '<b>绩点提示：</b>本计算器结果仅供参考，最终成绩与绩点请以学校教务系统或官方通知为准。';
    gpaResult.parentNode.insertBefore(note, gpaResult.nextSibling);
  }

  /* ============================================================
     17. 外部链接统一与安全直达
     ============================================================ */
  function ensureExternalLinks() {
    $$('a[href^="http"]').forEach(function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }

  /* ============================================================
     18. 首次打开示例数据（只写一次，不覆盖已有数据）
     ============================================================ */
  function seedDemoData() {
    // 首次打开不再写入任何“示例数据”：避免把看似用户本人写的假内容当作真实记录（隐私混淆）。
    // 各板块自带占位提示和模板，留空即可，由用户自己填写真实内容。
    var flag = 'pp_demo_seeded_v20260829';
    try {
      if (localStorage.getItem(flag)) return;
      var appKeys = ['pp_tasks','pp_countdowns','pp_journals','pp_expenses','pp_wrongs','pp_words','pp_checkins','pp_movies','pp_books','pp_pods','pp_inspire','pp_goalChecks','pp_goal100','pp_habits'];
      var hasData = appKeys.some(function (k) { return !!localStorage.getItem(k); });
      if (hasData) { localStorage.setItem(flag, '1'); return; }
      // 仅打一个“已初始化”标记，不清空、也不注入任何假的个人记录
      localStorage.setItem(flag, '1');
    } catch (e) {}
  }

  /* ============================================================
     19. 初始化
     ============================================================ */

  /* ============================================================
     18-1. 清理旧版「教程式自夸示例」数据
     作用：旧版本首次打开时把“继续熟悉栖匣各板块”等自我宣传文案写进了本地存储，
           会让人误以为是用户自己写的内容、有暴露隐私的观感。
           这里在每次启动时自动把这些自动示例整条删除（绝不覆盖成假内容），
           各板块保留空的占位提示，由用户自己填真实内容。
     ============================================================ */
  function cleanLegacyDemoData() {
    function tainted(str) {
      return typeof str === 'string' && /栖匣|先安放|继续熟悉|首次体验|自己的待办|换一批/.test(str);
    }
    try {
      // 待办清单：清除自动注入的示例 / 教程式任务（demo_ 前缀或含自我宣传文案）
      try {
        var t = JSON.parse(localStorage.getItem('pp_tasks') || '[]');
        if (Array.isArray(t)) {
          var t2 = t.filter(function (it) {
            return !(it && ((it.id || '').indexOf('demo_') === 0 || tainted(it.text)));
          });
          if (t2.length !== t.length) localStorage.setItem('pp_tasks', JSON.stringify(t2));
        }
      } catch (e) {}
      // 时光札记：删除整条带自我宣传文案的自动示例（不覆盖成假内容，直接移除）
      try {
        var j = JSON.parse(localStorage.getItem('pp_journals') || '{}');
        var j2 = {};
        var removed = false;
        Object.keys(j).forEach(function (k) {
          var d = j[k];
          var isDemo = !d || typeof d !== 'object' || tainted(d.done) || tainted(d.learn) || tainted(d.improve) || tainted(d.tomorrow) || tainted(d.free);
          if (isDemo) { removed = true; return; }
          j2[k] = d;
        });
        if (removed) localStorage.setItem('pp_journals', JSON.stringify(j2));
      } catch (e) {}
      // 其他带「示例」标记的自动数据
      try {
        var cleanList = function (key, field) {
          var arr = JSON.parse(localStorage.getItem(key) || '[]');
          if (!Array.isArray(arr)) return;
          var f = arr.filter(function (it) { return !(it && typeof it[field] === 'string' && it[field].indexOf('示例') === 0); });
          if (f.length !== arr.length) localStorage.setItem(key, JSON.stringify(f));
        };
        cleanList('pp_expenses', 'name');
        cleanList('pp_wrongs', 'desc');
        cleanList('pp_movies', 'title');
      } catch (e) {}
    } catch (e) {}
  }

  function boot() {    // 首次打开不再注入任何示例数据：各板块留空，由用户填写真实内容
    seedDemoData();
    // 自动清理旧版注入的「教程式自夸示例」：删除而非改写，避免假内容被误认为用户隐私
    cleanLegacyDemoData();
    // 彻底移除旧版自动注入的卡片折叠按钮，避免遮挡内容（如今日心语的换一句按钮）
    try {
      Array.prototype.forEach.call(document.querySelectorAll('.qx-foldbtn'), function (b) { b.remove(); });
      Array.prototype.forEach.call(document.querySelectorAll('.qx-fold'), function (c) { c.classList.remove('qx-fold'); c.style.maxHeight = ''; });
    } catch (e) {}
    injectTopNav();
    // 防御性兜底：无论从任何缓存/旧文件残留了 .cu-topnav（旧版升级脚本注入的冗余顶部按钮），
    // 一律移除，确保顶栏只保留 index.html 内置的一套「搜索·帮助·夜间·更多」图标，杜绝重复。
    try {
      Array.prototype.forEach.call(document.querySelectorAll('.cu-topnav'), function (n) { n.remove(); });
    } catch (e) {}
    injectHelpNav();
    applyModuleVisibility();
    ensureExternalLinks();
    patchPrivacyText();
    patchWebDAVPrivacy();
    // 添加帮助视图容器（如果不存在）
    if (!document.getElementById('view-help')) {
      var sec = el('section', 'view');
      sec.id = 'view-help';
      var main = $('.main');
      if (main) main.appendChild(sec);
    }
    // 初次进入当前视图
    onViewChanged(window._curView || 'home');
    // 监听 storage 变化（多标签同步）
    window.addEventListener('storage', function (e) {
      if (e.key === STORE_KEY) applyModuleVisibility();
    });
    // 注册键盘快捷键
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    });
    // 路由直达：支持 index.html#view-settings 这样形如 #view-xxx / #xxx 的链接，打开即直达对应板块
    // 主程序自身初始化也会恢复“上次浏览板块”，因此这里在 load 完成 + 延时后再执行一次，确保最终以 hash 为准。
    function routeHash() {
      try {
        var h = (location.hash || '').replace(/^#\/?/, '');
        if (h.indexOf('view-') === 0) h = h.slice(5);
        if (h && document.getElementById('view-' + h) && typeof switchView === 'function') switchView(h);
      } catch (e) {}
    }
    window.addEventListener('hashchange', routeHash);
    if (location.hash) {
      if (document.readyState !== 'complete') window.addEventListener('load', routeHash);
      setTimeout(routeHash, 300);
      setTimeout(routeHash, 900);
    }
    // 二次清理：旧脚本可能在加载完成后才注入折叠按钮，延迟再清一次
    setTimeout(function () {
      try {
        Array.prototype.forEach.call(document.querySelectorAll('.qx-foldbtn'), function (b) { b.remove(); });
        Array.prototype.forEach.call(document.querySelectorAll('.qx-fold'), function (c) { c.classList.remove('qx-fold'); c.style.maxHeight = ''; });
      } catch (e) {}
    }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  NS.renderDashboard = renderDashboard;
  NS.renderExpenseChart = renderExpenseChart;
  NS.renderSettingsExtras = renderSettingsExtras;

  /* ============================================================
     X. 安全与健壮性增强层（2026.08.31.2）
     - 本地存储可用性探测（无痕/隐私模式写失败时给出明确提示）
     - 存储容量预警（接近上限提醒导出备份）
     - 全局「保存受限」错误可视化，避免数据“以为存了”实为丢失
     - 首次输入后启用离开提醒，防误关丢失正在写的内容
     - 桌面端「/」快捷键直达全屏搜索（含 Ctrl/Cmd+K）
     ============================================================ */
  function probeStorage() {
    try { var t = 'qx_probe'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; }
    catch (e) { return false; }
  }
  function patchStorageSafety() {
    if (!probeStorage()) {
      try { setTimeout(function () { toast('当前为无痕/隐私模式，记录可能无法长期保存，请注意定期导出备份', 'warn'); }, 1500); } catch (e) {}
      return;
    }
    try {
      var used = 0, i;
      for (i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), v = localStorage.getItem(k);
        used += (String(k).length + (String(v || '').length)) * 2;
      }
      if (used > 4.5 * 1024 * 1024) {
        setTimeout(function () { toast('本地存储接近上限，请尽快用「更多 → 导出数据备份」保存重要数据', 'warn'); }, 1800);
      }
    } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    if (ev && ev.message && /quota|securityerror|abort|denied/i.test(ev.message)) {
      try { toast('保存受限：请检查浏览器隐私设置或存储空间，重要数据建议导出备份', 'warn'); } catch (e) {}
    }
  });
  function patchBeforeUnload() {
    var dirty = false;
    function mark() { dirty = true; }
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
    function hasRealData() {
      var keys = ['pp_tasks', 'pp_checkins', 'pp_journals', 'pp_expenses', 'pp_words', 'pp_wrongs', 'pp_books', 'pp_habits', 'pp_mood', 'pp_goals', 'pp_vision', 'pp_decisions', 'pp_grateful', 'pp_inspire', 'pp_pods', 'pp_bless'];
      for (var i = 0; i < keys.length; i++) {
        try { var v = localStorage.getItem(keys[i]); if (v && v.length > 2) return true; } catch (e) {}
      }
      return false;
    }
    window.addEventListener('beforeunload', function (e) {
      if (!dirty || !hasRealData()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
  function patchKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.isContentEditable));
      // 「/」快速打开搜索（非输入状态）
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (typeof openSearch === 'function') openSearch();
        else if (window.QixiaUpgrade && typeof window.QixiaUpgrade.openSearch === 'function') window.QixiaUpgrade.openSearch();
      }
      // Esc 关闭全屏搜索覆盖层
      if (e.key === 'Escape') {
        try { var ov = document.getElementById('qsOverlay') || document.querySelector('.qs-overlay'); if (ov) ov.style.display = 'none'; } catch (err) {}
      }
    });
  }
  function runSafetyLayer() {
    patchStorageSafety();
    patchBeforeUnload();
    patchKeyboardShortcuts();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runSafetyLayer);
  else runSafetyLayer();
})();
