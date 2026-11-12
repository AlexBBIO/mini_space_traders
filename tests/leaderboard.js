// Serves the game locally with the real scores API wired to an in-memory stand-in for Redis, then checks the API rules
// and posts a score through the game's own form.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
process.env.KV_REST_API_URL = 'http://redis.test'; process.env.KV_REST_API_TOKEN = 'test-token';
const zset = new Map(), counters = new Map(); // member -> score
const sorted = () => [...zset.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
const realFetch = global.fetch;
global.fetch = async (url, opt) => {
  if (!/^https?:\/\/redis\.test/.test(String(url))) return realFetch(url, opt);
  if (opt.headers.authorization !== 'Bearer test-token') return { ok: false, status: 401, json: async () => ({}) };
  const out = JSON.parse(opt.body).map(([cmd, key, ...a]) => {
    if (cmd === 'ZADD') { zset.set(a[1], +a[0]); return { result: 1 }; }
    if (cmd === 'ZREVRANGE') return { result: sorted().slice(a[0], a[1] + 1).flatMap(([m, s]) => [m, String(s)]) };
    if (cmd === 'ZREVRANK') { const i = sorted().findIndex(([m]) => m === a[0]); return { result: i < 0 ? null : i }; }
    if (cmd === 'ZREMRANGEBYRANK') { const asc = sorted().reverse(), n = asc.length, from = a[0] < 0 ? n + a[0] : a[0], to = a[1] < 0 ? n + a[1] : a[1]; asc.slice(from, to + 1).forEach(([m]) => zset.delete(m)); return { result: 0 }; }
    if (cmd === 'INCR') { counters.set(key, (counters.get(key) || 0) + 1); return { result: counters.get(key) }; }
    if (cmd === 'EXPIRE') return { result: 1 };
    if (cmd === 'PING') return { result: 'PONG' };
    return { error: 'unknown command ' + cmd };
  });
  return { ok: true, status: 200, json: async () => out };
};
const handler = require('../api/scores.js');
const call = (method, body, ip, url) => new Promise(done => { const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(d) { done({ code: this.code, body: d }); } };
  handler({ method, body, url: url || '/api/scores', headers: { 'x-forwarded-for': ip || '1.1.1.1' } }, res); });

(async () => {
  const checks = [], ok = (name, pass) => checks.push((pass ? 'pass ' : 'FAIL ') + name);
  ok('empty board', (await call('GET')).body.top.length === 0);
  ok('rejects a blank name', (await call('POST', { name: '   ', delivered: 10, seconds: 100 })).code === 400);
  ok('rejects an impossible score', (await call('POST', { name: 'Cheat', delivered: 99999, seconds: 60 })).code === 400);
  ok('rejects a run under 20 seconds', (await call('POST', { name: 'Quick', delivered: 1, seconds: 5 })).code === 400);
  const a = await call('POST', { name: '  Ada <b>Lovelace</b> the Magnificent  ', delivered: 300, seconds: 600 });
  ok('cleans and trims the name', a.code === 200 && a.body.top[0].name === 'Ada bLovelace/b');
  const b = await call('POST', { name: 'Grace', delivered: 450, seconds: 700 }), c = await call('POST', { name: 'Linus', delivered: 120, seconds: 300 });
  ok('ranks by units delivered', b.body.rank === 1 && c.body.rank === 3 && c.body.top.map(e => e.name).join() === 'Grace,Ada bLovelace/b,Linus');
  let last; for (let i = 0; i < 8; i++) last = await call('POST', { name: 'Spam' + i, delivered: 5, seconds: 60 }, '9.9.9.9');
  ok('limits one address to six posts a minute', last.code === 429);

  // the database's variables can arrive under another prefix, or not at all
  const saved = { u: process.env.KV_REST_API_URL, t: process.env.KV_REST_API_TOKEN }; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  ok('answers 503 with no database variables', (await call('GET')).code === 503);
  const d0 = (await call('GET', undefined, undefined, '/api/scores?debug=1')).body; ok('debug reports nothing configured', d0.configured === false && d0.using === null);
  process.env.STORAGE_KV_REST_API_URL = 'http://redis.test'.replace('http:', 'https:'); process.env.STORAGE_KV_REST_API_TOKEN = 'test-token'; process.env.STORAGE_KV_REST_API_READ_ONLY_TOKEN = 'nope';
  const d1 = (await call('GET', undefined, undefined, '/api/scores?debug=1')).body;
  ok('finds the variables under a custom prefix', d1.configured && d1.using.join() === 'STORAGE_KV_REST_API_URL,STORAGE_KV_REST_API_TOKEN' && d1.storeReachable === true && !JSON.stringify(d1).includes('test-token'));
  ok('serves the board through them', (await call('GET')).body.top.length > 0);
  delete process.env.STORAGE_KV_REST_API_URL; delete process.env.STORAGE_KV_REST_API_TOKEN; delete process.env.STORAGE_KV_REST_API_READ_ONLY_TOKEN; process.env.KV_REST_API_URL = saved.u; process.env.KV_REST_API_TOKEN = saved.t;

  // the game itself, served with the API beside it
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/api/scores')) { let raw = ''; req.on('data', d => raw += d); req.on('end', () => { const r = { setHeader() {}, code: 200, status(c) { this.code = c; return this; }, json(d) { res.writeHead(this.code, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); } };
        handler({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined, headers: { 'x-forwarded-for': '2.2.2.2' } }, r); }); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(__dirname, '..', 'index.html')));
  }).listen(0);
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1200, height: 800 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(500);
  ok('intro shows the top runs', await pg.evaluate(() => !document.getElementById('lb-intro').hidden && document.querySelectorAll('#lb-intro li').length === 5));
  await pg.click('#start');
  await pg.evaluate(() => { __ol.manual = true; const o = __ol, G = o.G; for (let i = 0; i < 20 * 40; i++) o.step(0.05); const p = G.planets.find(q => q.wants.length); p.orders[p.wants[0]] = 9; p.over = .999; G.delivered = 60; for (let i = 0; i < 40 && !G.over; i++) o.step(0.05); });
  await pg.waitForSelector('#over:not([hidden])'); await pg.fill('#lb-name', 'Testy McTest'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600);
  const ui = await pg.evaluate(() => ({ msg: document.getElementById('lb-msg').textContent, me: document.querySelector('#lb-over li.me')?.textContent, rows: document.querySelectorAll('#lb-over li').length, disabled: document.getElementById('lb-post').disabled }));
  ok('the form posts and highlights the new row', /number 4/.test(ui.msg) && /Testy McTest/.test(ui.me || '') && ui.disabled);
  await pg.screenshot({ path: path.join(__dirname, 'leaderboard.png') });
  // the same page as a Claude artifact: no scores API, so it uses the artifact's database (a stand-in here)
  const pg2 = await br.newPage({ viewport: { width: 1200, height: 800 } }); pg2.on('pageerror', e => errs.push(e.message));
  await pg2.route('**/api/scores', r => r.fulfill({ status: 404, body: 'not found' }));
  await pg2.addInitScript(() => { const rows = [{ id: 'a', name: 'Ada', delivered: 300, seconds: 600 }, { id: 'b', name: 'Linus', delivered: 20, seconds: 90 }];
    const q = { orderBy: () => q, limit: () => q, get: async () => ({ docs: rows.slice().sort((x, y) => y.delivered - x.delivered).map(r => ({ id: r.id, data: () => r })) }), add: async d => { const id = 'n' + rows.length; rows.push(Object.assign({ id }, d)); return { id }; } };
    window.claude = { use: async n => n === 'db' ? { collection: () => q, doc: () => ({ set: async () => {} }) } : null }; });
  await pg2.goto('http://localhost:' + srv.address().port + '/'); await pg2.waitForTimeout(600); await pg2.click('#start');
  await pg2.evaluate(() => { __ol.manual = true; const o = __ol, G = o.G; for (let i = 0; i < 20 * 40; i++) o.step(0.05); const p = G.planets.find(q => q.wants.length); p.orders[p.wants[0]] = 9; p.over = .999; G.delivered = 60; for (let i = 0; i < 40 && !G.over; i++) o.step(0.05); });
  await pg2.waitForSelector('#over:not([hidden])'); await pg2.fill('#lb-name', 'In Claude'); await pg2.click('#lb-post'); await pg2.waitForTimeout(500);
  const ui2 = await pg2.evaluate(() => ({ msg: document.getElementById('lb-msg').textContent, me: document.querySelector('#lb-over li.me')?.textContent, rows: document.querySelectorAll('#lb-over li').length }));
  ok('as an artifact it posts to the artifact database', /number 2/.test(ui2.msg) && /In Claude/.test(ui2.me || '') && ui2.rows === 3);
  // hosted but with no database connected: the collapse screen says so
  const pg3 = await br.newPage(); await pg3.route('**/api/scores', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The leaderboard is not set up yet.' }) }));
  await pg3.goto('http://localhost:' + srv.address().port + '/'); await pg3.waitForTimeout(400);
  ok('with no database it shows a note, not a form', await pg3.evaluate(() => document.getElementById('lb-form').hidden && !document.getElementById('lb-note').hidden && /not set up/.test(document.getElementById('lb-note').textContent)));
  console.log(checks.join('\n')); console.log(JSON.stringify({ ui, errs }));
  await br.close(); srv.close(); process.exit(checks.some(c => c.startsWith('FAIL')) ? 1 : 0);
})();
