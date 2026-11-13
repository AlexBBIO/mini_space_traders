// Leaderboard for the hosted game. GET returns the top runs; POST adds one.
// There are two kinds of board: one for all time, and one for each day's galaxy (the game deals everyone the same galaxy on a given UTC day).
// GET /api/scores?day=YYYY-MM-DD answers { top, day, daily }; without a day it uses today's. A POST that names its day lands on both boards.
// Scores live in a Redis sorted set reached over the Upstash REST API, using the environment variables that
// Vercel's Upstash integration sets on the project. Without them the endpoint answers 503 and the game says so.
// GET /api/scores?debug=1 reports which variables it found (names only, never values), for diagnosing a missing board.
function findStore() { // the integration's variable names depend on the prefix chosen when the database was connected, so look for any REST url and token pair
  const env = process.env, keys = Object.keys(env);
  const urlKey = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'].find(k => env[k]) || keys.find(k => /REST(_API)?_URL$/.test(k) && /^https:\/\//.test(env[k]));
  if (!urlKey) return null;
  const tokenKey = [urlKey.replace(/URL$/, 'TOKEN')].find(k => env[k]) || keys.find(k => /REST(_API)?_TOKEN$/.test(k) && !/READ_ONLY/.test(k) && env[k]);
  return tokenKey ? { url: env[urlKey], token: env[tokenKey], urlKey, tokenKey } : null;
}
const KEY = 'orbit-lanes:scores', DAY = 'orbit-lanes:day:', KEEP = 500, SHOW = 20, DAYS_KEPT = 30, MS_DAY = 86400000;
const dayOf = ms => new Date(ms).toISOString().slice(0, 10), isDay = d => /^\d{4}-\d\d-\d\d$/.test(d);
const board = (key) => ['ZREVRANGE', key, 0, SHOW - 1, 'WITHSCORES'];

async function redis(cmds) {
  const st = findStore(), r = await fetch(st.url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { authorization: 'Bearer ' + st.token, 'content-type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('store answered ' + r.status);
  const out = await r.json(); for (const o of out) if (o.error) throw new Error(o.error);
  return out.map(o => o.result);
}
function rows(flat) { // ZREVRANGE ... WITHSCORES comes back as [member, score, member, score, ...]
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { const m = JSON.parse(flat[i]); out.push({ name: m.n, delivered: +flat[i + 1], seconds: m.s, at: m.t }); } catch (e) {} }
  return out;
}
const clean = name => String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const store = findStore();
  if (req.method === 'GET' && /[?&]debug=1/.test(req.url || '')) { // names only: enough to see what the project was given, without exposing anything secret
    const related = Object.keys(process.env).filter(k => /KV|REDIS|UPSTASH|POSTGRES|DATABASE|BLOB|EDGE_CONFIG|SUPABASE|NEON|MONGO|STORAGE/i.test(k)).sort(); let reachable = null;
    if (store) { try { await redis([['PING']]); reachable = true; } catch (e) { reachable = false; } }
    const help = store ? (reachable ? 'The leaderboard is connected.' : 'The database variables are set but the database did not answer. Check that it still exists and that the token is the read-write one.')
      : related.some(k => /KV|UPSTASH/i.test(k)) ? 'Some database variables are here, but not a REST url and token pair. The leaderboard needs an Upstash for Redis database: its variables end in REST_API_URL and REST_API_TOKEN.'
      : related.length ? 'This deployment has storage variables, but none from Upstash for Redis, which is the kind the leaderboard uses.'
      : 'No database variables reached this deployment. Either no Upstash for Redis database is connected to this project for this environment, or it was connected after this deployment was built: variables only reach deployments made afterwards, so redeploy.';
    return res.status(200).json({ configured: !!store, using: store ? [store.urlKey, store.tokenKey] : null, storeReachable: reachable, relatedVariableNames: related,
      deployment: { environment: process.env.VERCEL_ENV || null, commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null }, help });
  }
  if (!store) return res.status(503).json({ error: 'The leaderboard is not set up yet.' });
  try {
    const now = Date.now();
    if (req.method === 'GET') { const asked = new URL(req.url || '/', 'http://x').searchParams.get('day'), day = asked && isDay(asked) ? asked : dayOf(now);
      const [flat, dflat] = await redis([board(KEY), board(DAY + day)]); return res.status(200).json({ top: rows(flat), day, daily: rows(dflat) }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const name = clean(b.name), delivered = Math.floor(+b.delivered), seconds = Math.floor(+b.seconds);
    if (!name) return res.status(400).json({ error: 'Enter a name.' });
    // A run of a day's galaxy names its day. The player's clock decides which galaxy they were dealt, so a day either side of the server's is accepted.
    const day = b.day == null ? null : String(b.day);
    if (day && !(isDay(day) && [-1, 0, 1].some(k => dayOf(now + k * MS_DAY) === day))) return res.status(400).json({ error: 'That day’s board has closed.' });
    // The score is reported by the player's browser, so this only rejects the obviously impossible: no run delivers more than about two units a second.
    if (!(delivered >= 0) || !(seconds >= 20 && seconds <= 36000) || delivered > seconds * 2 + 20) return res.status(400).json({ error: 'That score does not look like a real run.' });
    const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim(), limit = 'orbit-lanes:rate:' + ip;
    const [n] = await redis([['INCR', limit], ['EXPIRE', limit, 60]]);
    if (n > 6) return res.status(429).json({ error: 'Too many scores at once. Wait a minute and try again.' });
    const member = JSON.stringify({ n: name, s: seconds, t: Date.now(), r: Math.random().toString(36).slice(2, 8) });
    const cmds = [['ZADD', KEY, delivered, member], ['ZREMRANGEBYRANK', KEY, 0, -(KEEP + 1)]], shown = day || dayOf(now);
    if (day) cmds.push(['ZADD', DAY + day, delivered, member], ['ZREMRANGEBYRANK', DAY + day, 0, -(KEEP + 1)], ['EXPIRE', DAY + day, DAYS_KEPT * 86400]); // a day's board is kept for a month
    const at = cmds.length; cmds.push(['ZREVRANK', day ? DAY + day : KEY, member], board(KEY), board(DAY + shown)); // the rank is on the day's board for a daily run
    const out = await redis(cmds);
    return res.status(200).json({ rank: out[at] == null ? null : out[at] + 1, top: rows(out[at + 1]), day: shown, daily: rows(out[at + 2]) });
  } catch (e) { return res.status(502).json({ error: 'The leaderboard is unavailable right now.' }); }
};
