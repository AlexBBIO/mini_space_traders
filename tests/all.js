// Runs every check in turn: that index.html is built from game.html, the simulation tests under Node, then each browser script.
// A script fails if it exits with an error, prints a line starting with FAIL, or reports a page error. `npm test` runs this.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), failed = [];
const built = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), body = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
if (!built.includes(body)) failed.push('index.html is not built from the current game.html: run node build.js');
const scripts = ['balance', 'stress', 'depot', 'stops', 'shape', 'daily', 'logging', 'leaderboard', 'runs', 'ui', 'bot', 'audio'].map(n => ['tests/' + n + '.js']);
for (const args of [['--test', 'tests/route-analytics.js'], ...scripts]) {
  const name = args[args.length - 1], t = Date.now(), r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const text = (r.stdout || '') + (r.stderr || '');
  const bad = r.status !== 0 ? 'exit ' + (r.status == null ? r.signal || 'timeout' : r.status) : /^FAIL/m.test(text) ? 'printed FAIL'
    : /^ERR |"errs":\[[^\]]|errors \[ *[^\] ]|"badCount":[1-9]/m.test(text) ? 'reported an error' : '';
  console.log((bad ? 'FAIL ' : 'pass ') + name + ' (' + Math.round((Date.now() - t) / 1000) + 's)' + (bad ? ': ' + bad : ''));
  if (bad) { failed.push(name); console.log(text.slice(-3000)); }
}
console.log(failed.length ? '\nFailed: ' + failed.join(', ') : '\nAll checks passed.');
process.exit(failed.length ? 1 : 0);
