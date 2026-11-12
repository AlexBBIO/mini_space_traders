// Taking a world off the selected route: a right-click on the map, or its button in the route panel.
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html')); await pg.click('#start');
  const names = () => pg.evaluate(() => __ol.G.routes.map(r => r.stops.map(p => p.name).join('>')));
  const at = i => pg.evaluate(i => { const p = __ol.G.sel.stops[i], [x, y] = __ol.toScreen(p), c = document.getElementById('c').getBoundingClientRect(); return [c.left + x, c.top + y]; }, i);
  await pg.evaluate(() => { const o = __ol, G = o.G; G.reserve = 6; const r = o.createRoute(G.planets.slice(0, 4)); o.addShip(r); o.addShip(r); for (let i = 0; i < 20 * 40; i++) o.step(.05); });
  await pg.waitForTimeout(600); const before = await names();
  let [x, y] = await at(1); await pg.mouse.move(x, y); await pg.waitForTimeout(100); const hint = await pg.textContent('#info');
  await pg.mouse.click(x, y, { button: 'right' }); await pg.waitForTimeout(300); const afterRight = await names();
  await pg.click('#routes .stops button'); await pg.waitForTimeout(300); const afterButton = await names();
  [x, y] = await at(0); await pg.mouse.click(x, y, { button: 'right' }); await pg.waitForTimeout(300); const afterLast = await names();
  const buttonsLeft = await pg.locator('#routes .stops button').count();
  const run = await pg.evaluate(() => { const o = __ol, G = o.G, d0 = G.delivered; o.manual = true; for (let i = 0; i < 20 * 120; i++) { o.step(.05); for (const p of G.planets) p.over = 0; }
    return { ships: G.ships.length, flying: G.ships.every(s => s.state === 'dock' || s.route.stops[s.idx]), stray: G.ships.some(s => s.from && s.state === 'dock') }; });
  // drag the middle of the lane out to a world that is not on the route
  await pg.waitForTimeout(2500); // let the camera settle on the grown network
  const lane = await pg.evaluate(() => { const o = __ol, r = o.G.sel, c = document.getElementById('c').getBoundingClientRect(), [ax, ay] = o.toScreen(r.stops[0]), [bx, by] = o.toScreen(r.stops[1]);
    const p = o.G.planets.find(p => { const [x, y] = o.toScreen(p); return !r.stops.includes(p) && x > 60 && x < 850 && y > 110 && y < 700; }), [px, py] = o.toScreen(p); return { from: [c.left + (ax + bx) / 2, c.top + (ay + by) / 2], to: [c.left + px, c.top + py], name: p.name }; });
  await pg.mouse.move(...lane.from); await pg.mouse.down(); await pg.mouse.move((lane.from[0] + lane.to[0]) / 2, (lane.from[1] + lane.to[1]) / 2, { steps: 4 }); await pg.mouse.move(...lane.to, { steps: 4 });
  await pg.screenshot({ path: path.join(__dirname, 'stops.png') }); await pg.mouse.up(); await pg.waitForTimeout(300);
  const afterDrag = await names(), inserted = afterDrag[0].split('>')[1] === lane.name && afterDrag[0].split('>').length === 3;
  await pg.mouse.click(...(await pg.evaluate(() => { const o = __ol, r = o.G.sel, c = document.getElementById('c').getBoundingClientRect(), [ax, ay] = o.toScreen(r.stops[0]), [bx, by] = o.toScreen(r.stops[1]); return [c.left + (ax + bx) / 2, c.top + (ay + by) / 2]; })));
  const afterClick = await names(), clickKeeps = afterClick[0] === afterDrag[0];
  const run2 = await pg.evaluate(() => { const o = __ol, G = o.G; o.manual = true; for (let i = 0; i < 20 * 120; i++) { o.step(.05); for (const p of G.planets) p.over = 0; } return G.ships.every(s => s.route.stops[s.idx] && s.route.stops[s.prev]); });
  const ok = inserted && clickKeeps && run2 && before[0].split('>').length === 4 && afterRight[0].split('>').length === 3 && afterButton[0].split('>').length === 2 && afterLast[0] === afterButton[0] && buttonsLeft === 0 && /right-click/.test(hint) && run.flying && !run.stray && !errs.length;
  console.log(JSON.stringify({ before, afterRight, afterButton, afterLast, afterDrag, inserted, clickKeeps, run2, buttonsLeft, hint: hint.slice(-40), run, errs })); console.log(ok ? 'pass' : 'FAIL');
  await b.close(); })();
