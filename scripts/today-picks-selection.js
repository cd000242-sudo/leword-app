// Public selection history travels with the board, so it survives runner/cache changes.
const WINDOW_DAYS = 7;
const normalizeKeyword = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const rowsOf = (board) => (Array.isArray(board?.topics) ? board.topics : []).flatMap(t => Array.isArray(t.rows) ? t.rows : []);

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
  return {windowDays:WINDOW_DAYS,entries:[...history].map(([keyword,lastShownAt])=>({keyword,lastShownAt})).sort((a,b)=>b.lastShownAt.localeCompare(a.lastShownAt)||a.keyword.localeCompare(b.keyword))};
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

function selectRows(rows, history, keep, minRatio = 1, orderGolden = rows => [...rows].sort((a,b)=>b.ratio-a.ratio)) {
  const candidates = unique(rows);
  const fresh = candidates.filter(row=>!history.has(normalizeKeyword(row.keyword)));
  const golden = orderGolden(fresh.filter(row=>row.ratio>=minRatio));
  const others = fresh.filter(row=>row.ratio<minRatio).sort((a,b)=>Number(!!b.seasonPeakMonth)-Number(!!a.seasonPeakMonth)||b.ratio-a.ratio);
  const repeated = candidates.filter(row=>history.has(normalizeKeyword(row.keyword))).sort((a,b)=>history.get(normalizeKeyword(a.keyword)).localeCompare(history.get(normalizeKeyword(b.keyword)))||b.ratio-a.ratio);
  return [...golden,...others,...repeated].slice(0,keep).map(row=>{
    const lastShownAt=history.get(normalizeKeyword(row.keyword));
    return {...row,freshness:lastShownAt?{status:'repeated',lastShownAt}:{status:'new'}};
  });
}

function completeRound(board, roundId, keep) {
  return board?.round?.id===roundId && board.keep===keep && board.selectionVersion===2
    && board.history?.windowDays===WINDOW_DAYS && Array.isArray(board.history.entries) && rowsOf(board).length>0;
}

module.exports = {WINDOW_DAYS,normalizeKeyword,recentHistory,updateHistory,candidatePools,selectRows,completeRound};
