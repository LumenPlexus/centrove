/* ============================================================================
   栖匣 · 多端同步服务端（自托管）  server.js
   ----------------------------------------------------------------------------
   零依赖 Node 服务。职责只有一个：
     按「同步桶 id」保存客户端上传的密文快照，并在多设备间回传。
   - 服务端永远看不到明文（客户端用同步口令做 AES-GCM 端到端加密）；
   - 桶 id 与访问令牌都是同步口令的哈希，无口令即无法读写；
   - 每次写入用「修订号」标记，客户端据此判断是否有更新可拉取。

   部署：
      node server.js                     -> 监听 8787
      PORT=9000 node server.js           -> 自定义端口
      BASE=/pp-sync node server.js       -> 挂在子路径（配合 Nginx 反代）
   ========================================================================== */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = +(process.env.PORT || 8787);
var BASE = (process.env.BASE || '').replace(/\/+$/, '');
var DATA_DIR = path.join(__dirname, 'data');

/* ---------- 存储：每桶一个 JSON 文件，原子写入 ---------- */
function dir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); return DATA_DIR; }
function fileOf(id) {
  // 校验桶 key 只能为十六进制，防目录穿越
  if (!/^[0-9a-f]{64}$/.test(id)) return null;
  return path.join(dir(), id + '.json');
}
function load(id) {
  var f = fileOf(id); if (!f) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
}
function save(id, rec) {
  var f = fileOf(id); if (!f) return false;
  var tmp = f + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(rec));
    fs.renameSync(tmp, f);
    return true;
  } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} return false; }
}

/* ---------- 工具 ---------- */
function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Write-Token,X-Sync-Token',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}
function readBody(req, cb) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); if (Buffer.concat(chunks).length > 4 * 1024 * 1024) req.destroy(); });
  req.on('end', function () {
    var s = Buffer.concat(chunks).toString('utf8');
    try { cb(JSON.parse(s || '{}')); } catch (e) { cb(null); }
  });
  req.on('error', function () { cb(null); });
}
function tokenOf(req) { return req.headers['x-write-token'] || req.headers['x-sync-token'] || ''; }
function valid(rec, t) { return rec && rec.token && t && rec.token === t; }

/* ---------- 路由 ---------- */
function route(req, res, parts) {
  // GET  /v1/meta/:id   -> {rev,ts,ok}
  if (req.method === 'GET' && parts[0] === 'meta' && parts[1]) {
    var id = parts[1], rec = load(id);
    if (!rec) return json(res, 404, { ok: false, error: 'not_found' });
    if (!valid(rec, tokenOf(req))) return json(res, 403, { ok: false, error: 'auth' });
    return json(res, 200, { ok: true, rev: rec.rev || 0, ts: rec.ts || 0 });
  }
  // GET  /v1/blob/:id   -> {rev,enc}
  if (req.method === 'GET' && parts[0] === 'blob' && parts[1]) {
    var bid = parts[1], brec = load(bid);
    if (!brec) return json(res, 404, { ok: false, error: 'not_found' });
    if (!valid(brec, tokenOf(req))) return json(res, 403, { ok: false, error: 'auth' });
    return json(res, 200, { ok: true, rev: brec.rev || 0, enc: brec.enc || '' });
  }
  // PUT /v1/push/:id  body {rev,ts,enc}
  if (req.method === 'PUT' && parts[0] === 'push' && parts[1]) {
    var pid = parts[1], existing = load(pid), tk = tokenOf(req);
    readBody(req, function (b) {
      if (!b || !b.enc) return json(res, 400, { ok: false, error: 'bad_request' });
      if (!tk || tk.length < 16) return json(res, 403, { ok: false, error: 'auth' });
      if (existing && !valid(existing, tk)) return json(res, 403, { ok: false, error: 'auth' });
      var rec = { rev: b.rev || Date.now(), ts: b.ts || Date.now(), enc: b.enc, token: existing ? existing.token : tk };
      if (!save(pid, rec)) return json(res, 500, { ok: false, error: 'io' });
      return json(res, 200, { ok: true, rev: rec.rev });
    });
    return;
  }
  // GET /health
  if (parts[0] === 'health' || parts[0] === '') {
    return json(res, 200, { ok: true, name: 'pp-sync', v: 1 });
  }
  return json(res, 404, { ok: false, error: 'not_found' });
}

http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') { // CORS 预检
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Write-Token,X-Sync-Token'
    });
    return res.end();
  }
  var u = decodeURIComponent((req.url || '').split('?')[0]);
  if (BASE && u.indexOf(BASE + '/') !== 0 && u !== BASE) { return json(res, 404, { ok: false, error: 'not_found' }); }
  var rest = BASE ? u.slice(BASE.length).replace(/^\/+/, '') : u.replace(/^\/+/, '');
  var parts = rest.split('/').filter(Boolean); // parts[0] should be 'v1'
  if (parts[0] !== 'v1') return json(res, 404, { ok: false, error: 'not_found' });
  route(req, res, parts.slice(1));
}).listen(PORT, function () {
  console.log('[pp-sync] server listening on :' + PORT + (BASE ? ' (BASE=' + BASE + ')' : ''));
  console.log('[pp-sync] data dir: ' + DATA_DIR);
});