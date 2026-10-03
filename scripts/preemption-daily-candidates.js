'use strict';

// Small daily pass: refresh old measurements and measure new source-backed terms.
// The existing batch still owns SERP verification, grades and publication gates.
const { collectCurrentSeeds, exactMeasuredVolume } = require('./preemption-current-sources');
const keyOf = value => String(value || '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
const money = row => /비즈니스|경제|지원금|금융/.test(row.topic || '')
  || /지원금|장려금|소상공인|정책자금|세액|환급|연금|대출/.test(row.keyword || '');
const stamp = value => Number.isFinite(Date.parse(value || '')) ? Date.parse(value) : 0;

function chooseDailyCandidates(board, sources = {}, state = {}, nowMs = Date.now(), limit = 50) {
  const cap = Math.max(0, Math.min(50, Math.floor(limit) || 0));
  const previous = (Array.isArray(board?.rows) ? board.rows : []).filter(row => row?.keyword && row.topic);
  const known = new Set(previous.map(row => keyOf(row.keyword)));
  const lastAttempt = row => stamp(state[keyOf(row.keyword)]) || stamp(row.measuredAt);
  const due = row => nowMs - lastAttempt(row) >= 20 * 3600000;
  const old = previous.filter(due).sort((a, b) => lastAttempt(a) - lastAttempt(b));
  const current = collectCurrentSeeds({ ...sources, nowMs })
    .filter(row => !known.has(keyOf(row.keyword)) && due(row))
    .map(row => ({ ...row, currentSource: row, seedKind: row.kind }));
  const weighted = rows => {
    const financial = rows.filter(money), rest = rows.filter(row => !money(row)), output = [];
    while (financial.length || rest.length) {
      for (let slot = 0; slot < 10; slot++) {
        const queue = slot < 7 ? financial : rest;
        const row = queue.shift() || (queue === financial ? rest : financial).shift();
        if (row) output.push(row);
      }
    }
    return output;
  };
  const oldOrdered = weighted(old), newOrdered = weighted(current);
  const reserveOld = Math.ceil(cap * .6), reserveNew = cap - reserveOld;
  const pool = [...oldOrdered.slice(0, reserveOld), ...newOrdered.slice(0, reserveNew),
    ...oldOrdered.slice(reserveOld), ...newOrdered.slice(reserveNew)];
  const seen = new Set();
  return pool.filter(row => { const key = keyOf(row.keyword); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, cap);
}

async function measureDailyCandidates(candidates, providers, state = {}, now = Date.now) {
  const rows = [], rejected = [], attempts = { ...state };
  for (const candidate of candidates.slice(0, 50)) {
    const keyword = candidate.keyword;
    attempts[keyOf(keyword)] = new Date(now()).toISOString();
    try {
      const volumeRows = await providers.volume(keyword);
      const volumeRow = volumeRows.find(row => keyOf(row.keyword) === keyOf(keyword));
      const searchVolume = exactMeasuredVolume(volumeRow);
      const searchVolumeMeasuredAt = new Date(now()).toISOString();
      if (searchVolume !== null && searchVolume < (providers.minVolume || 0)) {
        rejected.push({ keyword, checkedAt: searchVolumeMeasuredAt, reason: '월 검색량이 추천 기준보다 낮아졌습니다.' });
        continue;
      }
      if (searchVolume === null || searchVolume <= 0) continue;
      const documentCount = await providers.documents(keyword);
      if (typeof documentCount !== 'number' || !Number.isFinite(documentCount) || documentCount <= 0) continue;
      const documentCountMeasuredAt = new Date(now()).toISOString();
      // Never carry stale SERP, grades or seasonal claims into a fresh candidate.
      rows.push({ keyword, topic: candidate.topic, searchVolume, documentCount,
        measuredAt: documentCountMeasuredAt, searchVolumeMeasuredAt, documentCountMeasuredAt, seed: keyword,
        seedKind: candidate.seedKind || 'daily-recheck', currentSource: candidate.currentSource || null,
        cpc: volumeRow.monthlyAveCpc ?? null, adCompetition: volumeRow.competition ?? null,
        adCtrPc: volumeRow.monthlyAvePcCtr ?? null, adCtrMobile: volumeRow.monthlyAveMobileCtr ?? null,
        adDepth: volumeRow.plAvgDepth ?? null });
    } catch { /* A failed measurement cannot promote the previous value to today. */ }
  }
  return { rows, attempts, rejected };
}

// Keep the old measurements for reference, but stop recommending conclusively rejected rows.
function applyDailyRejections(board, reviews = [], batch = {}, nowMs = Date.now()) {
  const confirmed = [...reviews.filter(row => row?.keyword && row.reason),
    ...(Array.isArray(batch?.rejections) ? batch.rejections : [])
      .filter(row => row.undetermined === false && row.serp?.sampledTitles >= 5
        && Number.isFinite(row.serp?.exactTitleHits) && row.serp.exactTitleHits >= 0
        && row.serp.exactTitleHits <= row.serp.sampledTitles)
      .map(row => ({keyword:row.keyword,checkedAt:row.measuredAt,reason:'최근 검색결과 재검증에서 추천 조건을 충족하지 못했습니다.'}))];
  const byKey = new Map(confirmed.filter(row => stamp(row.checkedAt) > 0 && stamp(row.checkedAt) <= nowMs
    && nowMs - stamp(row.checkedAt) <= 86400000).map(row => [keyOf(row.keyword),row]));
  let changed = 0;
  let latestRevalidatedAt = stamp(board.revalidatedAt);
  const rows = (board.rows || []).map(row => {
    const review = byKey.get(keyOf(row.keyword));
    if (!review || stamp(review.checkedAt) < stamp(row.measuredAt)
      || stamp(review.checkedAt) <= stamp(row.revalidation?.checkedAt)) return row;
    changed++;
    latestRevalidatedAt = Math.max(latestRevalidatedAt, stamp(review.checkedAt));
    return {...row,revalidation:{status:'rejected',checkedAt:review.checkedAt,reason:review.reason}};
  });
  return {board: changed ? {...board,rows,revalidatedAt:new Date(latestRevalidatedAt).toISOString()} : board,changed};
}

async function main() {
  require('ts-node/register/transpile-only');
  require('./load-project-env').loadProjectEnv();
  const fs = require('fs');
  const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const site = arg('site', 'site/spa/public/data');
  const board = read(`${site}/preemption-board.json`);
  if (!Array.isArray(board?.rows) || !board.rows.length) throw new Error('기존 보드가 없어 일일 재검증을 중단합니다.');
  if (process.argv.includes('--apply-status')) {
    const result = applyDailyRejections(board, read('daily-review.json') || [], read('daily-board.json') || {});
    if (result.changed) fs.writeFileSync(`${site}/preemption-board.json`,JSON.stringify(result.board,null,1));
    console.log(`확정 재검증 탈락 ${result.changed}개 표시. 기존 실측·발행 시각은 보존했습니다.`);
    return;
  }
  const stateFile = arg('state', 'data/preemption-daily-state.json');
  const state = read(stateFile) || {};
  const sources = { briefs: read(`${site}/topic-briefs.json`), signals: read('daily-signals.json'),
    benchmarks: read(`${site}/homefeed-benchmarks.json`) };
  const candidates = chooseDailyCandidates(board, sources, state);
  const { EnvironmentManager } = require('../src/utils/environment-manager');
  const config = EnvironmentManager.getInstance().getConfig();
  const searchAd = { accessLicense: config.naverSearchAdAccessLicense, secretKey: config.naverSearchAdSecretKey, customerId: config.naverSearchAdCustomerId };
  const openApi = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };
  const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
  const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
  const result = await measureDailyCandidates(candidates, {
    minVolume: require('../src/utils/preemption-gate').DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume,
    volume: keyword => getNaverSearchAdKeywordVolume(searchAd, [keyword], { forceFresh: true }),
    documents: keyword => getNaverBlogDocumentCount(keyword, { config: openApi, forceFresh: true }),
  }, state);
  fs.writeFileSync(stateFile, JSON.stringify(result.attempts, null, 2));
  fs.writeFileSync(arg('out', 'daily-candidates.json'), JSON.stringify(result.rows, null, 2));
  fs.writeFileSync('daily-review.json', JSON.stringify(result.rejected, null, 2));
  console.log(`일일 후보 ${candidates.length}개 중 검색량·문서량 실측 성공 ${result.rows.length}개. SERP 판정은 다음 단계에서 진행합니다.`);
  if (!result.rows.length) process.exitCode = 3;
}
if (require.main === module) main().catch(() => { console.error('일일 후보 측정 실패 — 기존 발행본을 유지합니다.'); process.exitCode = 1; });
module.exports = { chooseDailyCandidates, measureDailyCandidates, applyDailyRejections };
