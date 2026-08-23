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
function parseZones(v, model){
  if (v == null) return [];
  const out = [];
  String(v).toUpperCase().split(/[,;/·\s]+/).forEach(tok => {
    tok = tok.replace(/구역|층/g, '').trim();
    if (!tok) return;
    let m = tok.match(/^([A-R])([12])$/);            /* H1, A2 */
    if (!m) { m = tok.match(/^([12])([A-R])$/); if (m) m = [m[0], m[2], m[1]]; } /* 1H → H1 */
    if (m && model.byZone[m[1] + m[2]]) { if(out.indexOf(m[1]+m[2])<0) out.push(m[1] + m[2]); }
  });
  return out;
}
let SEQ = 1;
function makePerson(row, model){
  return { id: 'p' + (SEQ++) + '_' + Math.random().toString(36).slice(2, 7),
    team: String(row['팀'] || '').trim(),
    rep: String(row['대표자명'] || row['대표자'] || '').trim(),
    name: String(row['참석자 이름'] || row['이름'] || row['참석자'] || '').trim(),
    phone: String(row['연락처'] || '').trim(),
    fl: parseFloor(row['층수'] || row['층']),
    zones: parseZones(row['구역지정'] || row['구역'], model),
    con: parseBool(row['연석여부'] || row['연석']),
    vip: parseBool(row['VIP 여부'] || row['VIP'] || row['VIP여부']),
    okY: parseBool(row['시야제한석 가능'] || row['시야제한석 앉기 가능여부'] || row['시야제한'] || row['시야']) };
}

/* ── 후보 좌석 ─────────────────────────────── */
function prefZoneIds(model, p){
  if (p.zones && p.zones.length) return p.zones.slice();
  if (p.fl) return model.floors[p.fl].slice();
  return model.floors['1층'].concat(model.floors['2층']);
}
function seatAllowed(model, p, s, taken, strictBlock){
  if (taken[s.key]) return false;
  if (s.b === 'x' || s.b === 'c') return false;
  if (s.b === 'y' && !p.okY) return false;
  const own = model.owner[s.key];
  if (own){ return own === p.team; }               /* 지정블록: 팀명 일치 시에만 */
  return !strictBlock;                             /* strictBlock=true면 팀 블록만 */
}
function hasTeamBlock(model, team){
  if (!team) return false;
  for (const k in model.owner) if (model.owner[k] === team) return true;
  return false;
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
function autoAssign(model, roster, order, seats0){
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
    const gk = p.team + '\u0001' + p.rep + (p.con ? '' : '\u0001' + p.id);   /* 비연석은 1인 그룹 */
    (gmap[gk] = gmap[gk] || []).push(p);
  });
  const groups = Object.values(gmap).map(members => {
    members.sort((a, b) => (idx[a.id] || 0) - (idx[b.id] || 0));
    return { members, vip: members.some(m => m.vip), first: Math.min.apply(null, members.map(m => idx[m.id] || 0)) };
  });
  groups.sort((a, b) => (b.vip - a.vip) || (a.first - b.first));   /* VIP 그룹 먼저, 이후 큐 순서 */

  groups.forEach(g => {
    const rep0 = g.members[0];
    const need = g.members.length;
    const zids = prefZoneIds(model, rep0);
    const teamBlock = hasTeamBlock(model, rep0.team);
    /* 그룹 공통 허용 좌석(모든 멤버 조건 충족: okY는 전원 가능해야 y 포함) */
    const allOkY = g.members.every(m => m.okY);
    const gp = Object.assign({}, rep0, { okY: allOkY });
    const passes = teamBlock ? [true, false] : [false];   /* 1차: 팀 블록만 → 2차: 일반 좌석 */
    let placed = [];
    for (const strict of passes){
      if (placed.length >= need) break;
      for (const zid of zids){
        if (placed.length >= need) break;
        const zone = model.byZone[zid]; if (!zone) continue;
        const allowed = new Set(zone.seats.filter(s => seatAllowed(model, gp, s, taken, strict)).map(s => s.key));
        if (!allowed.size) continue;
        let runs = runsInZone(zone, allowed);
        if (need - placed.length > 1 && g.members.length > 1){
          /* 정확히 들어가는 런 우선: r 낮은 순 → 남는 자리 적은 순 */
          const fit = runs.filter(rn => rn.length >= need - placed.length)
                          .sort((a, b) => (a[0].r - b[0].r) || ((a.length) - (b.length)) || (a[0].c - b[0].c));
          if (fit.length){
            fit[0].slice(0, need - placed.length).forEach(s => placed.push(s));
            continue;
          }
          /* 분할: 앞열부터 런을 이어붙임 */
          runs.sort((a, b) => (a[0].r - b[0].r) || (a[0].c - b[0].c));
          for (const rn of runs){
            for (const s of rn){ if (placed.length < need && !placed.some(q=>q.key===s.key)) placed.push(s); }
            if (placed.length >= need) break;
          }
          if (placed.length >= need && g.members.length > 1)
            warnings.push('연석 분할: ' + rep0.team + ' ' + rep0.rep + ' ' + need + '명 — 한 줄로 못 붙어 나눠 앉음');
        } else {
          /* 1인: 앞열·앞번호 우선 */
          const one = zone.seats.filter(s => allowed.has(s.key)).sort((a, b) => (a.r - b.r) || (a.c - b.c))[0];
          if (one) placed.push(one);
        }
      }
      if (strict && placed.length < need && placed.length > 0 && teamBlock){
        warnings.push('블록 부족: ' + rep0.team + ' ' + rep0.rep + ' — 팀 지정블록 잔여가 모자라 일반 좌석으로 이어서 배정');
      }
    }
    if (placed.length < need){
      warnings.push('미배정 ' + (need - placed.length) + '명: ' + rep0.team + ' ' + rep0.rep + ' (' +
        g.members.slice(placed.length).map(m => m.name).join(', ') + ') — 조건에 맞는 좌석 부족');
    }
    placed.slice(0, need).forEach((s, i) => { const m = g.members[i]; seatOf[m.id] = s.key; taken[s.key] = m.id; });
  });
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
    if (own && own !== p.team) errs.push(p.name + ': ' + own + ' 지정블록 좌석에 배정됨 (' + s.zid + ' ' + s.n + '번)');
  }
  return errs;
}

return { buildModel, makePerson, parseBool, parseFloor, parseZones, prefZoneIds,
         seatAllowed, runsInZone, autoAssign, validateAssign };
});
