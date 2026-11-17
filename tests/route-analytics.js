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
    getContext: () => ({ setTransform: noop, measureText: text => ({ width: text.length * 6 }) }), getBoundingClientRect: () => ({ width: 1280, height: 800 }),
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

test('a docked freighter loads for the adjacent buyer before flying empty to another pickup', () => {
  for (const heading of [1, -1]) {
    const o = galaxy(), [buyer, seller, otherPickup] = o.G.planets;
    want(buyer, seller.good, 0);
    want(seller, otherPickup.good, 0);
    buyer.orders[seller.good] = 2;
    seller.orders[otherPickup.good] = 1;
    seller.stock = 4;
    otherPickup.stock = 1;

    const stops = [buyer, seller, otherPickup];
    const route = o.createRoute(heading === 1 ? stops : stops.reverse());
    const [ship] = o.shipsOn(route);
    Object.assign(ship, { at: seller, idx: 1, prev: 1, dir: heading });
    run(o, 1);
    assert.deepEqual(Array.from(ship.cargo, unit => unit.to.name), [buyer.name, buyer.name]);
    assert.equal(seller.stock, 2);
    assert.equal(buyer.res[seller.good], 2);
    assert.equal(route.stops[ship.idx], buyer);
    run(o, 30);
    assert.equal(buyer.orders[seller.good], 0);
    assert.equal(buyer.res[seller.good], 0);
  }
});

test('an empty ship loads for a buyer one stop away before a buyer two stops away', () => {
  const o = galaxy(), [near, seller, middle, far] = o.G.planets;
  for (const buyer of [near, far]) {
    want(buyer, seller.good, 0);
    buyer.orders[seller.good] = 1;
  }
  seller.stock = 1;
  seller.accS = 0;
  const route = o.createRoute([seller, middle, far]);
  o.extendRoute(route, [near], true);
  run(o, 1);
  const [ship] = o.shipsOn(route);
  assert.equal(ship.cargo[0].to.name, near.name);
  assert.equal(far.res[seller.good] || 0, 0);
});

test('an empty ship heads for the nearest uncovered pickup on either side of its stop', () => {
  const o = galaxy(), [near, buyer, middle, far] = o.G.planets;
  for (const seller of [near, far]) {
    want(buyer, seller.good, 0);
    buyer.orders[seller.good] = 1;
    seller.stock = 1;
  }
  const route = o.createRoute([buyer, middle, far]);
  o.extendRoute(route, [near], true);
  run(o, 1);
  const [ship] = o.shipsOn(route);
  assert.equal(ship.state, 'fly');
  assert.equal(route.stops[ship.idx], near);
  run(o, 45);
  assert.equal(buyer.orders[near.good], 0);
});

test('a through freighter picks up next-stop orders in its direction and keeps its original delivery', () => {
  const o = galaxy(), [start, seller, next, terminus] = o.G.planets;
  want(terminus, start.good, 0);
  terminus.orders[start.good] = 1;
  start.stock = 1;
  for (const buyer of [start, next]) {
    want(buyer, seller.good, 0);
    buyer.orders[seller.good] = 1;
  }
  seller.stock = 2;
  const route = o.createRoute([start, seller, next, terminus]), [ship] = o.shipsOn(route);
  for (let i = 0; i < 800 && !(ship.state === 'fly' && ship.prev === 1); i++) o.step(.05);
  assert.equal(ship.idx, 2);
  assert.deepEqual(Array.from(ship.cargo, unit => unit.to.name), [terminus.name, next.name]);
  assert.equal(start.res[seller.good] || 0, 0);
  run(o, 45);
  assert.equal(terminus.orders[start.good], 0);
  assert.equal(next.orders[seller.good], 0);
});

test('one available unit at the next stop needs only one freighter even if more orders are open', () => {
  const o = galaxy(), [seller, buyer] = o.G.planets;
  want(buyer, seller.good, 0);
  want(seller, buyer.good, 0);
  buyer.orders[seller.good] = 8;
  seller.stock = 1;
  seller.accS = 0;
  const route = o.createRoute([seller, buyer]);
  o.addShip(route);
  const [loading, standby] = o.shipsOn(route);
  loading.dockT = .6;
  run(o, 1);
  assert.equal(loading.cargo.length, 1);
  assert.equal(buyer.res[seller.good], 1);
  assert.equal(standby.at, buyer);
});

function fixedStops(o) {
  const stops = o.G.planets;
  stops.forEach((p, i) => {
    p.r = 600; p.ang = .3 * i; p.w = 0;
    p.accS = -100; // observe only the freight specified by the case
  });
  return stops;
}

test('a through ship saves two slots for two short loads and carries one long load alongside them', () => {
  const o = galaxy(), [a,b,c,d] = fixedStops(o);
  o.G.cap = 3;
  for (const [from, to, n] of [[a,d,3], [b,c,2], [c,d,2]]) {
    want(to, from.good, 0); to.orders[from.good] = n; from.stock = n;
  }
  const r = o.createRoute([a,b,c,d]), [s] = o.shipsOn(r);
  run(o, 1);
  assert.equal(s.cargo.length, 1, 'load the spare slot for the far buyer');
  assert.equal(d.res[a.good], 1);
  assert.equal(c.res[b.good] || 0, 0, 'forecast pickups make no real reservation');
  for (let i = 0; i < 1200 && r.sold.length < 5; i++) o.step(.05);
  assert.equal(r.sold.length, 5);
  assert.equal(c.orders[b.good], 0);
  assert.equal(d.orders[c.good], 0);
});

test('a demand surge attracts a ship to the better-paying buyer at equal travel time', () => {
  const o = galaxy(), [west, source, east] = fixedStops(o);
  o.G.cap = 1; source.stock = 1;
  for (const buyer of [west,east]) { want(buyer, source.good, 0); buyer.orders[source.good] = 1; }
  o.G.rush = {p:west, g:source.good, until:100};
  const r = o.createRoute([source,east]); o.extendRoute(r,[west],true);
  run(o,1);
  assert.equal(o.shipsOn(r)[0].cargo[0].to.name, west.name);
  run(o,20);
  assert.equal(o.G.earned, 10);
});

test('distress from other goods attracts a pickup when the trips otherwise pay the same', () => {
  const o = galaxy(), [west, source, east, other] = fixedStops(o);
  o.G.cap = 1; source.stock = 1;
  for (const buyer of [west, east]) { want(buyer, source.good, 0); buyer.orders[source.good] = 1; }
  want(west, other.good, 0); west.orders[other.good] = 5;
  const route = o.createRoute([source, east]); o.extendRoute(route, [west], true);
  run(o, 1);
  assert.equal(o.shipsOn(route)[0].cargo[0].to, west);
});

for (const [scenario, farBacklog, nearBacklog, deliverFar] of [
  ['the booked buyer is still in distress', 5, 0, true],
  ['the booked buyer recovered in flight', 4, 0, false],
  ['the intermediate buyer also needs relief', 5, 5, false],
]) {
  test('a booked relief shipment reaches the appropriate buyer when ' + scenario, () => {
    const o = galaxy(), [source, near, far, other] = fixedStops(o);
    const g = source.good; o.G.cap = 1; source.stock = 1;
    for (const buyer of [near, far]) { want(buyer, g, 0); want(buyer, other.good, 0); }
    far.orders[g] = 1; far.orders[other.good] = 5;
    const route = o.createRoute([source, near, far]), [ship] = o.shipsOn(route);
    run(o, 1);
    assert.equal(ship.cargo[0].to, far); assert.equal(far.res[g], 1);
    near.orders[g] = 1; near.orders[other.good] = nearBacklog; far.orders[other.good] = farBacklog;
    run(o, 25);
    assert.equal(far.orders[g], deliverFar ? 0 : 1);
    assert.equal(near.orders[g], deliverFar ? 1 : 0);
    assert.equal(far.res[g], 0); assert.equal(o.G.delivered, 1);
  });
}

test('a world buys stock already dropped in its depot when it develops local demand', () => {
  const o = galaxy(), [a,hub,b] = fixedStops(o), g = a.good;
  o.G.credits = 1000;
  o.buildDepot(hub);
  want(b, g, 0); b.orders[g] = 1; a.stock = 2;
  const feed = o.createRoute([a,hub]), onward = o.createRoute([hub,b]);
  o.removeShip(onward);
  for (let i = 0; i < 800 && hub.items.length < 2; i++) o.step(.05);
  assert.equal(hub.items.length, 2);
  assert.equal(feed.handoffs.length, 2);
  o.removeRoute(onward);
  want(hub, g, 0);
  hub.purgeT = 0;
  run(o,5);
  assert.equal(hub.items.length, 2, 'keep stock for a local buyer even with no onward route');
  hub.accD[g] = 1;
  o.step(.05);
  assert.equal(hub.items.length, 1);
  assert.equal(hub.orders[g], 0);
  assert.equal(o.G.earned, 5);
  assert.equal(o.G.delivered, 1);
  assert.equal(feed.sold.length, 0);
  assert.equal(feed.handoffs.length, 2, 'local collection is not another shipment');
  run(o,2);
  assert.equal(o.G.earned, 5);
});

test('a local depot fills even a booked order and its inbound unit replenishes the depot', () => {
  const o = galaxy(), [a,hub] = fixedStops(o), g = a.good;
  want(hub,g,0); hub.orders[g] = 1; a.stock = 1;
  const r = o.createRoute([a,hub]);
  run(o,1);
  assert.equal(hub.res[g], 1);
  hub.depot = true; hub.items.push(g, g); hub.accD[g] = 1;
  o.step(.05);
  assert.equal(hub.res[g], 0);
  assert.equal(hub.orders[g], 0);
  assert.equal(o.G.earned, 11);
  assert.equal(hub.items.length, 0);
  assert.equal(o.shipsOn(r)[0].cargo[0].relay, true);
  run(o,20);
  assert.equal(hub.orders[g], 0);
  assert.equal(hub.res[g], 0);
  assert.equal(o.G.earned, 11);
  assert.equal(r.sold.length, 0);
  assert.equal(r.handoffs.length, 1);
  assert.deepEqual(Array.from(hub.items), [g]);
});

test('the distress premium ends with the delivery that clears the threshold', () => {
  const o = galaxy(), [a,hub] = fixedStops(o), g = a.good;
  hub.depot = true; hub.items.push(g,g);
  want(hub,g,0); hub.orders[g] = 6;
  o.G.rush = {p:hub,g,until:100};
  o.step(.05);
  assert.equal(o.G.earned, 40); // (4 + 6) × 2 + 2, then (4 + 5) × 2
  assert.equal(hub.orders[g], 4);
});

test('two ships at different suppliers can forecast the same buyer but only one books the order', () => {
  const o = galaxy(), [left, buyer, right] = fixedStops(o);
  right.good = left.good;
  left.stock = right.stock = 1;
  want(buyer, left.good, 0); buyer.orders[left.good] = 1;
  const route = o.createRoute([left, buyer, right]);
  o.addShip(route);
  run(o,1);
  assert.equal(buyer.res[left.good], 1);
  assert.equal(o.shipsOn(route).reduce((n,s) => n + s.cargo.length, 0), 1);
  run(o,20);
  assert.equal(route.sold.length, 1);
  assert.equal(left.stock + right.stock, 1);
});

test('a recalled freighter waits before it can fly again, and a fresh one does not', () => {
  const o = galaxy(), G = o.G, [a, b] = G.planets;
  want(b, a.good);
  const r = o.createRoute([a, b]);
  run(o, 5);
  o.removeShip(r); G.reserve = 1; // only the recalled freighter is left in the reserve
  o.addShip(r);
  const recalled = o.shipsOn(r)[0];
  assert.ok(recalled.dockT > 5, 'the recalled freighter went straight back to work');
  G.reserve = 1; o.addShip(r); // a second freighter, never recalled
  assert.ok(o.shipsOn(r)[1].dockT < 1, 'a fresh freighter was held back');
  a.stock = 2; b.orders[a.good] = 2; // work is waiting, and the fresh freighter is on the far side
  o.removeShip(r); // recalls the fresh one, so only the waiting freighter can take the load
  run(o, 4);
  assert.equal(recalled.state, 'dock');
  assert.equal(recalled.cargo.length, 0);
  run(o, 30);
  assert.ok(G.delivered > 0);
});

test('a bigger world can carry more open orders before it is in trouble', () => {
  const o = galaxy(), G = o.G, [small, mid, big] = G.planets;
  small.level = 1; mid.level = 2; big.level = 3;
  for (const p of [small, mid, big]) { const g = (p.good + 1) % 4; want(p, g, 0); p.orders[g] = 7; } // seven orders each, and no more arriving
  run(o, 5);
  assert.ok(small.over > 0 && mid.over > 0, 'six is the limit at levels 1 and 2');
  assert.equal(big.over, 0, 'a level 3 world is in trouble at seven orders');
  big.orders[big.wants[0]] = 8;
  run(o, 5);
  assert.ok(big.over > 0, 'eight is the limit at level 3');
});

test('orders stop arriving three above a world\'s limit', () => {
  const o = galaxy(), G = o.G, [mid, big] = G.planets;
  mid.level = 2; big.level = 3;
  for (const p of [mid, big]) want(p, (p.good + 1) % 4, 40);
  for (let i = 0; i < 400; i++) { o.step(.05); for (const p of G.planets) p.over = 0; }
  assert.equal(mid.orders[mid.wants[0]], 9);
  assert.equal(big.orders[big.wants[0]], 11);
});
