// Depots as a hub: route 1 brings a good to a depot world, route 2 carries it on to a buyer that route 1 never visits.
// Case "hub buys too": the depot world itself also buys the good. Case "hub passes through": it does not.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1200, height: 800 } }), errs = []; pg.on('pageerror', e => errs.push(e.message));
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"></head><style>[hidden]{display:none!important}</style><body style="margin:0">' + html + '</body></html>');
  await pg.click('#start');
  const out = [];
  for (const hubBuys of [true, false]) out.push(await pg.evaluate(hubBuys => {
    document.getElementById('start').click(); __ol.manual = true; const o = __ol, G = o.G; G.credits = 5000; G.nextPlanetT = 1e9; G.nextRushT = 1e9;
    const [A, W, C, X] = G.planets, g = A.good;
    for (const q of G.planets) { for (const k of q.wants.slice()) { delete q.rate[k]; delete q.accD[k]; } q.wants = []; q.orders = {}; q.res = {}; }
    const want = (q, rate) => { q.wants = [g]; q.rate[g] = rate; q.accD[g] = 0; };
    const out = A.level * .5; want(C, .55 * out); if (hubBuys) want(W, .3 * out); // demand the seller can keep up with
    o.buildDepot(W); o.createRoute([A, W]); o.createRoute([W, C]);
    let sold = { W: 0, C: 0 }, peak = 0, lastW = 0, lastC = 0;
    for (let i = 0; i < 20 * 240; i++) { const w0 = W.orders[g] || 0, c0 = C.orders[g] || 0; o.step(0.05); peak = Math.max(peak, W.items.length);
      if ((W.orders[g] || 0) < w0) sold.W += w0 - (W.orders[g] || 0); if ((C.orders[g] || 0) < c0) sold.C += c0 - (C.orders[g] || 0); }
    return { hubBuys, soldAtHub: sold.W, soldAtFarBuyer: sold.C, farBuyerOpenOrders: C.orders[g] || 0, depotPeak: peak, sellerStock: A.stock };
  }, hubBuys));
  console.log(out.map(o => JSON.stringify(o)).join('\n')); console.log('errors', errs);
  const ok = out.every(o => o.soldAtFarBuyer >= 5 && o.farBuyerOpenOrders <= 3); console.log(ok ? 'pass: the far buyer is supplied through the depot in both cases' : 'FAIL: the far buyer is not supplied through the depot');
  await b.close(); process.exit(ok ? 0 : 1);
})();
