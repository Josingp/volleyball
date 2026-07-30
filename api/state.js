// 공유 저장소 API — Upstash Redis(REST) 사용, 외부 의존성 없음
const KEY = 'volleyball:seatmap:v1';

function envKV() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(cmd, e) {
  const r = await fetch(e.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + e.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  const j = await r.json();
  return j.result;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const e = envKV();
  if (!e) { res.status(404).json({ error: 'kv-not-configured' }); return; }
  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', KEY], e);
      res.status(200).json(v ? JSON.parse(v) : {});
    } else if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      if (!body || typeof body !== 'object' || !body.venues) { res.status(400).json({ error: 'bad-body' }); return; }
      const s = JSON.stringify(body);
      if (s.length > 900000) { res.status(413).json({ error: 'too-large' }); return; }
      await redis(['SET', KEY, s], e);
      res.status(200).json({ ok: true, updatedAt: body.updatedAt || Date.now() });
    } else { res.setHeader('Allow', 'GET, PUT'); res.status(405).end(); }
  } catch (err) { res.status(500).json({ error: String((err && err.message) || err) }); }
};
