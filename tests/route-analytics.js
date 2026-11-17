// Runs the shipped inline game in Node. Only the page, audio and animation loop
// are inert; routing, production, freighters and reports use the real simulation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function galaxy() {
  const noop = () => {};
  const el = { addEventListener: noop, setAttribute: noop, querySelector: () => el,
    getContext: () => ({ setTransform: noop }), getBoundingClientRect: () => ({ width: 1280, height: 800 }),
    offsetHeight: 120, offsetWidth: 300, children: [], appendChild: noop };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-17T12:00:00Z'])); }
  }
  const scope = { Date: FixedDate, window: {}, document: { getElementById: () => el, createElement: () => el, addEventListener: noop },
    location: { protocol: 'file:' }, ResizeObserver: class { observe() {} }, requestAnimationFrame: noop,
    matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
    clearTimeout: noop, setTimeout: noop, addEventListener: noop, performance };
  vm.runInNewContext(script, scope);
  const o = scope.window.__ol;
  o.manual = true;
  const G = o.G;
  for (const p of G.planets) {
    p.wants = []; p.rate = {}; p.orders = {}; p.res = {}; p.accD = {};
  }
  G.nextPlanetT = G.nextRushT = Infinity;
  return o;
}

function want(p, good, rate = .46) {
  p.wants.push(good); p.rate[good] = rate; p.accD[good] = 0;
}
function run(o, seconds) {
  for (let i = 0; i < seconds * 20; i++) o.step(.05);
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} ≠ ${expected}`);

test('a duplicate line cannot divide buyer demand; surges and crunches update immediately', () => {
  const o = galaxy(), [a,b] = o.G.planets;
  want(b, a.good);
  const r = o.createRoute([a,b]), duplicate = o.createRoute([a,b]);
  o.removeShip(duplicate);
  near(o.routeBalance(r)[0].demand, .46);
  o.addShip(duplicate);
  near(o.routeBalance(r)[0].supply, 1);
  o.G.rush = {p:b, g:a.good};
  o.G.crunch = {p:a};
  const row = o.routeBalance(r)[0];
  near(row.demand, 1.15); near(row.supply, .2);
  assert.equal(row.short[0], b.name);
});

test('shared suppliers reserve capacity for competing buyers with fewer alternatives', () => {
  const o = galaxy(), [a,b,c,alt] = o.G.planets;
  alt.good = a.good;
  want(b,a.good,.9); want(c,a.good,.9);
  const r = o.createRoute([a,b]);
  o.createRoute([a,c]);
  const altRoute = o.createRoute([alt,b]);
  near(o.routeBalance(r)[0].supply, 1);
  o.removeShip(altRoute);
  near(o.routeBalance(r)[0].supply, .5);
});

test('a chain of two depots reports the same end demand; actual handoffs do not count as buyer sales', () => {
  const o = galaxy(), [a,h1,h2,b] = o.G.planets;
  h1.depot = h2.depot = true;
  want(b, a.good, .9);
  const feed=o.createRoute([a,h1]), middle=o.createRoute([h1,h2]), finish=o.createRoute([h2,b]);
  for (const r of [feed,middle,finish]) near(o.routeBalance(r)[0].demand,.9);
  run(o,150);
  assert.ok(o.routeBalance(feed)[0].relayed > 0);
  assert.equal(o.routeBalance(feed)[0].delivered,0);
  assert.ok(o.routeBalance(finish)[0].delivered > 0);
  assert.equal(o.routeBalance(finish)[0].relayed,0);
  h1.depot = false;
  assert.equal(o.routeBalance(feed).length,0);
});

test('a stopped route decays to zero on the exact rolling-minute boundary', () => {
  const o=galaxy(), [a,b]=o.G.planets; want(b,a.good);
  const r=o.createRoute([a,b]);
  run(o,90);
  assert.ok(o.routeBalance(r)[0].delivered > 0);
  o.removeShip(r);
  assert.equal(o.fleetVerdict(r,o.routeBalance(r)), 'Needs a ship');
  run(o,61);
  assert.equal(o.routeBalance(r)[0].delivered,0);
  r.sold.push([o.G.t-60,a.good],[o.G.t-59.9,a.good]);
  assert.equal(o.routeBalance(r)[0].delivered,1);
});

test('fleet guidance distinguishes persistent pickup pressure, spare ships, and supply trouble; edits restart measurement', () => {
  const o=galaxy(), [a,b,c]=o.G.planets; want(b,a.good);
  const r=o.createRoute([a,b]);
  const verdict=()=>o.fleetVerdict(r,o.routeBalance(r));
  assert.equal(verdict(),'Measuring');
  function observations(waiting,busy,recallIdle) {
    o.G.t=60;
    r.fleetSamples=Array.from({length:60},(_,i)=>({t:i+1,waiting,busy,recallIdle,arrived:i%12===0}));
  }
  observations(true,true,false);
  assert.equal(verdict(),'Likely needs +1');
  observations(false,true,false);
  assert.equal(verdict(),'Keeping up'); // empty return trips alone do not justify recalling a ship
  o.addShip(r); assert.equal(verdict(),'Measuring');
  observations(false,false,true);
  assert.equal(verdict(),'Likely 1 spare');
  o.removeShip(r);
  o.G.crunch={p:a};
  observations(false,false,true);
  assert.equal(verdict(),'Supply limited');
  o.extendRoute(r,[c],false);
  assert.equal(verdict(),'Measuring');
});

test('busy and lightly loaded routes produce different fleet readings under real dispatch', () => {
  for (const scenario of [
    { ships: 1, start: 1140, accel: 3, demand: .95, verdict: 'Likely needs +1' },
    { ships: 1, start: 0, accel: 12, demand: .46, verdict: 'Keeping up' },
    { ships: 4, start: 0, accel: 12, demand: .46, verdict: 'Likely 1 spare' }
  ]) {
    const o = galaxy(), G = o.G, [a, b] = G.planets;
    a.r = b.r = 450;
    a.ang = 0; b.ang = 1.2; a.w = b.w = 0;
    G.t = G.sec = scenario.start; G.accel = scenario.accel;
    want(b, a.good, scenario.demand);
    const r = o.createRoute([a, b]);
    for (let i = 1; i < scenario.ships; i++) o.addShip(r);
    run(o, 120);
    assert.equal(o.fleetVerdict(r, o.routeBalance(r)), scenario.verdict);
  }
});
