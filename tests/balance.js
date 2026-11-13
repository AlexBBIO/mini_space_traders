// The unit ledger, run unplayed for 25 minutes over several galaxies. Checks the rules the map's glyphs promise:
// spare units always add up to two, no good is ever more than one unit short (and only until the next world joins),
// every newcomer arrives buying something, and nothing a world buys is ever taken away or reduced.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html')); await pg.click('#start');
  const rows = [];
  for (let run = 0; run < 12; run++) rows.push(await pg.evaluate(() => {
    __ol.begin('random'); // a different galaxy each run
    const o = __ol, G = o.G; o.manual = true; G.nextRushT = 1e9; const bad = [], seen = new Map(), prev = new Map(); let shortSecs = 0, shortSpells = 0, wasShort = false, lastJoin = 0;
    const units = (p, g) => Math.round(p.rate[g] / .46);
    const check = when => { const sup = [0, 0, 0, 0, 0], dem = [0, 0, 0, 0, 0]; for (const p of G.planets) { sup[p.good] += p.level; for (const g of p.wants) dem[g] += units(p, g); }
      const spare = sup.map((v, g) => v - dem[g]); if (spare.reduce((a, c) => a + c, 0) !== 2) bad.push(when + ' spare sums to ' + spare.join());
      if (spare.some((v, g) => v !== G.pool[g])) bad.push(when + ' ledger ' + G.pool.join() + ' but glyphs say ' + spare.join());
      if (Math.min(...spare) < -1) bad.push(when + ' more than one unit short ' + spare.join());
      const short = spare.findIndex(v => v < 0); if (short >= 0 && !(G.next && G.next.good === short)) bad.push(when + ' short of a good the next world does not sell');
      for (const p of G.planets) { if (p.level < 1 || p.level > 3) bad.push(when + ' level ' + p.level); const was = prev.get(p.id) || {};
        for (const g in was) if (!(units(p, +g) >= was[g])) bad.push(when + ' ' + p.name + ' buys less of good ' + g);
        prev.set(p.id, Object.fromEntries(p.wants.map(g => [g, units(p, g)])));
        if (!seen.has(p.id)) { seen.set(p.id, 1); if (!p.wants.length) bad.push(when + ' ' + p.name + ' joined buying nothing'); if (p.wants.includes(p.good)) bad.push(when + ' buys its own good'); } }
      return short >= 0; };
    check('start');
    for (let i = 0; i < 4 * 1500; i++) { o.step(.25); for (const p of G.planets) { p.over = 0; p.orders = {}; p.res = {}; } const s = check('t' + Math.round(G.t)); if (s) shortSecs += .25; if (s && !wasShort) shortSpells++; wasShort = s; }
    return { bad: bad.slice(0, 6), worlds: G.planets.length, levels: [1, 2, 3].map(l => G.planets.filter(p => p.level === l).length).join('/'), units: G.planets.reduce((n, p) => n + p.level, 0),
      buys: [1, 2, 3, 4].map(k => G.planets.filter(p => p.wants.length === k).length).join('/'), shortSpells, shortSecs: Math.round(shortSecs), goods: [0, 1, 2, 3, 4].map(g => G.planets.reduce((n, p) => n + (p.good === g ? p.level : 0), 0)).join('/') }; }));
  for (const r of rows) console.log(`worlds ${r.worlds} | levels 1/2/3: ${r.levels} | units made ${r.units} (per good ${r.goods}) | worlds buying 1/2/3/4 goods: ${r.buys} | short spells ${r.shortSpells} (${r.shortSecs}s) | ${r.bad.length ? 'BAD ' + r.bad.join('; ') : 'ok'}`);
  console.log(rows.every(r => !r.bad.length) && !errs.length ? 'pass' : 'FAIL', errs); await b.close();
})();
