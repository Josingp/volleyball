/* 좌석 배정 코어 로직 — assign.html에서 사용, node 테스트 가능(UMD)
   좌석 키: "zid#r_c" · 상태: o(가능) y(시야제한) x(사석) c(카메라)
   지정블록(rsv): note가 팀명과 같으면 그 팀 전용, 다르면 배정 금지 */
(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AssignCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';

function buildModel(v, rsvList){
  const zones = [], seatsByKey = {}, byZone = {};
  v.zones.forEach(z => {
    const seats = z.s.split(';').map(t => {
      const p = t.split(',');
      return { zid: z.id, r: +p[0], c: +p[1], n: +p[2], b: p[3], key: z.id + '#' + p[0] + '_' + p[1] };
    });
    const info = { id: z.id, fl: z.fl, nR: z.nR, nC: z.nC, seats };
    zones.push(info); byZone[z.id] = info;
    seats.forEach(s => { seatsByKey[s.key] = s; });
  });
  const owner = {};                       /* key -> 지정블록 팀명 */
  (rsvList || v.rsv || []).forEach(e => (e.k || []).forEach(kk => { owner[e.zid + '#' + kk] = e.note || ''; }));
  const floorOf = z => z.fl === 'L' ? '1층' : '2층';
  return { zones, byZone, seatsByKey, owner, floorOf,
           floors: { '1층': zones.filter(z => z.fl === 'L').map(z => z.id),
                     '2층': zones.filter(z => z.fl === 'U').map(z => z.id) } };
}

/* ── 입력 정규화 ─────────────────────────────── */
function parseBool(v){
  if (v === true) return true; if (v == null) return false;
  const s = String(v).trim().toUpperCase();
  return ['O','Y','YES','TRUE','1','예','가능','ㅇ','V'].indexOf(s) >= 0;
}
function parseFloor(v){
  if (v == null) return '';
  const s = String(v).trim();
  if (/1/.test(s) || /^L$/i.test(s)) return '1층';
  if (/2/.test(s) || /^U$/i.test(s)) return '2층';
  return '';
}
const RING1 = ['G1','H1','I1','J1'];                                     /* 1층 수납식 좌→우 */
const RING2 = ['G2','H2','I2','J2','K2','L2','M2','N2','O2','P2','A2','B2','C2','D2','E2','F2']; /* 2층 링 순서 */
function zoneTok(tok, model){
  tok = tok.replace(/구역|층/g, '').trim();
  if (!tok) return null;
  let m = tok.match(/^([A-R])([12])$/);
  if (!m) { m = tok.match(/^([12])([A-R])$/); if (m) m = [m[0], m[2], m[1]]; }
  return (m && model.byZone[m[1] + m[2]]) ? (m[1] + m[2]) : null;
}
function expandRange(a, b){
  for (const ring of [RING1, RING2]){
    const i = ring.indexOf(a), j = ring.indexOf(b);
    if (i < 0 || j < 0) continue;
    if (ring === RING1) { const lo=Math.min(i,j), hi=Math.max(i,j); return ring.slice(lo, hi+1); }
    /* 2층 링: 짧은 쪽 방향으로 */
    const n = ring.length, fwd = (j - i + n) % n, bwd = (i - j + n) % n, out = [];
    if (fwd <= bwd) for (let k = 0; k <= fwd; k++) out.push(ring[(i + k) % n]);
    else for (let k = 0; k <= bwd; k++) out.push(ring[(i - k + n) % n]);
    return out;
  }
  return [a, b];
}
function parseZones(v, model){
  if (v == null) return [];
  const out = [], push = z => { if (z && out.indexOf(z) < 0) out.push(z); };
  const parts = String(v).toUpperCase().split(/[,;/·]+/);
  parts.forEach(part => {
    part = part.replace(/([A-R]\s*[12])\s*~\s*([A-R]\s*[12])/g, (mm, a, b) => {
      const za = zoneTok(a, model), zb = zoneTok(b, model);
      if (za && zb) { expandRange(za, zb).forEach(push); return ' '; }
      return mm.replace('~', ' ');
    });
    part.split(/[\s~]+/).forEach(t => push(zoneTok(t, model)));
  });
  return out;
}
let SEQ = 1;
function pickCol(row, needles){                      /* 열 제목 정규화(공백·줄바꿈 제거) 후 부분 일치 */
  const ks = Object.keys(row);
  for (const nd of needles){
    for (const k of ks){
      const nk = k.replace(/[\s\r\n]+/g, '');
      if (nk === nd || nk.indexOf(nd) === 0 || nk.indexOf(nd) >= 0) return row[k];
    }
  }
  return '';
}
function makePerson(row, model){
  return { id: 'p' + (SEQ++) + '_' + Math.random().toString(36).slice(2, 7),
    team: String(pickCol(row, ['팀']) || '').trim(),
    rep: String(pickCol(row, ['대표자']) || '').trim(),
    name: String(pickCol(row, ['참석자이름', '이름', '참석자']) || '').trim(),
    phone: String(pickCol(row, ['연락처', '전화']) || '').trim(),
    fl: parseFloor(pickCol(row, ['층수', '층'])),
    zones: parseZones(pickCol(row, ['구역지정', '구역']), model),
    con: parseBool(pickCol(row, ['연석'])),
    vip: parseBool(pickCol(row, ['VIP'])),
    okY: parseBool(pickCol(row, ['시야'])) };
}

/* ── 후보 좌석 ─────────────────────────────── */
function prefZoneIds(model, p){
  if (p.zones && p.zones.length) return p.zones.slice();
  if (p.fl) return model.floors[p.fl].slice();
  return model.floors['1층'].concat(model.floors['2층']);
}
function normT(x){ return String(x || '').replace(/\s+/g, '').toUpperCase(); }
function teamMatchesBlock(team, note){
  const a = normT(team), b = normT(note);
  if (!a || !b) return false;
  return a === b || b.indexOf(a) === 0 || a.indexOf(b) === 0;   /* '수퍼스'→수퍼스 VIP·유료 */
}
function seatAllowed(model, p, s, taken, strictBlock){
  if (taken[s.key]) return false;
  if (s.b === 'x' || s.b === 'c') return false;
  if (s.b === 'y' && !p.okY) return false;
  const own = model.owner[s.key];
  if (own){ return teamMatchesBlock(p.team, own); }   /* 지정블록: 대분류(팀) 매칭 시에만 */
  return !strictBlock;                                /* strictBlock=true면 팀 블록만 */
}
function hasTeamBlock(model, team){
  if (!team) return false;
  for (const k in model.owner) if (teamMatchesBlock(team, model.owner[k])) return true;
  return false;
}
function teamBlockZones(model, team){                 /* 팀 블록이 있는 구역 목록 */
  const zs = [];
  for (const k in model.owner){
    if (teamMatchesBlock(team, model.owner[k])){
      const zid = k.split('#')[0];
      if (zs.indexOf(zid) < 0) zs.push(zid);
    }
  }
  return zs;
}

/* 한 구역에서 연속 c 구간(런) 찾기 — allowedSet: Set(seatKey) */
function runsInZone(zone, allowedSet){
  const runs = [];
  const rows = {};
  zone.seats.forEach(s => { if (allowedSet.has(s.key)) (rows[s.r] = rows[s.r] || []).push(s); });
  Object.keys(rows).forEach(r => {
    const arr = rows[r].sort((a, b) => a.c - b.c);
    let cur = [arr[0]];
    for (let i = 1; i < arr.length; i++){
      if (arr[i].c === arr[i - 1].c + 1) cur.push(arr[i]);
      else { runs.push(cur); cur = [arr[i]]; }
    }
    runs.push(cur);
  });
  return runs;   /* [[seat,...], ...] */
}

/* ── 자동 배정 ─────────────────────────────── */
function autoAssign(model, roster, order, seats0, opts){
  opts = opts || {}; const allowFree = !!opts.allowFree, pin = !!opts.pin;
  const seatOf = {};                                   /* personId -> seatKey */
  const taken = {};                                    /* seatKey -> personId */
  for (const pid in seats0){ seatOf[pid] = seats0[pid]; taken[seats0[pid]] = pid; }
  const warnings = [];
  const byId = {}; roster.forEach(p => byId[p.id] = p);
  const idx = {}; (order || roster.map(p => p.id)).forEach((id, i) => idx[id] = i);
  const todo = roster.filter(p => !seatOf[p.id] && p.name);

  /* 그룹: 팀+대표자, 연석=Y 인원끼리 한 묶음 */
  const gmap = {};
  todo.forEach(p => {
    const gk = p.team + '\u0001' + p.rep + '\u0001' + (p.fl||'') + '|' + p.zones.join(',') + (p.con ? '' : '\u0001' + p.id);   /* 비연석은 1인 그룹 */
    (gmap[gk] = gmap[gk] || []).push(p);
  });
  const groups = Object.values(gmap).map(members => {
    members.sort((a, b) => (idx[a.id] || 0) - (idx[b.id] || 0));
    return { members, vip: members.some(m => m.vip), first: Math.min.apply(null, members.map(m => idx[m.id] || 0)) };
  });
  groups.sort((a, b) => (b.vip - a.vip) || (b.members.length - a.members.length) || (a.first - b.first));   /* VIP → 큰 그룹 → 큐 순서 */

  /* 한 구역 안에서 need명을 앞열부터 붙여 뽑기 (한 줄 연속 우선, 안 되면 앞열부터 행 단위로 이어붙임) */
  function pickInZone(zone, allowed, need){
    if (allowed.size < need) return null;
    const runs = runsInZone(zone, allowed);
    const fit = runs.filter(rn => rn.length >= need)
                    .sort((a, b) => (a[0].r - b[0].r) || (a.length - b.length) || (a[0].c - b[0].c));
    if (fit.length) return fit[0].slice(0, need);
    runs.sort((a, b) => (a[0].r - b[0].r) || (a[0].c - b[0].c));
    const out = [];
    for (const rn of runs){ for (const x of rn){ if (out.length < need) out.push(x); } if (out.length >= need) break; }
    return out.length >= need ? out : null;
  }
  groups.forEach(g => {
    const rep0 = g.members[0];
    const need = g.members.length;
    const zids = prefZoneIds(model, rep0);
    const teamBlock = hasTeamBlock(model, rep0.team);
    const allOkY = g.members.every(m => m.okY);
    const gp = Object.assign({}, rep0, { okY: allOkY });
    const gLabel = (rep0.team || '팀없음') + (rep0.rep ? ' ' + rep0.rep : '') + (rep0.zones.length ? ' [' + rep0.zones.join(',') + ']' : '');
    /* 구역 목록에서 '그룹 전원이 한 구역에' 들어가는 첫 구역을 찾아 통째 배치 */
    const tryZones = (zoneList, strict) => {
      for (const zid of zoneList){
        const zone = model.byZone[zid]; if (!zone) continue;
        const all = zone.seats.filter(x => seatAllowed(model, gp, x, taken, strict));
        let pick = null;
        if (allOkY){                                     /* 시야제한 OK 인원은 시야제한석 위주로 먼저 */
          const ySet = new Set(all.filter(x => x.b === 'y').map(x => x.key));
          pick = pickInZone(zone, ySet, need);
        }
        if (!pick) pick = pickInZone(zone, new Set(all.map(x => x.key)), need);
        if (pick) return { zid, pick };
      }
      return null;
    };
    let hit = null;
    if (teamBlock) hit = tryZones(zids, true);
    if (!hit && allowFree) hit = tryZones(zids, false);
    if (!hit && teamBlock && !pin){
      /* 지정 구역에 못 앉으면: 팀 블록이 있는 다른 구역 중 '남은 자리가 가장 딱 맞는' 구역으로 통째 이동 */
      const extra = teamBlockZones(model, rep0.team).filter(z => zids.indexOf(z) < 0);
      const scored = extra.map(zid => {
        const zone = model.byZone[zid]; if (!zone) return null;
        const cnt = zone.seats.filter(x => seatAllowed(model, gp, x, taken, true)).length;
        return cnt >= need ? { zid, cnt } : null;
      }).filter(Boolean).sort((a, b) => a.cnt - b.cnt);
      hit = tryZones(scored.map(x => x.zid), true);
      if (hit) warnings.push('구역 변경: ' + gLabel + ' ' + need + '명 — 지정 구역에 자리가 없어 ' + hit.zid + ' 구역으로 함께 이동');
    }
    if (!hit && allowFree && !pin)
      hit = tryZones(prefZoneIds(model, Object.assign({}, rep0, { zones: [] })), false);
    if (!hit){
      if (!teamBlock && !allowFree)
        warnings.push('미배정 ' + need + '명: ' + gLabel + ' — 대분류 "' + (rep0.team || '(빈칸)') + '"에 해당하는 지정블록이 없습니다 (자유석 배정 금지 상태)');
      else
        warnings.push('미배정 ' + need + '명: ' + gLabel + ' — 한 구역에 붙여 앉을 자리가 없어 전원 미배정');
      return;
    }
    hit.pick.forEach((x, i) => { const m = g.members[i]; seatOf[m.id] = x.key; taken[x.key] = m.id; });
  });
  /* 같은 경고 합치기 */
  const cnt = {}; warnings.forEach(w => cnt[w] = (cnt[w] || 0) + 1);
  warnings.length = 0;
  Object.keys(cnt).forEach(w => warnings.push(w + (cnt[w] > 1 ? '  ×' + cnt[w] : '')));
  return { seatOf, warnings };
}

function validateAssign(model, roster, seatOf){
  const errs = [], seen = {};
  const byId = {}; roster.forEach(p => byId[p.id] = p);
  for (const pid in seatOf){
    const key = seatOf[pid], p = byId[pid], s = model.seatsByKey[key];
    if (!p) continue;
    if (!s){ errs.push(p.name + ': 존재하지 않는 좌석 ' + key); continue; }
    if (seen[key]) errs.push('중복 배정 ' + key + ': ' + byId[seen[key]].name + ' / ' + p.name);
    seen[key] = pid;
    if (s.b === 'x') errs.push(p.name + ': 사석에 배정됨 (' + s.zid + ' ' + s.n + '번)');
    if (s.b === 'c') errs.push(p.name + ': 카메라석에 배정됨 (' + s.zid + ' ' + s.n + '번)');
    if (s.b === 'y' && !p.okY) errs.push(p.name + ': 시야제한 불가인데 시야제한석 (' + s.zid + ' ' + s.n + '번)');
    const own = model.owner[key];
    if (own && !teamMatchesBlock(p.team, own)) errs.push(p.name + ': ' + own + ' 지정블록 좌석에 배정됨 (' + s.zid + ' ' + s.n + '번)');
  }
  return errs;
}

return { buildModel, makePerson, parseBool, parseFloor, parseZones, prefZoneIds,
         seatAllowed, runsInZone, autoAssign, validateAssign, teamMatchesBlock, teamBlockZones };
});
