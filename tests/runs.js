// Run logs on a hosted copy: the real api/runs.js against an in-memory stand-in for Redis, then a real run played in the page that saves to it.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
process.env.KV_REST_API_URL = 'http://redis.test'; process.env.KV_REST_API_TOKEN = 'test-token';
const kv = new Map(), z = new Map(), counters = new Map(), realFetch = global.fetch;
const desc = () => [...z.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
global.fetch = async (url, opt) => {
  if (!/^https?:\/\/redis\.test/.test(String(url))) return realFetch(url, opt);
  const out = JSON.parse(opt.body).map(([cmd, key, ...a]) => {
    if (cmd === 'SET') { kv.set(key, a[0]); return { result: 'OK' }; }
    if (cmd === 'GET') return { result: kv.has(key) ? kv.get(key) : null };
    if (cmd === 'MGET') return { result: [key, ...a].map(k => kv.has(k) ? kv.get(k) : null) };
    if (cmd === 'ZADD') { z.set(a[1], +a[0]); return { result: 1 }; }
    if (cmd === 'ZREVRANGE') return { result: desc().slice(a[0], a[1] + 1) };
    if (cmd === 'ZREMRANGEBYRANK') { const asc = desc().reverse(), n = asc.length, to = a[1] < 0 ? n + a[1] : a[1]; asc.slice(a[0], to + 1).forEach(m => z.delete(m)); return { result: 0 }; }
    if (cmd === 'INCR') { counters.set(key, (counters.get(key) || 0) + 1); return { result: counters.get(key) }; }
    if (cmd === 'EXPIRE') return { result: 1 };
    return { error: 'unknown command ' + cmd };
  });
  return { ok: true, status: 200, json: async () => out };
};
const handler = require('../api/runs.js');
const call = (method, body, url, ip) => new Promise(done => { const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(d) { done({ code: this.code, body: d }); } };
  handler({ method, body, url: url || '/api/runs', headers: { 'x-forwarded-for': ip || '1.1.1.1' } }, res); });

(async () => {
  const checks = [], ok = (name, pass) => checks.push((pass ? 'pass ' : 'FAIL ') + name);
  ok('no runs to begin with', (await call('GET')).body.runs.length === 0);
  ok('rejects something that is not a run', (await call('POST', { id: 'rabc12345', run: { hello: 1 } })).code === 400);
  ok('rejects a bad id', (await call('POST', { id: '../x', run: { timeline: [] } })).code === 400);
  ok('rejects an oversized record', (await call('POST', { id: 'rabc12345', run: { timeline: [], pad: 'x'.repeat(500000) } })).code === 413);
  ok('saves a run', (await call('POST', { id: 'rabc12345', run: { timeline: [], seconds: 30, delivered: 4 } })).code === 200);
  ok('a later save replaces it', (await call('POST', { id: 'rabc12345', run: { timeline: [{}], seconds: 60, delivered: 9 } })).code === 200 && (await call('GET', null, '/api/runs?id=rabc12345')).body.run.delivered === 9);
  let last; for (let i = 0; i < 25; i++) last = await call('POST', { id: 'rspam0000' + i, run: { timeline: [] } }, null, '9.9.9.9');
  ok('limits one address to twenty saves a minute', last.code === 429);

  const server = http.createServer((req, res) => { // the site as Vercel would serve it
    if (req.url.startsWith('/api/runs')) { let body = ''; req.on('data', d => body += d); req.on('end', () => handler({ method: req.method, body, url: req.url, headers: req.headers },
      { setHeader() {}, status(c) { res.statusCode = c; return this; }, json(d) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); } })); return; }
    if (req.url.startsWith('/api/')) { res.statusCode = 503; res.setHeader('content-type', 'application/json'); return res.end('{"error":"The leaderboard is not set up yet."}'); }
    res.setHeader('content-type', 'text/html'); res.end(fs.readFileSync(path.join(__dirname, '..', 'index.html'))); });
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1200, height: 800 } }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/`); await pg.click('#start'); await pg.click('#sp3');
  await pg.evaluate(() => { const G = __ol.G; __ol.createRoute([G.planets[0], G.planets[1]]); });
  await pg.waitForSelector('#over:not([hidden])', { timeout: 240000 }); await pg.waitForTimeout(800);
  const list = (await call('GET')).body.runs.filter(r => !/^rspam|^rabc/.test(r.id)), full = list[0] && (await call('GET', null, '/api/runs?latest=1')).body.run;
  ok('the played run was saved by the page', list.length === 1 && list[0].ended === true && !!list[0].collapsedAt);
  ok('it records each good\'s supply, demand and missing links', !!full && full.version === 27 && /^daily \d{4}-\d\d-\d\d$/.test(full.galaxy) && full.timeline.length > 1 && full.timeline[0].goods.length >= 4 && 'buyersWithNoRouteToASeller' in full.timeline[0].goods[0]);
  await pg.click('#copy-log'); await pg.waitForTimeout(200);
  const clip = await pg.evaluate(() => navigator.clipboard.readText()), msg = await pg.textContent('#copy-msg');
  ok('the end screen copies the record', msg === 'Copied.' && JSON.parse(clip).collapse.world === full.collapse.world);
  ok('no page errors', errs.length === 0);
  console.log(checks.join('\n')); if (full) console.log(JSON.stringify(full.timeline[full.timeline.length - 1].goods));
  await b.close(); server.close(); process.exit(checks.some(c => c.startsWith('FAIL')) ? 1 : 0);
})();
