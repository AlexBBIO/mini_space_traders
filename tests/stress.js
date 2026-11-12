const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  pg.on('pageerror', e => console.log('ERR', e.message));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start');
  const out = await pg.evaluate(() => { __ol.manual = true; const o = __ol, G = o.G; let bad = [], idleMax = 0, checks = 0; G.credits = 5000;
    const rndPick = a => a[Math.floor(Math.random() * a.length)];
    for (let sec = 0; sec < 900; sec++) {
      for (let i = 0; i < 20; i++) o.step(0.05);
      for (const p of G.planets) p.over = 0; // never end
      if (sec % 20 === 0) { // churn: random routes, ships, removals, depots
        if (G.routes.length < 7) { o.buy('lic'); const st = [...G.planets].sort(() => Math.random() - .5).slice(0, 2 + Math.floor(Math.random() * 3)); o.createRoute(st); }
        if (G.reserve < 1) o.buy('ship'); if (G.routes.length) o.addShip(rndPick(G.routes));
        if (Math.random() < .25 && G.routes.length > 3) o.removeRoute(rndPick(G.routes));
        if (Math.random() < .2 && G.routes.length) o.removeShip(rndPick(G.routes));
        if (Math.random() < .2) { G.credits += 500; o.buildDepot(rndPick(G.planets)); }
      }
      checks++;
      if (sec % 60 === 59) { const row = []; for (const g of [0, 1, 2, 3, 4]) { const sellers = G.planets.filter(p => p.good === g); if (!sellers.length) continue;
          const stock = sellers.reduce((n, p) => n + p.stock, 0), transit = G.ships.reduce((n, s) => n + s.cargo.filter(c => c.g === g).length, 0) + G.planets.reduce((n, p) => n + p.items.filter(v => v === g).length, 0), ord = G.planets.reduce((n, p) => n + (p.orders[g] || 0), 0);
          row.push(`g${g}:stock${stock}+transit${transit}-orders${ord}=${stock + transit - ord}`); } (window.__bal = window.__bal || []).push(sec + 's ' + row.join(' ')); }
      for (const p of G.planets) for (const g of [0, 1, 2, 3, 4]) {
        const res = p.res[g] || 0, ord = p.orders[g] || 0, carried = G.ships.reduce((n, s) => n + s.cargo.filter(c => !c.relay && c.to === p && c.g === g).length, 0);
        if (res !== carried || res > ord || res < 0) bad.push(`t${sec} ${p.name} g${g} res${res} carried${carried} ord${ord}`);
      }
    }
    return { bal: window.__bal.filter((_, i) => i % 3 === 2), checks, bad: bad.slice(0, 8), badCount: bad.length, delivered: G.delivered, ships: G.ships.length, routes: G.routes.length, depots: G.planets.filter(p => p.depot).length };
  });
  console.log(out.bal.join('\n')); delete out.bal; console.log(JSON.stringify(out));
  await b.close();
})();
