// Run logs for the hosted game, so its difficulty can be tuned from real play. POST saves a run's record as it goes;
// GET lists the most recent runs, GET ?id=... returns one in full, GET ?latest=1 returns the newest.
// A record holds pacing only (what was bought when, orders and stock over time, what collapsed): nothing about the player.
// Uses the same Upstash Redis database as the leaderboard (see scores.js); without one it answers 503 and nothing is kept.
function findStore() {
  const env = process.env, keys = Object.keys(env);
  const urlKey = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'].find(k => env[k]) || keys.find(k => /REST(_API)?_URL$/.test(k) && /^https:\/\//.test(env[k]));
  if (!urlKey) return null;
  const tokenKey = [urlKey.replace(/URL$/, 'TOKEN')].find(k => env[k]) || keys.find(k => /REST(_API)?_TOKEN$/.test(k) && !/READ_ONLY/.test(k) && env[k]);
  return tokenKey ? { url: env[urlKey], token: env[tokenKey] } : null;
}
const INDEX = 'orbit-lanes:runs', RUN = 'orbit-lanes:run:', KEEP = 60, DAYS = 30, MAX_BYTES = 60000;

async function redis(cmds) {
  const st = findStore(), r = await fetch(st.url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { authorization: 'Bearer ' + st.token, 'content-type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('store answered ' + r.status);
  const out = await r.json(); for (const o of out) if (o.error) throw new Error(o.error);
  return out.map(o => o.result);
}
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (!findStore()) return res.status(503).json({ error: 'Run logs are not set up.' });
  try {
    if (req.method === 'GET') { const q = new URL(req.url || '/', 'http://x').searchParams;
      let id = q.get('id'); if (id && !/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ error: 'Bad id.' });
      if (!id && q.get('latest')) { const [ids] = await redis([['ZREVRANGE', INDEX, 0, 0]]); id = ids[0]; if (!id) return res.status(404).json({ error: 'No runs yet.' }); }
      if (id) { const [s] = await redis([['GET', RUN + id]]); return s ? res.status(200).json({ id, run: parse(s) }) : res.status(404).json({ error: 'No such run.' }); }
      const [ids] = await redis([['ZREVRANGE', INDEX, 0, 19]]); if (!ids.length) return res.status(200).json({ runs: [] });
      const [all] = await redis([['MGET', ...ids.map(i => RUN + i)]]);
      return res.status(200).json({ runs: ids.map((i, k) => { const r = parse(all[k]) || {}; return { id: i, started: r.started, seconds: r.seconds, delivered: r.delivered, ended: r.ended, version: r.version, collapsedAt: r.collapse && r.collapse.world }; }) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
    const b = typeof req.body === 'string' ? parse(req.body) || {} : req.body || {}, id = String(b.id || ''), run = b.run;
    if (!/^r[a-z0-9]{6,24}$/.test(id) || !run || typeof run !== 'object' || Array.isArray(run) || !Array.isArray(run.timeline)) return res.status(400).json({ error: 'Not a run record.' });
    const text = JSON.stringify(run); if (text.length > MAX_BYTES) return res.status(413).json({ error: 'Run record too large.' });
    const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim(), limit = 'orbit-lanes:runrate:' + ip;
    const [n] = await redis([['INCR', limit], ['EXPIRE', limit, 60]]);
    if (n > 20) return res.status(429).json({ error: 'Too many saves at once.' });
    await redis([['SET', RUN + id, text, 'EX', DAYS * 86400], ['ZADD', INDEX, Date.now(), id], ['ZREMRANGEBYRANK', INDEX, 0, -(KEEP + 1)]]);
    return res.status(200).json({ saved: id });
  } catch (e) { return res.status(502).json({ error: 'Run logs are unavailable right now.' }); }
};
