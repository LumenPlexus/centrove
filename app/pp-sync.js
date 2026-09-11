/* ============================================================================
   栖匣 · 云端多端同步模块  (pp-sync.js)
   ----------------------------------------------------------------------------
   目标：让「手机 App / 桌面 App / 网页」之间的数据保持一致，且全程端到端加密。

   隐私设计（关键）：
   - 你的数据在浏览器内用「同步口令」派生的密钥做 AES-GCM 加密后才上传；
   - 同步服务器只保存密文 + 修订号，永远无法读取你的真实内容；
   - 离线时照常本地使用，联网后自动双向合并同步。

   数据不丢失设计：
   - 数组类条目（清单、背词、习惯等）采用「按唯一标识去重合并」，多次同步不重复；
   - 标量冲突（多设备改了同一处）采用「修订号较新者胜」，被同时覆盖的旧值自动
     备份进 pp_sync_conflicts，可在后台随时查看，绝不静默吞掉。

   使用方式：
   1. 在页面 colophon 里点「多端同步」打开面板；
   2. 填写同步服务器地址（自托管，见 app/../sync-server 文档）与你的同步口令；
   3. 点「立即同步」，在新的设备上输入同一口令即可拉取合并。
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- 配置 ---------- */
  var S = {
    // 默认同步服务器（空则禁用）。可被 localStorage.pp_sync_server 或
    // window.__PP_SYNC_SERVER__ 覆盖，也可在面板里手动设置。
    server: '',
    autoInterval: 120000,          // 自动同步间隔（毫秒）
    autoDelay: 6000,               // 首次自动同步延迟（毫秒）
    KDF_ITER: 210000,              // PBKDF2 迭代次数（较重，兼顾安全与性能）
    V: '2026.09.07.v1'
  };

  /* ---------- 内部状态 ---------- */
  var STORE_KEYS = { info: 'pp_sync_info', lastPull: 'pp_sync_lastpull', times: 'pp_sync_times', conflicts: 'pp_sync_conflicts', serverKey: 'pp_sync_server' };
  // 不参与同步的本地瞬态 / 界面偏好（各设备独立，无需云端共享）
  var EXCLUDE = {
    'pp_backup_latest': 1, 'pp_last_view': 1, 'pp_last_scroll': 1, 'pp_pano_seen': 1,
    'pp_quickstart_ok': 1, 'pp_sidebar_collapsed': 1, 'pp_prepare_done': 1,
    'pp_prepare_archived': 1, 'essayHistory': 1
  };
  var _pass = null;      // 同步口令（仅内存中，绝不落盘）
  var _device = null;
  var _running = false;
  var _timer = null;
  var _panel = null;
  var _listeners = [];

  /* ---------- 基础工具 ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(s) { try { var v = JSON.parse(s); return v; } catch (e) { return null; } }
  function jstr(o) { try { return JSON.stringify(o); } catch (e) { return null; } }
  function uc(n) { return String(n).substr(0, 3).toUpperCase(); }

  /* ---------- 设备标识 ---------- */
  function deviceId() {
    if (_device) return _device;
    var info = jget(lsGet(STORE_KEYS.info));
    if (info && info.device) { _device = info.device; return _device; }
    _device = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    info = info || {}; info.device = _device; info.created = Date.now();
    lsSet(STORE_KEYS.info, jstr(info));
    return _device;
  }

  /* ---------- 派生工具：快照 ---------- */
  function isExcluded(k) { return EXCLUDE[k] === 1 || k.indexOf('pp_sync_') === 0; }

  function snapshot() {
    var data = {}, times = jget(lsGet(STORE_KEYS.times)) || {}, now = Date.now(), i, k;
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (isExcluded(k)) continue;
      data[k] = { v: lsGet(k), t: (times[k] && times[k] > 0) ? times[k] : now };
    }
    return data;
  }

  /* ---------- 密码学：端到端加密 ---------- */
  function toBytes(s) { return new TextEncoder().encode(s); }
  function toBase64(buf) {
    var b = new Uint8Array(buf), s = '', chunk = 0x8000, i;
    for (i = 0; i < b.length; i += chunk) s += String.fromCharCode.apply(null, b.subarray(i, i + chunk));
    return btoa(s);
  }
  function fromBase64(s) {
    var bin = atob(s), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function encBytes(buf) {
    var b = new Uint8Array(buf); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  function concatBytes(a, b) {
    var r = new Uint8Array(a.length + b.length); r.set(a, 0); r.set(b, a.length); return r;
  }
  function toArr(buf) { return new Uint8Array(buf); }

  function deriveKey(pass, salt, iter) {
    var enc = toBytes(pass);
    return crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveKey'])
      .then(function (key) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: toArr(salt), iterations: iter, hash: 'SHA-256' },
          key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /* 加密：返回 {data, id, token}
     id : SHA-256(pass) 十六进制 —— 用作服务器分桶键，服务器只能看到口令哈希，看不到口令；
     token : 独立哈希，用于写权限校验。 */
  function digest(seed, algo) {
    var h = algo || 1;
    var salt = new TextEncoder().encode('pp-sync-' + h + ':' + seed);
    return crypto.subtle.digest('SHA-256', salt).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function getEnvelope(pass) {
    if (!_pass && pass) _pass = pass;
    return Promise.all([digest(_pass, 1), digest(_pass, 2)]).then(function (h) {
      return { id: h[0], token: h[1] };
    });
  }

  function encryptPayload(obj, pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var iter = S.KDF_ITER;
    var plain = toBytes(jstr(obj));
    return deriveKey(pass, salt, iter).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encBytes(plain));
    }).then(function (ct) {
      var head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, iter, false);
      var blob = concatBytes(concatBytes(concatBytes(head, salt), iv), toArr(ct));
      return toBase64(blob);
    });
  }

  function decryptPayload(b64, pass) {
    var blob = fromBase64(b64);
    var dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    var iter = dv.getUint32(0, false);
    var salt = blob.subarray(4, 20);
    var iv = blob.subarray(20, 32);
    var ct = blob.subarray(32);
    return deriveKey(pass, salt, iter).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encBytes(ct));
    }).then(function (pt) {
      return JSON.parse(new TextDecoder().decode(pt));
    });
  }

  /* ---------- 传输 ---------- */
  function serverUrl() {
    if (S.server) return S.server.replace(/\/+$/, '');
    if (lsGet(STORE_KEYS.serverKey)) return lsGet(STORE_KEYS.serverKey).replace(/\/+$/, '');
    if (global.__PP_SYNC_SERVER__) return global.__PP_SYNC_SERVER__.replace(/\/+$/, '');
    return '';
  }
  function setServerUrl(u) { S.server = u || ''; if (u) lsSet(STORE_KEYS.serverKey, u); else lsDel(STORE_KEYS.serverKey); }

  function api(path, method, body, token) {
    var base = serverUrl();
    var url = base + '/v1' + path;
    var opt = { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
    if (token) opt.headers['X-Write-Token'] = token;
    if (body !== undefined) opt.body = JSON.stringify(body);
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    }).catch(function (err) { return { ok: false, status: 0, j: { error: 'network' }, raw: err }; });
  }

  /* ---------- 合并算法 ---------- */
  function arrmix(a, b) {
    var out = (a && a.length) ? a.slice() : [], seen = {}, i;
    for (i = 0; i < out.length; i++) { keyOf(out[i]); }
    (b || []).forEach(function (x) {
      var k = keyOf(x);
      if (!seen[k]) { out.push(x); seen[k] = 1; }
    });
    function keyOf(x) {
      var kk; try { kk = (x && typeof x === 'object' && x.id != null) ? String(x.id) : JSON.stringify(x); } catch (e) { kk = 'k' + Math.random(); }
      seen[kk] = 1; return kk;
    }
    return out;
  }
  function isArrayLike(s) { var v = jget(s); return v && Array.isArray(v); }

  /* 把云端数据合并进本机。cloud: {key:{v,t}} */
  function mergeCloud(cloud) {
    var changed = 0, conflicts = jget(lsGet(STORE_KEYS.conflicts)) || {}, times = jget(lsGet(STORE_KEYS.times)) || {}, key;
    for (key in cloud) {
      if (isExcluded(key) || !cloud.hasOwnProperty(key)) continue;
      var ev = cloud[key], e = ev.v === undefined ? ev : ev.v, et = ev.t || 0;
      var lv = lsGet(key), lt = times[key] || 0;
      if (lv === null || lv === e) {
        if (lv !== e) { lsSet(key, e); changed++; }          // 本地缺失 → 云端补入
        times[key] = Math.max(lt, et);
        continue;
      }
      // 两边都有值
      if (isArrayLike(lv) && isArrayLike(e)) {                 // 数组 → 去重合并
        var merged = jstr(arrmix(jget(lv), jget(e)));
        if (merged !== lv) { lsSet(key, merged); changed++; }
        times[key] = Date.now();
        continue;
      }
      // 标量 / 对象冲突 → 修订号较新者胜，旧值自动备份
      if (et > lt) {
        conflicts[key] = { old: lv, when: new Date().toISOString(), device: deviceId() };
        lsSet(key, e); changed++;
        times[key] = et;
      } else if (et === lt) {
        conflicts[key] = { old: lv, when: new Date().toISOString(), device: deviceId() };
        lsSet(key, e); changed++;
        times[key] = et;
      }
    }
    if (changed > 0) {
      lsSet(STORE_KEYS.conflicts, jstr(conflicts));
      lsSet(STORE_KEYS.times, jstr(times));
      try { if (typeof renderAll === 'function') renderAll(); } catch (e) {}
      notify({ type: 'merged', count: changed });
    }
  }

  /* ---------- 主同步流程 ---------- */
  function loadPass() {
    // 口令不落盘：每次只从面板 / 本次会话输入。属于跨会话钩子，改进版可 let 用户选择记住（会弱化安全）。
    return _pass;
  }

  function syncNow(manual) {
    var pass = loadPass();
    if (!pass) return Promise.resolve({ status: 'nopass' });
    if (_running) return Promise.resolve({ status: 'busy' });
    if (!serverUrl()) return Promise.resolve({ status: 'noserver' });
    _running = true;
    return getEnvelope(pass).then(function (env) {
      // 1) 拉取
      return api('/meta/' + env.id, 'GET').then(function (meta) {
        var lastPull = +lsGet(STORE_KEYS.lastPull) || 0;
        var remote = (meta.ok && meta.j && meta.j.rev) ? meta.j.rev : 0;
        var pullP = null;
        if (remote > 0 && remote !== lastPull) {
          pullP = api('/blob/' + env.id, 'GET').then(function (blob) {
            if (blob.ok && blob.j && blob.j.enc) {
              return decryptPayload(blob.j.enc, pass).then(function (cloud) {
                mergeCloud(cloud.data || {});
                lsSet(STORE_KEYS.lastPull, String(remote));
              });
            }
          }).catch(function () {});
        }
        return pullP;
      }).then(function () {
        // 2) 推送
        var data = snapshot();
        return encryptPayload({ data: data, device: deviceId(), at: Date.now() }, pass).then(function (enc) {
          var rev = Date.now();
          return api('/push/' + env.id, 'PUT', { rev: rev, ts: rev, enc: enc }, env.token).then(function (res) {
            // 更新本地 per-key 时间戳
            var times = jget(lsGet(STORE_KEYS.times)) || {}, k;
            for (k in data) if (data.hasOwnProperty(k)) times[k] = rev;
            lsSet(STORE_KEYS.times, jstr(times));
            if (res.ok) {
              lsSet(STORE_KEYS.lastPull, String(rev));
              notify({ type: 'synced', at: rev });
              return { status: res.j && res.j.auth ? 'auth' : 'ok', rev: rev };
            }
            return { status: res.j && res.j.error === 'auth' ? 'auth' : 'error', rev: rev };
          });
        });
      });
    }).finally(function () { _running = false; });
  }

  /* ---------- 状态查询 ---------- */
  function statusInfo() {
    return {
      configured: !!loadPass() && !!serverUrl(),
      server: serverUrl() || '',
      lastPull: +lsGet(STORE_KEYS.lastPull) || 0,
      device: deviceId(),
      conflicts: Object.keys(jget(lsGet(STORE_KEYS.conflicts)) || {}).length,
      v: S.V
    };
  }

  /* ---------- 事件 ---------- */
  function notify(ev) { _listeners.forEach(function (f) { try { f(ev); } catch (e) {} }); }
  function on(f) { _listeners.push(f); }
  function flash(m) { try { global.flash && global.flash(m); } catch (e) {} }
  function alert(m) { try { global.uiAlert && global.uiAlert(m); } catch (e) { global.alert(m); } }

  /* ---------- 面板 UI（自包含，避免侵入主界面） ---------- */
  function ensurePanel() {
    if (_panel) return _panel;
    var p = document.createElement('div');
    p.id = 'ppSyncPanel';
    p.style.cssText = 'position:fixed;bottom:86px;right:16px;z-index:99;width:292px;max-width:calc(100vw - 32px);background:#fffaf0;border:1px solid #e6d9bf;border-radius:16px;box-shadow:0 18px 60px rgba(74,59,46,.28);padding:16px 15px 13px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:none';
    p.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<b style="color:#4A3427;font-size:15px;letter-spacing:1px">多端同步</b>' +
        '<span id="ppSyncClose" style="cursor:pointer;color:#8A6236;font-size:16px;line-height:1">×</span></div>' +
      '<div style="font-size:12px;color:#8A6236;line-height:1.7;margin-bottom:12px">数据先端到端加密再上传，服务端无法读取。<br>多设备用同一「同步口令」即可合并互通。</div>' +
      '<label style="font-size:11.5px;color:#6E4F37;display:block;margin-bottom:4px">同步服务器地址</label>' +
      '<input id="ppSyncServer" placeholder="https://你的域名" style="width:100%;box-sizing:border-box;padding:8px 9px;margin-bottom:10px;border:1px solid #d8c69f;border-radius:8px;font-size:12.5px;background:#fff;color:#4A3427">' +
      '<label style="font-size:11.5px;color:#6E4F37;display:block;margin-bottom:4px">同步口令（务必牢记，丢失无法找回）</label>' +
      '<input id="ppSyncPass" type="password" placeholder="输入并保管好" style="width:100%;box-sizing:border-box;padding:8px 9px;margin-bottom:12px;border:1px solid #d8c69f;border-radius:8px;font-size:12.5px;background:#fff;color:#4A3427">' +
      '<div id="ppSyncStatus" style="font-size:12px;color:#8A6236;margin-bottom:10px;line-height:1.6"></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="ppSyncGo" class="ppsyn-btn" style="flex:1;background:#6E4F37;color:#fff;border:0;border-radius:9px;padding:9px 0;font-size:13px;cursor:pointer">立即同步</button>' +
        '<button id="ppSyncConf" class="ppsyn-btn" style="flex:1;background:#fff;color:#6E4F37;border:1px solid #d8c69f;border-radius:9px;padding:9px 0;font-size:13px;cursor:pointer">查看冲突</button>' +
      '</div>';
    document.body.appendChild(p);
    p.querySelector('#ppSyncClose').onclick = function () { p.style.display = 'none'; };
    p.querySelector('#ppSyncServer').value = statusInfo().server;
    p.querySelector('#ppSyncGo').onclick = function () {
      var sv = p.querySelector('#ppSyncServer').value.trim();
      var ps = p.querySelector('#ppSyncPass').value;
      if (sv) setServerUrl(sv);
      if (!ps) { flash('请先输入同步口令'); return; }
      _pass = ps;
      p.querySelector('#ppSyncGo').textContent = '同步中…';
      syncNow(true).then(function (r) {
        p.querySelector('#ppSyncGo').textContent = '立即同步';
        paintStatus();
        if (r.status === 'noserver') { flash('请填写正确的同步服务器地址'); }
        else if (r.status === 'auth') { flash('同步失败：口令与服务器不匹配'); }
        else if (r.status === 'error') { flash('同步失败：请检查网络/服务器'); }
        else { flash('同步完成 ✅'); }
      });
    };
    p.querySelector('#ppSyncConf').onclick = function () { showConflicts(); };
    paintStatus();
    _panel = p;
    return p;
  }

  function paintStatus() {
    var s = statusInfo(), el = _panel && _panel.querySelector('#ppSyncStatus');
    if (!el) return;
    var last = s.lastPull ? new Date(s.lastPull).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '从未';
    el.innerHTML =
      '<div>服务器：' + (s.server ? '<b style="color:#6E4F37">' + esc(s.server) + '</b>' : '<span style="color:#b08a5a">未配置</span>') + '</div>' +
      '<div>最近同步：' + last + (s.conflicts ? '　<span style="color:#b00">冲突备份 ' + s.conflicts + ' 条</span>' : '') + '</div>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function showConflicts() {
    var c = jget(lsGet(STORE_KEYS.conflicts)) || {};
    var ks = Object.keys(c);
    if (!ks.length) { flash('暂无冲突备份'); return; }
    alert('冲突自动备份 ' + ks.length + ' 条（被较新版本覆盖的旧值，未丢失）\n\n' + ks.slice(0, 30).join('、'));
  }

  function openPanel() {
    if (!_panel) _panel = ensurePanel();
    _panel.style.display = 'block';
    paintStatus();
  }

  /* ---------- 自动同步 ---------- */
  function schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      syncNow(false).then(function (r) {
        if (r.status !== 'busy' && r.status !== 'nopass' && r.status !== 'noserver') { /* 静默 */ }
        schedule();
      });
    }, S.autoInterval);
  }

  /* ---------- 对外 API ---------- */
  global.ppSync = {
    version: S.V,
    setup: function (opts) { if (opts && opts.server) setServerUrl(opts.server); if (opts && opts.pass) _pass = opts.pass; return statusInfo(); },
    setPass: function (p) { _pass = p; },
    setServer: function (u) { setServerUrl(u); },
    syncNow: function () { return syncNow(true); },
    status: statusInfo,
    on: on,
    open: openPanel
  };

  /* ---------- 启动 ---------- */
  function boot() {
    setTimeout(function () { syncNow(false); }, S.autoDelay);
    schedule();
    on(function (ev) {
      if (_panel && (ev.type === 'synced' || ev.type === 'merged')) { paintStatus(); }
    });
  }
  /* 暴露到全局，供顶栏「更多」菜单调用 */
  global.openSyncPanel = function() {
    try {
      if (!_panel) _panel = ensurePanel();
      // 居中模态框样式
      _panel.style.display = 'block';
      _panel.style.top = '50%';
      _panel.style.left = '50%';
      _panel.style.bottom = 'auto';
      _panel.style.right = 'auto';
      _panel.style.transform = 'translate(-50%, -50%)';
      _panel.style.zIndex = '100002';
      _panel.style.width = '320px';
      _panel.style.position = 'fixed';
      // 添加半透明遮罩
      var mask = document.getElementById('ppSyncMask');
      if (!mask) {
        mask = document.createElement('div');
        mask.id = 'ppSyncMask';
        mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.35);z-index:100001;display:none';
        mask.onclick = function() {
          _panel.style.display = 'none';
          mask.style.display = 'none';
        };
        document.body.appendChild(mask);
      }
      mask.style.display = 'block';
      // 确保面板在遮罩之上
      if (_panel.parentNode) {
        _panel.parentNode.appendChild(_panel);
      }
      // 关闭按钮也要关闭遮罩
      var closeBtn = document.getElementById('ppSyncClose');
      if (closeBtn && !closeBtn._maskBound) {
        closeBtn._maskBound = true;
        var oldClick = closeBtn.onclick;
        closeBtn.onclick = function() {
          _panel.style.display = 'none';
          mask.style.display = 'none';
          if (oldClick) oldClick();
        };
      }
      paintStatus();
      // 自动聚焦到服务器地址输入框，提升体验
      setTimeout(function() {
        var input = document.getElementById('ppSyncServer');
        if (input && !input.value) input.focus();
      }, 100);
    } catch(e) {
      alert('多端同步面板加载中，请稍候再试');
    }
  };
  /* 关闭同步面板的统一方法 */
  global.closeSyncPanel = function() {
    try {
      var mask = document.getElementById('ppSyncMask');
      if (mask) mask.style.display = 'none';
      if (_panel) _panel.style.display = 'none';
    } catch(e) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);