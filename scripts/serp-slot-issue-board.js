#!/usr/bin/env node
/**
 * 실검 틈새 — 자리 실측(블로그탭 상위 10 정면글) 단계.
 *
 * 왜: 틈새의 정의가 '트래픽·수요·자리' 세 실측을 다 통과한 키워드로 바뀌었다. 앞의 둘은
 * 회차(issue-niche-board.js)가 네이버 API 로 재지만, 자리(네이버 블로그탭 HTML)는
 * Bright Data 로만 받을 수 있고 유료 쿼터라 이 단계가 따로 있다. 회차당 상한(기본 12건)
 * 안에서 검색량 큰 순으로 재고, 못 잰 행은 대기(isPending)로 남아 발행되지 않는다.
 *
 * 비용(2026-09 기준): 무료 5,000건/월 공용. 12건 × 하루 3회 = 36건/일 ≤ 1,116건/월.
 * 기능 상한(LEWORD_BRIGHTDATA_FEATURE_CAPS) 'issue' 1,100 으로 잠근다.
 * 48시간 안에 잰 키워드는 캐시(--cache)로 대신해 다시 안 센다.
 *
 * 고르는 규칙·입히는 규칙은 src/utils/issue-slot-measure.ts(순수 함수, 테스트 대상).
 * 이 파일은 파일 읽고 Bright Data 부르고 쓰는 껍데기다.
 *
 * 사용:
 *   node scripts/serp-slot-issue-board.js --in=issue-board.json \
 *     --prev=site/spa/public/data/issue-niche-board.json \
 *     --cache=site/data/issue-slot-cache.json \
 *     --ledgerOut=issue-board-slotted.json --picksOut=issue-board-picks-slotted.json \
 *     --max=12
 *
 * 종료 코드: 0 정상(0건 재도 정상) · 2 입력 없음.
 * 토큰이 없거나 쿼터가 막히면 잰 만큼만 쓰고 0 으로 끝난다 — 회차 전체를 죽이지 않는다.
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { brightDataFetch } = require('../src/utils/brightdata-client');
const { brightDataQuotaSnapshot } = require('../src/utils/brightdata-quota-governor');
const { analyzeSerp, verdictFor } = require('../src/utils/serp-winnability');
const { selectIssueRowsForEnrich } = require('../src/utils/issue-niche-board-shape');
const {
  applySlotResults,
  planSlotMeasurement,
  readSlotCache,
  toSlotSerp,
} = require('../src/utils/issue-slot-measure');

const ZONE = process.env.BRIGHTDATA_ZONE || '77';
const FEATURE = 'issue';
/** 12건뿐이라 적응형 조절 없이 고정 간격. 속도 제한은 brightDataFetch 의 재시도가 받는다. */
const DELAY_MS = 2_000;
const DEFAULT_MAX = 12;

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`읽기 실패 ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 1), 'utf8');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR'));

function blogTabUrl(keyword) {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

/** 한 키워드의 블로그탭 상위 10 을 받아 판정한다. 실패는 null — 대기로 남긴다. */
async function measureSlot(keyword) {
  const res = await brightDataFetch(blogTabUrl(keyword), FEATURE, { zone: ZONE });
  if (!res.ok) {
    return { serp: null, quotaBlocked: Boolean(res.quotaBlocked), rateLimited: Boolean(res.rateLimited), error: res.error || res.status || 'unknown' };
  }
  const analysis = analyzeSerp(res.body, keyword);
  const verdict = verdictFor(analysis);
  return { serp: toSlotSerp(analysis, verdict, new Date().toISOString()), quotaBlocked: false, rateLimited: false, error: null };
}

async function main() {
  const inPath = arg('in');
  if (!inPath) { console.error('--in=<회차 원장 JSON> 이 필요합니다.'); process.exit(2); }
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }
  const prevPath = arg('prev');
  const cachePath = arg('cache');
  const ledgerOut = arg('ledgerOut') || 'issue-board-slotted.json';
  const picksOut = arg('picksOut') || '';
  const prevOut = arg('prevOut') || prevPath;
  // '--max=0' 은 0 이다(호출 없이 캐시·판정만). 비어 있을 때만 기본값.
  const maxRaw = arg('max');
  const max = maxRaw === '' ? DEFAULT_MAX : Math.max(0, Number(maxRaw) || 0);

  const ledger = readJson(inPath);
  if (!ledger) process.exit(2);
  const prev = prevPath && fs.existsSync(prevPath) ? readJson(prevPath) : null;
  const cache = readSlotCache(cachePath && fs.existsSync(cachePath) ? readJson(cachePath) : null);
  const docCountMax = Number(ledger.options?.docCountMax) || 3000;
  const thresholds = { docCountMax, useLiveDemandRoute: true };
  const nowMs = Date.now();

  console.log('='.repeat(70));
  console.log(`실검 틈새 자리 실측 — 블로그탭 상위 10 정면글 (존 ${ZONE} · 기능 ${FEATURE} · 상한 ${max}건)`);
  console.log(`  원장     ${inPath}  (${ledger.generatedAt || '시각 없음'}, ${Array.isArray(ledger.rows) ? ledger.rows.length : 0}행)`);
  console.log(`  발행본   ${prev ? `${prevPath} (${Array.isArray(prev.rows) ? prev.rows.length : 0}행)` : '없음'}`);
  console.log(`  캐시     ${Object.keys(cache.entries).length}건 (48시간 재사용)`);
  console.log('='.repeat(70));

  const plan = planSlotMeasurement({
    ledgerRows: Array.isArray(ledger.rows) ? ledger.rows : [],
    prevRows: prev && Array.isArray(prev.rows) ? prev.rows : [],
    cache,
    nowMs,
    max,
    thresholds,
  });
  const prevIn = prev && Array.isArray(prev.rows) ? prev.rows.length : 0;
  console.log(`계획  잴 것 ${plan.targets.length}건 · 캐시로 대신 ${plan.reused}건 · 상한 밖 대기 ${plan.overflow}건 · 이월 정리 ${prevIn}행 → ${plan.prevRows.length}행`);

  const results = new Map();
  let calls = 0;
  let blocked = false;
  for (const keyword of plan.targets) {
    if (blocked) break;
    if (calls > 0) await sleep(DELAY_MS);
    calls += 1;
    const got = await measureSlot(keyword);
    if (got.quotaBlocked) {
      console.warn(`  ! 쿼터 막힘 — 남은 ${plan.targets.length - calls}건은 대기로 남긴다 (${got.error})`);
      blocked = true;
      break;
    }
    if (!got.serp) {
      console.warn(`  × ${keyword}  ${got.error}${got.rateLimited ? ' (속도 제한)' : ''}`);
      if (String(got.error).includes('missing_token')) { blocked = true; break; }
      continue;
    }
    results.set(keyword, got.serp);
    const mark = got.serp.verdict === 'WINNABLE' ? '◆' : got.serp.verdict === 'NO_DATA' ? '?' : '×';
    console.log(`  ${mark} ${keyword}  ${got.serp.verdict}  정면 ${got.serp.exactTitleHits} · 부분 ${got.serp.partialTitleHits} / 표본 ${got.serp.sampledTitles}`);
  }

  const applied = applySlotResults(plan, results, thresholds);
  const counts = { WINNABLE: 0, CONTESTED: 0, LOCKED: 0, NO_DATA: 0 };
  for (const serp of results.values()) counts[serp.verdict] = (counts[serp.verdict] || 0) + 1;

  const nextLedger = {
    ...ledger,
    slot: {
      measuredAt: new Date(nowMs).toISOString(),
      max,
      targets: plan.targets.length,
      calls,
      reused: plan.reused,
      overflow: plan.overflow,
      verdicts: counts,
      promoted: applied.promoted,
      dropped: applied.dropped,
    },
    funnel: {
      ...(ledger.funnel || {}),
      niche: applied.niche,
      pending: applied.pending,
      preemption: applied.ledgerRows.filter((r) => !r.isNiche && r.isPreemption).length,
    },
    rows: applied.ledgerRows,
  };
  writeJson(ledgerOut, nextLedger);
  if (picksOut) writeJson(picksOut, selectIssueRowsForEnrich(nextLedger));
  if (prev && prevOut) writeJson(prevOut, { ...prev, rows: applied.prevRows });
  if (cachePath) writeJson(cachePath, applied.cache);

  const quota = brightDataQuotaSnapshot();
  console.log('');
  console.log(`잼  ${calls}건 호출 → WINNABLE ${counts.WINNABLE} · CONTESTED ${counts.CONTESTED} · LOCKED ${counts.LOCKED} · NO_DATA ${counts.NO_DATA}`);
  console.log(`결과  틈새 ${applied.niche} · 대기 ${applied.pending} · 승격 ${applied.promoted.length} [${applied.promoted.join(', ')}] · 탈락 ${applied.dropped.length} [${applied.dropped.join(', ')}]`);
  console.log(`쿼터  ${quota.month} 사용 ${fmt(quota.used)} / 무료 ${fmt(quota.freeCeiling)} (남은 무료 ${fmt(quota.remainingFree)}) · issue ${fmt(quota.byFeature.issue || 0)}건 · 이번 회차 비용 $0 (무료 한도 안)`);
  console.log(`쓰기  원장 ${ledgerOut}${picksOut ? ` · 발행 입력 ${picksOut}` : ''}${prev && prevOut ? ` · 발행본 ${prevOut}` : ''}${cachePath ? ` · 캐시 ${cachePath}` : ''}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
