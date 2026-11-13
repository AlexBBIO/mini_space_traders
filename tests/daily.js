// The day's galaxy. Plays the same day three times at different frame rates, unplayed and then with a route opened, and checks that the map,
// what each world sells and buys, the order worlds join and grow in, and the events all come out identical. Then checks that another day, and a
// random galaxy, come out different.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html'));
  const play = (mode, dt, routes, fakeDay) => pg.evaluate(([mode, dt, routes, fakeDay]) => {
    const o = __ol, real = Date.prototype.toISOString; if (fakeDay) Date.prototype.toISOString = function () { return fakeDay + 'T12:00:00.000Z'; };
    o.begin(mode); Date.prototype.toISOString = real; o.manual = true; const G = o.G, log = [], seen = new Set(); let ev = '';
    const map = G.planets.concat(G.dormant).map(p => p.name + ':' + Math.round(p.r) + ':' + p.ang.toFixed(4)).sort().join(' ');
    if (routes) { o.createRoute([G.planets[0], G.planets[1]]); o.createRoute([G.planets[2], G.planets[3], G.planets[0]]); }
    const state = () => G.planets.map(p => p.name + ' ' + p.good + 'x' + p.level + ' buys ' + p.wants.map(g => g + 'x' + Math.round(p.rate[g] / .46)).join(',')).join(' | ');
    let last = state(); log.push('0 ' + last);
    while (G.t < 900) { o.step(dt); for (const p of G.planets) p.over = 0;
      const s = state(); if (s !== last) { last = s; log.push(G.sec + ' ' + s); }
      const e = G.rush ? 'surge ' + G.rush.p.name + ' ' + G.rush.g : G.crunch ? 'crunch ' + G.crunch.p.name : ''; if (e !== ev) { ev = e; if (e) log.push(G.sec + ' ' + e); } }
    return { day: G.day, seed: G.seed, map, log, worlds: G.planets.length, events: log.filter(l => /surge|crunch/.test(l)).length };
  }, [mode, dt, routes, fakeDay]);
  const checks = [], ok = (name, pass) => checks.push((pass ? 'pass ' : 'FAIL ') + name);
  const a = await play('daily', 1 / 60), c = await play('daily', 1 / 144), d = await play('daily', .05, true);
  ok('today’s galaxy is dealt from the date', a.day === new Date().toISOString().slice(0, 10) && a.seed === 'day:' + a.day);
  ok('the same map every time', a.map === c.map && a.map === d.map);
  ok('the same worlds, goods, growth and events at 60 and 144 frames a second', JSON.stringify(a.log) === JSON.stringify(c.log));
  ok('and whatever the player does', JSON.stringify(a.log) === JSON.stringify(d.log));
  ok('a full run: 14 worlds and several events', a.worlds === 14 && a.events >= 6);
  const t = await play('daily', 1 / 60, false, '2031-05-06'), r1 = await play('random', 1 / 60), r2 = await play('random', 1 / 60);
  ok('another day is another galaxy', t.day === '2031-05-06' && t.map !== a.map && JSON.stringify(t.log) !== JSON.stringify(a.log));
  ok('random galaxies differ from today’s and from each other', r1.day === null && r1.map !== a.map && r1.map !== r2.map);
  console.log(checks.join('\n')); console.log(a.log.length + ' changes in 15 minutes; first: ' + a.log[0].slice(0, 110) + '; errors: ' + JSON.stringify(errs));
  await b.close(); process.exit(checks.some(c => c.startsWith('FAIL')) || errs.length ? 1 : 0);
})();
