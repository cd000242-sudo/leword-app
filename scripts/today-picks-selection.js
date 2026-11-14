// Public selection history travels with the board, so it survives runner/cache changes.
const WINDOW_DAYS = 7;
const normalizeKeyword = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const rowsOf = (board) => (Array.isArray(board?.topics) ? board.topics : []).flatMap(t => Array.isArray(t.rows) ? t.rows : []);
// 최근 7일은 신규 탐색에서 제외하되, 신규 황금 부족 시 재측정 후 보충한다.
// --fresh는 최근 7일과 오늘을 모두 제외하며, 재추천 보충도 하지 않는다.
const BLOCK_DAYS = 7;
const DAYS_KEPT = BLOCK_DAYS + 1;
const kstDayOf = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

/** 날짜(KST)별로 실린 말 — 판의 history.days + 이력의 마지막 시각 날짜 + 그 판의 행(판 시각의 날). */
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
  }
  // 일자별 기록이 생기기 전(2026-10-10 이전)에 실린 말 — 이력의 마지막 시각 날짜로
  for (const entry of Array.isArray(board?.history?.entries) ? board.history.entries : []) {
    const time = Date.parse(entry?.lastShownAt);
    if (Number.isFinite(time)) add(kstDayOf(time), entry.keyword);
  }
  const built = Date.parse(board?.builtAt);
  if (Number.isFinite(built)) for (const row of rowsOf(board)) add(kstDayOf(built), row.keyword);
  return days;
}

/** 이번 회차에 다시 싣지 않을 말 — 최근 7일(KST, 오늘 제외) 실린 말 전부, fresh 면 오늘 이미 실린 말까지. 같은 날 회차끼리는 이어 실어도 된다. */
function blockedKeywords(carried, builtAt, { fresh = false } = {}) {
  const at = Date.parse(builtAt);
  const days = shownByDay(carried);
  const blocked = new Set();
  for (let back = 1; back <= BLOCK_DAYS; back += 1) for (const key of days.get(kstDayOf(at - back * 86400000)) || []) blocked.add(key);
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

/** 재추천 표시는 KST 최근 7일 전체를 본다. 날짜만 남은 구형 이력과 보관본도 빠뜨리지 않는다. */
function selectionHistory(boards, now = Date.now()) {
  const history = new Map();
  const today = kstDayOf(now);
  const oldest = kstDayOf(now - BLOCK_DAYS * 86400000);
  const add = (keyword, time) => {
    const key=normalizeKeyword(keyword), ms=Date.parse(time);
    if(!key || !Number.isFinite(ms) || kstDayOf(ms)<oldest || kstDayOf(ms)>=today) return;
    if(!history.has(key) || ms>Date.parse(history.get(key))) history.set(key,new Date(ms).toISOString());
  };
  for(const board of boards.filter(Boolean)) {
    for(const [day,keys] of shownByDay(board)) for(const key of keys) add(key,`${day}T00:00:00+09:00`);
    for(const entry of board.history?.entries || []) add(entry.keyword,entry.lastShownAt);
    for(const row of rowsOf(board)) add(row.keyword,board.builtAt);
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

// Default candidate order: larger search volume first, ties by name. The picks job passes the rising-seed
// ordering (today-picks-rising.js) instead; this stays the order for everything outside its season group.
const byVolume = (a,b)=>b.searchVolume-a.searchVolume||normalizeKeyword(a.keyword).localeCompare(normalizeKeyword(b.keyword));
// Default order of measured non-golden rows: rows flagged seasonPeakMonth first, then higher golden ratio.
const bySeasonFlagThenRatio = (a,b)=>Number(!!b.seasonPeakMonth)-Number(!!a.seasonPeakMonth)||b.ratio-a.ratio;

function candidatePools(seeds, history, limit, order = byVolume) {
  const ordered = unique([...seeds].sort(order));
  return {
    fresh:ordered.filter(row=>!history.has(normalizeKeyword(row.keyword))).slice(0,limit),
    repeated:ordered.filter(row=>history.has(normalizeKeyword(row.keyword))).sort((a,b)=>history.get(normalizeKeyword(a.keyword)).localeCompare(history.get(normalizeKeyword(b.keyword)))||b.searchVolume-a.searchVolume).slice(0,limit),
  };
}

// 신규 황금 → 재측정한 최근 황금 → 신규 일반 → 최근 일반 순.
// 황금 조건과 신규 여부를 함께 보며, 재추천은 마지막 추천 날짜를 표시한다.
function selectRows(rows, history, keep, minRatio = 1, orderGolden = rows => [...rows].sort((a,b)=>b.ratio-a.ratio), orderOthers = bySeasonFlagThenRatio) {
  const candidates = unique(rows);
  const gold = candidates.filter(row=>row.ratio>=minRatio);
  const golden = [...orderGolden(gold.filter(row=>!history.has(normalizeKeyword(row.keyword)))),
    ...orderGolden(gold.filter(row=>history.has(normalizeKeyword(row.keyword))))];
  const rest = candidates.filter(row=>row.ratio<minRatio);
  const others = rest.filter(row=>!history.has(normalizeKeyword(row.keyword))).sort(orderOthers);
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
function priorGoldenRows(carried, goldenBoard, topic, minRatio = 1, archived = []) {
  const carriedRows = (Array.isArray(carried?.topics) ? carried.topics : []).filter(t => t?.topic === topic).flatMap(t => Array.isArray(t.rows) ? t.rows : [])
    .filter(row => row?.keyword && row.searchVolume > 0 && row.documentCount > 0 && row.searchVolume / row.documentCount >= minRatio)
    .map(row => ({keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:row.measuredAt,depth:typeof row.depth==='number'?row.depth:null,comp:row.comp||null,source:row.source||null}));
  const boardRows = (Array.isArray(goldenBoard?.rows) ? goldenBoard.rows : []).filter(row => row?.topic === topic && row.keyword && row.searchVolume > 0 && row.documentCount > 0 && row.searchVolume / row.documentCount >= minRatio)
    .map(row => ({keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:goldenBoard.publishedAt,depth:null,comp:null,source:'preemption'}));
  // 보관함(그제 이전 판)의 황금 — 2026-10-11 "어제만 피하고 그제 황금은 다시". 어제 실린 말은 호출부의 blocked 가 거른다.
  const archivedRows = (Array.isArray(archived) ? archived : []).map(row => ({keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:row.measuredAt,depth:typeof row.depth==='number'?row.depth:null,comp:row.comp||null,source:row.source||null}));
  return unique([...carriedRows, ...archivedRows, ...boardRows]);
}

/**
 * 날짜별 보관함(지난 판들)에서 그 주제의 황금(비율 minRatio+) — 같은 말은 가장 최근 판 것(최근 판에서 황금이 아니면 뺀다),
 * lastShownAt = 그 판 시각. 2026-10-11 사장님 "황금키워드는 하나도 안 보이네": 어제 실린 말을 막자 매일 다시 싣던 황금 600여 개가 빠졌다.
 */
function archivedGoldenRows(boards, topic, minRatio = 1) {
  const latest = new Map();
  const ordered = [...(Array.isArray(boards) ? boards : [])].sort((a, b) => String(a?.builtAt || '').localeCompare(String(b?.builtAt || '')));
  for (const board of ordered) {
    for (const t of Array.isArray(board?.topics) ? board.topics : []) {
      if (t?.topic !== topic) continue;
      for (const row of Array.isArray(t.rows) ? t.rows : []) {
        const key = normalizeKeyword(row?.keyword);
        if (!key) continue;
        const ratio = typeof row.ratio === 'number' ? row.ratio : (row.searchVolume > 0 && row.documentCount > 0 ? row.searchVolume / row.documentCount : 0);
        if (row.searchVolume > 0 && row.documentCount > 0 && ratio >= minRatio) {
          latest.set(key, {keyword:row.keyword,searchVolume:row.searchVolume,documentCount:row.documentCount,measuredAt:row.measuredAt,depth:row.depth,comp:row.comp,source:row.source,lastShownAt:board.builtAt});
        } else latest.delete(key);
      }
    }
  }
  return [...latest.values()];
}

function completeRound(board, roundId, keep) {
  return board?.round?.id===roundId && board.keep===keep && board.selectionVersion===2
    && board.history?.windowDays===WINDOW_DAYS && Array.isArray(board.history.entries)
    && Array.isArray(board.topics) && board.topics.length>0
    && board.topics.every(topic=>Array.isArray(topic.rows) && topic.rows.length>=keep);
}

module.exports = {BLOCK_DAYS,WINDOW_DAYS,normalizeKeyword,recentHistory,selectionHistory,updateHistory,candidatePools,selectRows,priorGoldenRows,completeRound,shownByDay,blockedKeywords,archivedGoldenRows};
