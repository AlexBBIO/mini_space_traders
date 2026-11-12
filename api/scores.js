// Leaderboard for the hosted game. GET returns the top runs; POST adds one.
// Scores live in a Redis sorted set reached over the Upstash REST API, using the environment variables that
// Vercel's Upstash integration sets on the project. Without them the endpoint answers 503 and the game hides the board.
const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'orbit-lanes:scores', KEEP = 500, SHOW = 20;

async function redis(cmds) {
  const r = await fetch(BASE.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmds) });
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
  if (!BASE || !TOKEN) return res.status(503).json({ error: 'The leaderboard is not set up yet.' });
  try {
    if (req.method === 'GET') { const [flat] = await redis([['ZREVRANGE', KEY, 0, SHOW - 1, 'WITHSCORES']]); return res.status(200).json({ top: rows(flat) }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const name = clean(b.name), delivered = Math.floor(+b.delivered), seconds = Math.floor(+b.seconds);
    if (!name) return res.status(400).json({ error: 'Enter a name.' });
    // The score is reported by the player's browser, so this only rejects the obviously impossible: no run delivers more than about two units a second.
    if (!(delivered >= 0) || !(seconds >= 20 && seconds <= 36000) || delivered > seconds * 2 + 20) return res.status(400).json({ error: 'That score does not look like a real run.' });
    const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim(), limit = 'orbit-lanes:rate:' + ip;
    const [n] = await redis([['INCR', limit], ['EXPIRE', limit, 60]]);
    if (n > 6) return res.status(429).json({ error: 'Too many scores at once. Wait a minute and try again.' });
    const member = JSON.stringify({ n: name, s: seconds, t: Date.now(), r: Math.random().toString(36).slice(2, 8) });
    const out = await redis([['ZADD', KEY, delivered, member], ['ZREMRANGEBYRANK', KEY, 0, -(KEEP + 1)], ['ZREVRANK', KEY, member], ['ZREVRANGE', KEY, 0, SHOW - 1, 'WITHSCORES']]);
    return res.status(200).json({ rank: out[2] == null ? null : out[2] + 1, top: rows(out[3]) });
  } catch (e) { return res.status(502).json({ error: 'The leaderboard is unavailable right now.' }); }
};
