// Advanced equipment through the page itself: the choice appears when the eighth world joins and pauses the game; each of the three pieces is
// then taken and put to use with real clicks. Screenshots: tests/perk-offer.png, perk-gate.png, perk-super.png, perk-tele.png, perk-phone.png.
const { chromium } = require('playwright'); const path = require('path'); const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(), errs = [];
  const open = async (viewport) => { const pg = await b.newPage({ viewport }); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://' + path.join(__dirname, '..', 'index.html')); await pg.click('#start'); await pg.click('#sp3');
    await pg.evaluate(() => { const G = __ol.G; __ol.createRoute([G.planets[0], G.planets[1]]); window.hurry = setInterval(() => { if (__ol.G.planets.length < 8) __ol.G.nextPlanetT = 0; else clearInterval(window.hurry); }, 50); }); // worlds join one a second
    await pg.waitForSelector('#offer:not([hidden])', { timeout: 60000 }); return pg; };
  const at = (pg, i) => pg.evaluate(i => __ol.toScreen(__ol.G.planets[i]), i);
  const state = pg => pg.evaluate(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const G = __ol.G; return { t: G.t, offer: G.offer, perk: G.perk, worlds: G.planets.length, gates: G.gates.map(p => p.name), tele: G.tele && G.tele.name, sup: G.sup && G.sup.ship ? G.sup.ship.route.n : null,
    button: document.getElementById('perk').textContent, buttonHidden: document.getElementById('perk').hidden, hint: document.getElementById('hint').hidden ? '' : document.getElementById('hint').textContent, delivered: G.delivered, sent: G.teleSent }; });

  // warp gates
  let pg = await open({ width: 1200, height: 800 }), s = await state(pg);
  assert.equal(s.worlds, 8); assert.equal(s.offer, true); assert.equal(s.buttonHidden, true);
  await pg.waitForTimeout(700); assert.equal((await state(pg)).t, s.t, 'the game ran on while the choice was open');
  await pg.screenshot({ path: path.join(__dirname, 'perk-offer.png') });
  await pg.click('[data-perk="gate"]'); s = await state(pg);
  assert.equal(s.perk, 'gate'); assert.equal(s.offer, false); assert.match(s.hint, /3 to place/); assert.match(s.button, /pick a world · 3 to place/);
  assert.equal(await pg.isHidden('#offer'), true);
  await pg.click('#sp0'); await pg.mouse.click(...await at(pg, 0)); assert.match((await state(pg)).hint, /2 to place/);
  await pg.mouse.click(...await at(pg, 0)); assert.equal((await state(pg)).gates.length, 1, 'two gates went to one world');
  await pg.keyboard.press('Escape'); assert.match((await state(pg)).button, /^Warp gates 2 to place$/); // put off, then picked up again from its button
  await pg.click('#perk'); await pg.mouse.click(...await at(pg, 7)); await pg.mouse.click(...await at(pg, 4)); s = await state(pg);
  assert.equal(s.gates.length, 3); assert.match(s.button, / · .* · /); assert.equal(s.hint, '');
  await pg.evaluate(() => { const G = __ol.G; __ol.createRoute([G.gates[0], G.gates[1]]); }); await pg.click('#sp1'); await pg.waitForTimeout(1200);
  await pg.mouse.move(...await at(pg, 7)); await pg.waitForTimeout(150); assert.match(await pg.textContent('#info'), /warp gate/);
  await pg.screenshot({ path: path.join(__dirname, 'perk-gate.png') }); await pg.close();

  // super freighter: goes to the selected route, and its button moves it
  pg = await open({ width: 1200, height: 800 }); await pg.waitForTimeout(600);
  await pg.click('[data-perk="super"]'); s = await state(pg);
  assert.equal(s.perk, 'super'); assert.equal(s.sup, 1); assert.match(s.button, /on route 1/); assert.match(await pg.textContent('.route-list'), /2 ships ★/);
  await pg.click('#perk'); s = await state(pg); assert.equal(s.sup, null); assert.match(s.button, /in reserve/);
  await pg.click('#perk'); assert.equal((await state(pg)).sup, 1);
  await pg.waitForTimeout(800); await pg.screenshot({ path: path.join(__dirname, 'perk-super.png') }); await pg.close();

  // teleporter, on a phone
  pg = await open({ width: 390, height: 844 }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.join(__dirname, 'perk-phone-offer.png') });
  assert.equal(await pg.evaluate(() => { const r = document.getElementById('buy-ship').getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el.closest('#offer'); }), true, 'the shop shows through the choice card');
  await pg.click('[data-perk="tele"]'); assert.match((await state(pg)).hint, /teleport its goods/);
  const seller = await pg.evaluate(() => { const G = __ol.G, p = G.planets.find(p => G.planets.some(q => q !== p && q.wants.includes(p.good) && !G.routes.some(r => r.stops.includes(p) && r.stops.includes(q)))); return G.planets.indexOf(p); });
  await pg.mouse.click(...await at(pg, seller)); s = await state(pg);
  assert.ok(s.tele, 'the teleporter was not built'); assert.match(s.button, /Teleporter/);
  await pg.waitForFunction(() => __ol.G.teleSent > 0, null, { timeout: 60000 });
  const box = await pg.locator('#perk').boundingBox(); assert.ok(box.y + box.height <= 844, 'the equipment button is off the screen');
  await pg.screenshot({ path: path.join(__dirname, 'perk-phone.png') }); await pg.close();

  assert.deepEqual(errs, []); console.log('pass'); await b.close();
})();
