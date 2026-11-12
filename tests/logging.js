const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  const fake = '<script>window.__saves = []; window.claude = { use: async n => n === "db" ? { doc: p => ({ set: async d => { window.__saves.push({ p, d }); } }) } : null };</script>';
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + fake + html + '</body></html>');
  await pg.click('#start');
  const pts = await pg.evaluate(() => { const o = __ol, G = o.G, a = G.planets[0], b = G.planets.find(q => q.wants.includes(a.good)) || G.planets[1]; return [o.toScreen(a), o.toScreen(b)]; });
  await pg.mouse.move(...pts[0]); await pg.mouse.down(); await pg.mouse.move(...pts[1], { steps: 6 }); await pg.mouse.up();
  await pg.click('#buy-ship'); await pg.click('#sp3');
  // let the run play in real time until it collapses (one route cannot hold four worlds for long)
  for (let i = 0; i < 80; i++) { await pg.waitForTimeout(2000); if (await pg.evaluate(() => !!__ol.G.over)) break; }
  await pg.waitForTimeout(500);
  const out = await pg.evaluate(() => ({ n: window.__saves.length, path: window.__saves.at(-1)?.p, bytes: JSON.stringify(window.__saves.at(-1)?.d || {}).length, last: window.__saves.at(-1)?.d }));
  const d = out.last || {}; console.log(JSON.stringify({ saves: out.n, path: out.path, bytes: out.bytes, ended: d.ended, seconds: d.seconds, delivered: d.delivered, speeds: d.realSecondsAtSpeed, routesOpened: d.routesOpened, purchases: d.purchases, events: d.events, collapse: d.collapse, lastSample: d.timeline && d.timeline.at(-1), samples: d.timeline && d.timeline.length, errs }, null, 1));
  await b.close();
})();
