const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><style>[hidden]{display:none!important}html{color-scheme:light}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start');
  // real drag between two planets
  const pts = await pg.evaluate(() => { const G = __ol.G, c = document.getElementById('c').getBoundingClientRect(); return { n: G.planets.length }; });
  // bot runs
  for (let run = 0; run < 6; run++) {
    const res = await pg.evaluate(() => {
      document.getElementById(document.getElementById('over').hidden ? 'start' : 'again').click();
      __ol.manual = true; const o = __ol; let log = [];
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      for (let sec = 0; sec < 3600 && !o.G.over; sec++) {
        for (let i = 0; i < 20; i++) o.step(0.05);
        const G = o.G;
        const trades = r => r.stops.some(a => r.stops.some(b => a !== b && b.wants.includes(a.good)));
        for (const r of G.routes.slice()) if (!trades(r)) o.removeRoute(r);
        for (const q0 of G.planets) for (const g of q0.wants) { if (!(q0.orders[g] > 0)) continue; const p = q0;
          if (G.routes.some(r => r.stops.includes(p) && r.stops.some(q => q !== p && q.good === g))) continue;
          const q = G.planets.filter(q => q !== p && q.good === g).sort((a, b) => dist(a, p) - dist(b, p))[0]; if (!q) continue;
          const end = (r, x) => r.stops.length < 4 && (r.stops[0] === x || r.stops[r.stops.length - 1] === x);
          const r1 = G.routes.find(r => end(r, p)), r2 = G.routes.find(r => end(r, q));
          if (r1) o.extendRoute(r1, [q], r1.stops[0] === p); else if (r2) o.extendRoute(r2, [p], r2.stops[0] === q);
          else { if (G.licences <= 0) o.buy('lic'); if (G.licences > 0) o.createRoute([p, q]); }
        }
        const load = r => r.stops.reduce((s, p) => s + p.wants.reduce((n, g) => n + (r.stops.some(q => q !== p && q.good === g) ? (p.orders[g] || 0) : 0), 0), 0) / (o.shipsOn(r).length + .5);
        const busiest = () => G.routes.slice().sort((a, b) => load(b) - load(a))[0];
        for (const r of G.routes) if (!o.shipsOn(r).length) { if (G.reserve <= 0 && !o.buy('ship')) { const big = G.routes.slice().sort((x, y) => o.shipsOn(y).length - o.shipsOn(x).length)[0]; if (o.shipsOn(big).length > 1) o.removeShip(big); } if (G.reserve > 0) o.addShip(r); }
        if (G.routes.length) { if (G.reserve <= 0 && G.credits >= o.cost('ship')) o.buy('ship'); if (G.reserve > 0) o.addShip(busiest()); }
        if (o.cost('hold') && G.credits > o.cost('hold') * 1.5) o.buy('hold');
        if (o.cost('eng') && G.credits > o.cost('eng') * 1.5) o.buy('eng');
        if (sec % 120 === 0) log.push([sec, G.planets.length, G.routes.length, G.ships.length, G.credits, G.delivered]);
      }
      { const G = o.G, p = G.over; if (p) log = [{ dead: p.name, size: p.size, orders: p.orders, wants: p.wants, lic: G.licences, res: G.reserve, cr: G.credits,
        routes: G.routes.map(r => r.stops.map(q => q.name + ':' + q.good).join('>') + ' x' + o.shipsOn(r).length), stock: G.planets.map(q => q.name + ':' + q.good + ' s' + q.stock + ' o' + JSON.stringify(q.orders)) }]; }
      const G = o.G; return { t: Math.round(G.t), del: G.delivered, earned: G.earned, ships: G.ships.length, routes: G.routes.length, planets: G.planets.length, cap: G.cap, log };
    });
    console.log(JSON.stringify(res));
  }
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { document.getElementById('over').hidden = true; __ol.G.sel = __ol.G.routes[1]; });
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: path.join(__dirname, 'over.png') });
  const dep = await pg.evaluate(() => { document.getElementById('again').click(); __ol.manual = true; const o = __ol, G = o.G;
    for (let i = 0; i < 20 * 50; i++) o.step(0.05); // wait for a fourth world
    G.credits = 3000; G.nextPlanetT = 1e9; G.nextRushT = 1e9; const [a, c, d, b] = G.planets;
    for (const q of G.planets) { q.wants = []; q.rate = {}; q.accD = {}; q.orders = {}; q.res = {}; } b.wants = [a.good]; b.rate[a.good] = 1.2; b.accD[a.good] = 0;
    const ok1 = o.buildDepot(c), ok2 = o.buildDepot(d); G.routes.slice().forEach(o.removeRoute);
    o.createRoute([a, c]); o.createRoute([c, d]); o.createRoute([d, b]); let peak1 = 0, peak2 = 0; const before = G.delivered;
    for (let i = 0; i < 20 * 150; i++) { o.step(0.05); peak1 = Math.max(peak1, c.items.length); peak2 = Math.max(peak2, d.items.length); }
    return { ok1, ok2, chainDelivered: G.delivered - before, peak1, peak2, astock: a.stock, ships: G.ships.length, planets: G.planets.length }; });
  console.log('depot relay', JSON.stringify(dep));
  await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(__dirname, 'depot.png') });
  // fresh game screenshot mid-play
  await pg.evaluate(() => { document.getElementById('again').click(); __ol.manual = true; const o = __ol, G = o.G;
    o.createRoute([G.planets[0], G.planets[1]]); o.createRoute([G.planets[0], G.planets[2], G.planets[1]]);
    for (let i = 0; i < 20 * 150; i++) o.step(0.05); });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(__dirname, 'play.png') });
  await pg.setViewportSize({ width: 400, height: 760 }); await pg.emulateMedia({ colorScheme: 'dark' });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: path.join(__dirname, 'phone.png') });
  console.log('errors', errs);
  await b.close();
})();
