const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  pg.on('pageerror', e => console.log('ERR', e.message));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start');
  for (let run = 0; run < 3; run++) {
    const out = await pg.evaluate(() => { document.getElementById('start').click(); __ol.manual = true; const o = __ol, G = o.G, rows = [], OUT = [.7, 1, 1.4], APP = [1, 1.6, 2.4];
      const snap = sec => { const goods = [0, 1, 2, 3, 4].filter(g => G.planets.some(p => p.good === g));
        rows.push(`t${sec} worlds${G.planets.length} | ` + goods.map(g => { const sup = G.planets.reduce((n, p) => n + (p.good === g ? OUT[p.size] : 0), 0), dem = G.planets.reduce((n, p) => n + (p.rate[g] || 0), 0);
          return `g${g} supply${sup.toFixed(1)} demand${dem.toFixed(2)} (${(dem / sup * 100).toFixed(0)}%) buyers${G.planets.filter(p => p.wants.includes(g)).length}`; }).join(' ; ')
          + ' | load ' + G.planets.map(p => ['S', 'M', 'L'][p.size] + (p.wants.reduce((n, g) => n + p.rate[g], 0) / APP[p.size]).toFixed(2) + 'x' + p.wants.length).join(' ') + ' | pending ' + G.pending.map(v => v.toFixed(2)).join(',')); };
      snap(0);
      for (let sec = 1; sec <= 1000; sec++) { for (let i = 0; i < 20; i++) o.step(0.05); for (const p of G.planets) { p.over = 0; p.orders = {}; p.stock = 0; } if ([130, 400, 1000].includes(sec)) snap(sec); }
      return rows; });
    console.log(out.join('\n') + '\n');
  }
  await b.close();
})();
