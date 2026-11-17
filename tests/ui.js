const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start'); await pg.click('#sp0');
  const pts = await pg.evaluate(() => { const o = __ol, G = o.G, a = G.planets[0], b = G.planets.find(q => q.wants.includes(a.good)); return [o.toScreen(a), o.toScreen(b)]; });
  await pg.mouse.move(...pts[0]); await pg.mouse.down(); await pg.mouse.move((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, { steps: 5 }); await pg.mouse.move(...pts[1], { steps: 5 }); await pg.mouse.up();
  const r1 = await pg.evaluate(() => ({ routes: __ol.G.routes.length, ships: __ol.G.ships.length, manual: __ol.cam.manual, s: +__ol.cam.s.toFixed(2) }));
  await pg.mouse.move(600, 380); await pg.mouse.wheel(0, -400); await pg.waitForTimeout(100);
  const r2 = await pg.evaluate(() => ({ manual: __ol.cam.manual, s: +__ol.cam.s.toFixed(2), cx: Math.round(__ol.cam.cx) }));
  await pg.mouse.move(1000, 600); await pg.mouse.down(); await pg.mouse.move(900, 560, { steps: 4 }); await pg.mouse.up();
  const r3 = await pg.evaluate(() => ({ manual: __ol.cam.manual, cx: Math.round(__ol.cam.cx), sel: !!__ol.G.sel }));
  await pg.waitForTimeout(200); await pg.screenshot({ path: path.join(__dirname, 'zoom.png') });
  await pg.click('#z-fit'); await pg.waitForTimeout(1200);
  const r4 = await pg.evaluate(() => ({ manual: __ol.cam.manual, s: +__ol.cam.s.toFixed(2), cx: Math.round(__ol.cam.cx) }));
  await pg.click('#z-in'); const r5 = await pg.evaluate(() => ({ manual: __ol.cam.manual, s: +__ol.cam.s.toFixed(2) }));
  await pg.mouse.move(600, 380); await pg.mouse.wheel(0, 2000); await pg.waitForTimeout(100); const r6 = await pg.evaluate(() => ({ manual: __ol.cam.manual }));
  await pg.mouse.wheel(0, 4000); await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(__dirname, 'galaxy.png') });
  console.log(JSON.stringify({ r1, r2, r3, r4, r5, r6, errs }));
  // A wrapped world readout must leave the bottom dock and the route's drop target in place.
  for (const width of [320, 390]) {
    await pg.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await pg.mouse.move(0, 0);
    await pg.evaluate(() => {
      __ol.begin('daily'); __ol.manual = true;
      __ol.G.next = null;
      const positions = [[-95, 90], [95, 90], [95, -90], [-95, -90]];
      __ol.G.planets.forEach((p, i) => { [p.x, p.y] = positions[i]; });
    });
    await pg.waitForFunction(() => !document.getElementById('hint').hidden);
    await pg.waitForFunction(() => __ol.cam.fast === 0);
    const dock = pg.locator('#dock');
    const height = (await dock.boundingBox()).height;
    const point = i => pg.evaluate(i => __ol.toScreen(__ol.G.planets[i]), i);
    await pg.mouse.move(...await point(0));
    await pg.waitForFunction(() => document.getElementById('info').textContent.length > 0);
    assert.equal((await dock.boundingBox()).height, height);
    await pg.mouse.down();
    const target = await point(1);
    await pg.mouse.move(...target);
    await pg.waitForFunction(() => document.getElementById('info').textContent.includes(__ol.G.planets[1].name));
    assert.deepEqual(await point(1), target);
    await pg.mouse.up();
    await pg.waitForSelector('#routes .panel');
    assert.equal(await pg.evaluate(() => __ol.G.sel.stops.length), 2);
    // Let the first-route tutorial finish its camera adjustment before toggling the report.
    await pg.waitForFunction(() => {
      const y = __ol.toScreen(__ol.G.planets[0])[1], delta = Math.abs(y - window.lastWorldY);
      window.lastWorldY = y;
      return delta < .001;
    }, null, { polling: 'raf' });
    const reference = await point(0);
    for (const state of ['hidden', 'visible']) {
      await pg.locator('.route-list .chip').click();
      await pg.locator('#routes .panel').waitFor({ state });
      await pg.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const current = await point(0);
      assert.ok(Math.hypot(current[0] - reference[0], current[1] - reference[1]) < .5, 'selecting or closing a route moved the map');
    }
    // Check the labels the canvas actually draws, including after zooming in on a busy depot.
    await pg.evaluate(() => {
      const p = __ol.G.planets[0]; p.depot = true; p.items = [0, 1, 2, 3, 4]; p.orders[p.wants[0]] = 9;
    });
    for (const zoomIn of [false, true]) {
      if (zoomIn) await pg.click('#z-in');
      const labels = await pg.evaluate(async () => {
        const ctx = document.getElementById('c').getContext('2d'), original = ctx.fillText, drawn = [];
        ctx.fillText = function (name, x, y, ...args) {
          const world = __ol.G.planets.find(p => p.name === name);
          if (world) {
            const t = ctx.getTransform(), [px, py] = __ol.toScreen(world), dpr = document.getElementById('c').width / document.getElementById('c').clientWidth;
            drawn.push({ dx: (x * t.a + t.e) / dpr - px, dy: (y * t.d + t.f) / dpr - py });
          }
          return original.call(ctx, name, x, y, ...args);
        };
        try { await new Promise(requestAnimationFrame); } finally { ctx.fillText = original; }
        return drawn;
      });
      assert.equal(labels.length, 4);
      assert.ok(labels.every(p => Math.abs(p.dx) < .01 && p.dy > 10), 'world name left its anchor');
    }
  }
  assert.deepEqual(errs, []);
  await b.close();
})();
