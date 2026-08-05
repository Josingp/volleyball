/* 좌석 배치도 공유 저장 API — Vercel Serverless Function
 * 저장 위치: 이 GitHub 저장소의 data/state.json (커밋으로 저장 → 커밋 이력이 곧 버전 기록)
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables):
 *   GH_TOKEN   : GitHub Fine-grained PAT (이 저장소 Contents: Read and write 권한)
 *   GH_REPO    : "소유자/저장소이름"  예) mcfly0803/seatmap_repo
 *   GH_BRANCH  : 저장 브랜치 (기본 main)
 *   SEATMAP_HIST_PW : 버전 기록 비밀번호 (기본 0429)
 *
 * GET  /api/state                       → 현재 공유 상태(data/state.json)
 * PUT  /api/state                       → 상태를 커밋으로 저장 (커밋 메시지에 요약 포함)
 * GET  /api/state?versions=1&pw=****    → 버전 목록(= data/state.json 커밋 이력, 최근 60개)
 * GET  /api/state?version=<sha>&pw=**** → 특정 커밋 시점의 전체 데이터
 */
const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO;
const GH_BRANCH = process.env.GH_BRANCH || 'main';
const PW = process.env.SEATMAP_HIST_PW || '0429';
const FILE = 'data/state.json';
const API = 'https://api.github.com';
const HDR = {
  Authorization: `Bearer ${GH_TOKEN}`,
  'User-Agent': 'seatmap-app',
  Accept: 'application/vnd.github+json',
};

async function readFile(ref) {
  const r = await fetch(`${API}/repos/${GH_REPO}/contents/${encodeURIComponent(FILE)}?ref=${encodeURIComponent(ref || GH_BRANCH)}`, { headers: HDR });
  if (r.status === 404) return { json: null, sha: null };
  if (!r.ok) throw new Error('gh-read-' + r.status);
  const j = await r.json();
  return { json: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')), sha: j.sha };
}

async function writeFile(obj, msg) {
  /* 동시 저장 충돌(409/422) 시 최신 sha로 1회 재시도 — 마지막 저장이 이김 */
  for (let i = 0; i < 2; i++) {
    const cur = await readFile();
    const r = await fetch(`${API}/repos/${GH_REPO}/contents/${encodeURIComponent(FILE)}`, {
      method: 'PUT', headers: HDR,
      body: JSON.stringify({
        message: msg,
        branch: GH_BRANCH,
        content: Buffer.from(JSON.stringify(obj)).toString('base64'),
        ...(cur.sha ? { sha: cur.sha } : {}),
      }),
    });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) {
      let t = ''; try { t = (await r.text()).slice(0, 140); } catch (e) {}
      /* 404 = 토큰에 쓰기 권한 없음/저장소·브랜치 불일치가 대부분 */
      throw new Error('gh-write-' + r.status + (r.status === 404 ? ' (토큰 Contents 쓰기 권한 또는 GH_REPO/브랜치 확인)' : '') + ' ' + t);
    }
  }
  throw new Error('gh-write-conflict');
}

export default async function handler(req, res) {
  if (!GH_TOKEN || !GH_REPO) { res.status(501).json({ error: 'github-not-configured' }); return; }
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.diag !== undefined) {
        /* 설정 자가진단: /api/state?diag=1 을 브라우저로 열어 확인 */
        const out = { GH_REPO: GH_REPO || null, GH_BRANCH: GH_BRANCH, token: GH_TOKEN ? '설정됨' : '없음' };
        const r1 = await fetch(`${API}/repos/${GH_REPO}`, { headers: HDR });
        out.repoStatus = r1.status;
        if (r1.ok) { const j = await r1.json(); out.defaultBranch = j.default_branch; out.canWrite = !!(j.permissions && j.permissions.push); }
        const r2 = await fetch(`${API}/repos/${GH_REPO}/branches/${encodeURIComponent(GH_BRANCH)}`, { headers: HDR });
        out.branchStatus = r2.status;
        if (out.repoStatus === 401) out.진단 = 'GH_TOKEN이 유효하지 않습니다. 토큰 값을 다시 확인하세요.';
        else if (out.repoStatus === 404) out.진단 = '저장소를 찾지 못했습니다. ① GH_REPO 값이 "아이디/저장소이름" 그대로인지, ② 토큰 발급 시 Repository access에서 이 저장소를 선택했는지 확인하세요.';
        else if (out.canWrite === false) out.진단 = '토큰에 쓰기 권한이 없습니다. 토큰의 Permissions → Contents를 "Read and write"로 다시 발급해 GH_TOKEN을 교체하세요.';
        else if (out.branchStatus === 404) out.진단 = '브랜치("' + GH_BRANCH + '")가 없습니다. 기본 브랜치가 "' + (out.defaultBranch || '?') + '"라면 환경변수 GH_BRANCH=' + (out.defaultBranch || 'master') + ' 를 추가하세요.';
        else out.진단 = '설정 정상으로 보입니다. 저장을 다시 시도해 보세요.';
        res.status(200).json(out); return;
      }
      if (q.versions !== undefined || q.version !== undefined) {
        if (q.pw !== PW) { res.status(403).json({ error: 'forbidden' }); return; }
        if (q.version !== undefined) {
          const f = await readFile(String(q.version));
          if (!f.json) { res.status(404).json({ error: 'not-found' }); return; }
          res.status(200).json({ venues: f.json.venues || null }); return;
        }
        const r = await fetch(`${API}/repos/${GH_REPO}/commits?path=${encodeURIComponent(FILE)}&sha=${encodeURIComponent(GH_BRANCH)}&per_page=60`, { headers: HDR });
        if (!r.ok) throw new Error('gh-log-' + r.status);
        const commits = await r.json();
        res.status(200).json({
          versions: commits.map(c => ({
            id: c.sha,
            t: new Date(c.commit.committer.date).getTime(),
            sum: c.commit.message,
          })),
        });
        return;
      }
      const f = await readFile();
      res.status(200).json(f.json || {}); return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const o = (typeof req.body === 'object' && req.body) ? req.body : JSON.parse(req.body || '{}');
      if (!o || !o.venues) { res.status(400).json({ error: 'bad-request' }); return; }
      const sk = o.venues.sk || {};
      const rv = (sk.rsv || []).reduce((a, e) => a + ((e.k || []).length), 0);
      const msg = `좌석 데이터: ${(sk.teams || []).length}팀 · 지정석 ${rv}석 · 사석변경 ${(sk.ov || []).length}건`;
      await writeFile(o, msg);
      res.status(200).json({ ok: true, updatedAt: o.updatedAt || Date.now() }); return;
    }
    res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
