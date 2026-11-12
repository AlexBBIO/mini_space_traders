const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start');
  // draw a route so deliveries, and their sounds, happen in real time at 3x
  const pts = await pg.evaluate(() => { const o = __ol, G = o.G, a = G.planets[0], b = G.planets.find(q => q.wants.includes(a.good)) || G.planets[1]; return [o.toScreen(a), o.toScreen(b)]; });
  await pg.mouse.move(...pts[0]); await pg.mouse.down(); await pg.mouse.move(...pts[1], { steps: 6 }); await pg.mouse.up();
  await pg.click('#sp3'); await pg.waitForTimeout(9000);
  const st = await pg.evaluate(() => ({ delivered: __ol.G.delivered, t: Math.round(__ol.G.t), stock: __ol.G.planets.map(p => p.stock).join(','), orders: __ol.G.planets.map(p => Object.values(p.orders).reduce((a, b) => a + b, 0)).join(',') }));
  await pg.click('#a-music'); await pg.click('#a-sfx'); await pg.waitForTimeout(600);
  const pressed = await pg.evaluate(() => [document.getElementById('a-music').getAttribute('aria-pressed'), document.getElementById('a-sfx').getAttribute('aria-pressed')]);
  await pg.click('#a-music'); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: path.join(__dirname, 'snd.png') });
  console.log(JSON.stringify({ st, pressed, errs }));
  await b.close();
})();
