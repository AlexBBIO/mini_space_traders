// How clustered is the network as it grows? Elongation is the ratio of the long to the short axis of the active worlds (1 = round blob, 3+ = a line).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await pg.click('#start');
  const rows = [];
  for (let run = 0; run < 24; run++) rows.push(await pg.evaluate(() => {
    document.getElementById(document.getElementById('over').hidden ? 'start' : 'again').click();
    const o = __ol; o.manual = true; const out = {};
    const shape = ps => { const n = ps.length, mx = ps.reduce((s, p) => s + p.x, 0) / n, my = ps.reduce((s, p) => s + p.y, 0) / n;
      let a = 0, c = 0, d = 0; for (const p of ps) { const x = p.x - mx, y = p.y - my; a += x * x; c += x * y; d += y * y; }
      const tr = a + d, det = a * d - c * c, s = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + s, l2 = Math.max(1, tr / 2 - s);
      const nn = ps.map(p => Math.min(...ps.filter(q => q !== p).map(q => Math.hypot(p.x - q.x, p.y - q.y))));
      return { el: Math.sqrt(l1 / l2), rms: Math.sqrt(tr / n), nn: nn.reduce((s, v) => s + v, 0) / n, minnn: Math.min(...nn) }; };
    out[4] = shape(o.G.planets);
    for (let i = 0; i < 4 * 1000 && o.G.planets.length < 14; i++) { o.step(.25); for (const p of o.G.planets) { p.over = 0; p.orders = {}; p.res = {}; } const n = o.G.planets.length; if ((n === 8 || n === 11 || n === 14) && !out[n]) out[n] = shape(o.G.planets); }
    for (let i = 0; i < 4 * 200; i++) { o.step(.25); for (const p of o.G.planets) { p.over = 0; p.orders = {}; p.res = {}; } }
    out.late = shape(o.G.planets); out.t = Math.round(o.G.t); return out; }));
  const avg = (k, f) => (rows.reduce((s, r) => s + r[k][f], 0) / rows.length).toFixed(f === 'el' ? 2 : 0), worst = k => Math.max(...rows.map(r => r[k].el)).toFixed(2);
  for (const k of [4, 8, 11, 14, 'late']) console.log(`worlds ${k}: elongation ${avg(k, 'el')} (worst ${worst(k)}), spread ${avg(k, 'rms')}, nearest neighbour ${avg(k, 'nn')} (closest ${Math.min(...rows.map(r => r[k].minnn)).toFixed(0)})`);
  console.log('errors', errs); await b.close();
})();
