// Public selection history travels with the board, so it survives runner/cache changes.
const WINDOW_DAYS = 7;
const normalizeKeyword = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const rowsOf = (board) => (Array.isArray(board?.topics) ? board.topics : []).flatMap(t => Array.isArray(t.rows) ? t.rows : []);
/*
 * 전날(KST) 중복 금지(2026-10-10 사장님 "전에 추천한 게 또 있으니 오늘도 똑같다고 안 본다 — 매일 전날과 중복 없이, 매일 새롭게").
 * 실측: 10/10 저녁 판 956개 중 604개가 전날 판과 겹쳤다(황금 612개 중 602개 — 직전 판 황금을 먼저 다시 싣는 구조).
 * 날짜별로 실린 말(history.days, 최근 3일)을 공개 판에 싣고, 어제 실린 말은 황금이어도 다시 싣지 않는다.
 * 같은 날 회차끼리는 이어 실어도 된다. 앱의 [새 키워드로 다시 올리기](--fresh)는 오늘 실린 말까지 막는다.
 */
const DAYS_KEPT = 3;
const kstDayOf = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

/** 날짜(KST)별로 실린 말 — 판의 history.days + 그 판의 행(판 시각의 날). 일자별 기록이 없던 옛 판은 이력의 마지막 시각 날짜로 대신한다. */
function shownByDay(board) {
  const days = new Map();
  const add = (day, keyword) => {
    const key = normalizeKeyword(keyword);
    if (!day || !key) return;
    if (!days.has(day)) days.set(day, new Set());
    days.get(day).add(key);
  };
  const recorded = board?.history?.days;
  if (recorded && typeof recorded === 'object' && !Array.isArray(recorded)) {
    for (const [day, list] of Object.entries(recorded)) for (const keyword of Array.isArray(list) ? list : []) add(day, keyword);
  } else {
    for (const entry of Array.isArray(board?.history?.entries) ? board.history.entries : []) {
      const time = Date.parse(entry?.lastShownAt);
      if (Number.isFinite(time)) add(kstDayOf(time), entry.keyword);
    }
  }
  const built = Date.parse(board?.builtAt);
  if (Number.isFinite(built)) for (const row of rowsOf(board)) add(kstDayOf(built), row.keyword);
  return days;
}

/** 이번 회차에 다시 싣지 않을 말 — 어제(KST) 실린 말 전부, fresh 면 오늘 이미 실린 말까지. */
function blockedKeywords(carried, builtAt, { fresh = false } = {}) {
  const at = Date.parse(builtAt);
  const days = shownByDay(carried);
  const blocked = new Set(days.get(kstDayOf(at - 86400000)) || []);
  if (fresh) for (const key of days.get(kstDayOf(at)) || []) blocked.add(key);
  return blocked;
}

function recentHistory(board, now = Date.now()) {
  const entries = Array.isArray(board?.history?.entries) ? board.history.entries : [];
  const history = new Map();
  for (const entry of [...entries, ...rowsOf(board).map(row => ({keyword:row.keyword,lastShownAt:board.builtAt}))]) {
    const key = normalizeKeyword(entry?.keyword);
    const time = Date.parse(entry?.lastShownAt);
    const age = now - time;
    if (!key || !Number.isFinite(age) || age < 0 || age >= WINDOW_DAYS * 86400000) continue;
    if (!history.has(key) || time > Date.parse(history.get(key))) history.set(key,new Date(time).toISOString());
  }
  return history;
}

function updateHistory(previous, selected, builtAt) {
  const history = recentHistory(previous,Date.parse(builtAt));
  for (const row of selected) history.set(normalizeKeyword(row.keyword),builtAt);
  const at = Date.parse(builtAt);
  const today = kstDayOf(at);
  const byDay = shownByDay(previous);
  if (!byDay.has(today)) byDay.set(today, new Set());
  for (const row of selected) { const key = normalizeKeyword(row.keyword); if (key) byDay.get(today).add(key); }
  const oldest = kstDayOf(at - (DAYS_KEPT - 1) * 86400000);
  const days = Object.fromEntries([...byDay].filter(([day]) => day >= oldest && day <= today).sort((a, b) => b[0].localeCompare(a[0])).map(([day, keys]) => [day, [...keys].sort()]));
  return {windowDays:WINDOW_DAYS,entries:[...history].map(([keyword,lastShownAt])=>({keyword,lastShownAt})).sort((a,b)=>b.lastShownAt.localeCompare(a.lastShownAt)||a.keyword.localeCompare(b.keyword)),days};
}

function unique(rows) {
  const seen = new Set();
  return rows.filter(row => {const key=normalizeKeyword(row.keyword);if(!key||seen.has(key))return false;seen.add(key);return true;});
}

function candidatePools(seeds, history, limit) {
  const ordered = unique([...seeds].sort((a,b)=>b.searchVolume-a.searchVolume||normalizeKeyword(a.keyword).localeCompare(normalizeKeyword(b.keyword))));
  return {
    fresh:ordered.filter(row=>!history.has(normalizeKeyword(row.keyword))).slice(0,limit),
    repeated:ordered.filter(row=>history.has(normalizeKeyword(row.keyword))).sort((a,b)=>history.get(normalizeKeyword(a.keyword)).localeCompare(history.get(normalizeKeyword(b.keyword)))||b.searchVolume-a.searchVolume).slice(0,limit),
  };
}

// 황금(비율 minRatio+)은 7일 이력과 무관하게 맨 앞이다 — 어제 찾은 황금을 다양성 규칙이 버리던 것을 고쳤다
// (사장님 2026-09-29 "황금키워드 비중이 좀 많으면"). 재추천 표시(freshness)는 그대로 남긴다.
// 일반 후보만 신규 우선이고, 신규가 모자랄 때만 오래전에 추천한 순으로 채운다.
function selectRows(rows, history, keep, minRatio = 1, orderGolden = rows => [...rows].sort((a,b)=>b.ratio-a.ratio)) {
  const candidates = unique(rows);
  const golden = orderGolden(candidates.filter(row=>row.ratio>=minRatio));
  const rest = candidates.filter(row=>row.ratio<minRatio);
  const others = rest.filter(row=>!history.has(normalizeKeyword(row.keyword))).sort((a,b)=>Number(!!b.seasonPeakMonth)-Number(!!a.seasonPeakMonth)||b.ratio-a.ratio);
  const repeated = rest.filter(row=>history.has(normalizeKeyword(row.keyword))).sort((a,b)=>history.get(normalizeKeyword(a.keyword)).localeCompare(history.get(normalizeKeyword(b.keyword)))||b.ratio-a.ratio);
  return [...golden,...others,...repeated].slice(0,keep).map(row=>{
    const lastShownAt=history.get(normalizeKeyword(row.keyword));
    return {...row,freshness:lastShownAt?{status:'repeated',lastShownAt}:{status:'new'}};
  });
}

/**
 * 주제별 "이미 황금으로 잰 말" — 창고 후보보다 먼저 잰다(2026-09-29).
 *  1) 직전 판(--carry)에서 그 주제의 황금 행: 어제 황금은 오늘도 황금일 확률이 높다.
 *  2) 선점 보드(--goldenBoard, preemption-board.json)의 같은 주제 행 중 검색량 ÷ 문서수 ≥ minRatio:
 *     BD 로 자리까지 잰 황금인데 추천 표엔 실리지 않고 있었다(145행 중 96행).
 * 문서수·실측 시각을 그대로 옮긴다 — 24시간이 지났으면 호출부가 다시 잰다. 같은 말은 직전 판이 이긴다.
 */
function priorGoldenRows(carried, goldenBoard, topic, minRatio = 1) {
  const carriedRows = (Array.isArray(carried?.topics) ? carried.topics : []).filter(t => t?.topic === topic).flatMap(t => Array.isArray(t.rows) ? t.rows : [])
    .filter(row => row?.keyword && row.searchVolume > 0 && row.documentCount > 0 && row.searchVolume / row.documentCount >= minRatio)
    .map(row => ({keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:row.measuredAt,depth:typeof row.depth==='number'?row.depth:null,comp:row.comp||null,source:row.source||null}));
  const boardRows = (Array.isArray(goldenBoard?.rows) ? goldenBoard.rows : []).filter(row => row?.topic === topic && row.keyword && row.searchVolume > 0 && row.documentCount > 0 && row.searchVolume / row.documentCount >= minRatio)
    .map(row => ({keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:goldenBoard.publishedAt,depth:null,comp:null,source:'preemption'}));
  return unique([...carriedRows, ...boardRows]);
}

function completeRound(board, roundId, keep) {
  return board?.round?.id===roundId && board.keep===keep && board.selectionVersion===2
    && board.history?.windowDays===WINDOW_DAYS && Array.isArray(board.history.entries) && rowsOf(board).length>0;
}

module.exports = {WINDOW_DAYS,normalizeKeyword,recentHistory,updateHistory,candidatePools,selectRows,priorGoldenRows,completeRound,shownByDay,blockedKeywords};
