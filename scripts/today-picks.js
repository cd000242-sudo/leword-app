#!/usr/bin/env node
/**
 * 오늘의 주제별 네이버 추천키워드 — 사이트의 실검 틈새와 키워드 분석 사이 서브탭(2026-09-08).
 *
 * 창고(data/seed-db.json: 검색량·광고 실측)에서 주제별 검색량 상위 후보를 넓게 뽑아 블로그 문서수를
 * 오픈 API로 실측하고(무료), 보드와 같은 황금비(검색량 ÷ 문서수)로 줄을 세운다.
 * 최근 7일 미추천 후보를 우선하고, 그 안에서는 황금 비율(황금비 1 이상)을 앞에 둔다. 그래도 30개가
 * 안 차면 나머지는 버리지 않고 실측 황금비 순으로 채운다("황금 비율은 올리되 나머지를 버리지 말 것").
 * 계절 씨앗(month:M) 중 이번 달·다음 달 피크인 것은 seasonPeakMonth 로 표시한다 — '트래픽 몰릴 예정'.
 * 자리(SERP)는 재지 않는다 — 그건 선점 회차가 브라이트데이터로 잰다. 그래서 파일에 그렇게 적는다.
 * 카드 답 검색어(날씨·프로필·시세)와 유통기한 짧은 말은 보드와 같은 가드로 뺀다.
 *
 * 실측·단순 산술만 싣는다. 추정치는 없다.
 *
 * 쓰기:
 *   node scripts/today-picks.js --out=today-picks.json                      # data/seed-db.json 을 읽는다
 *   node scripts/today-picks.js --perTopic=120 --minRatio=1
 *   node scripts/today-picks.js --resume=이전결과.json --perTopic=800   # 같은 회차의 검증된 신규 황금 30개가 찬 주제는 재사용한다
 */
require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
};

const { topicOfSeed } = require('../src/utils/seed-db');
const { NAVER_BLOG_TOPICS } = require('../src/utils/naver-blog-topics');
const { judgeAnswerCardKeyword, judgeEphemeralKeyword, listedNamesFromSeeds, isListedName } = require('../src/utils/preemption-supply-guards');
const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
const { getNaverSearchAdBidPairs } = require('../src/utils/naver-searchad-api');
const { bidKey, moneyBidOf, orderGoldenByMoney } = require('../src/utils/money-keywords');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { roundAt, cachedMeasurement, canPublish, describeChanges } = require('./today-picks-rounds');
const { WINDOW_DAYS, normalizeKeyword, recentHistory, updateHistory, candidatePools, selectRows, completeRound } = require('./today-picks-selection');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** KST 기준 이번 달·다음 달 — 계절 씨앗(month:M)의 '트래픽 몰릴 예정' 판정 창. */
function upcomingMonths(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const m = kst.getUTCMonth() + 1;
  return [m, (m % 12) + 1];
}

function seasonPeak(seed, months) {
  const match = /^month:(\d{1,2})$/.exec(String(seed.source || ''));
  if (!match) return null;
  const m = Number(match[1]);
  return months.includes(m) ? m : null;
}

async function main() {
  const warehousePath = path.resolve(arg('warehouse') || path.join(__dirname, '..', 'data', 'seed-db.json'));
  const outPath = path.resolve(arg('out') || 'today-picks.json');
  const perTopic = Number(arg('perTopic')) || 120;
  const keep = Number(arg('keep')) || 30;
  if (!Number.isInteger(keep) || keep < 1 || keep > 100 || !Number.isInteger(perTopic) || perTopic < keep || perTopic > 1000) throw new Error('keep는 1~100, perTopic은 keep 이상 1000 이하 정수여야 합니다.');
  const gapMs = Number(arg('gapMs')) || 120;
  const minRatio = Number(arg('minRatio')) || 1;
  const months = upcomingMonths();
  // --resume: 이전 결과에서 황금 keep 개가 찬 주제는 그대로 옮기고, 얇은 주제만 다시(더 넓게) 잰다.
  const resumePath = arg('resume') ? path.resolve(arg('resume')) : '';
  const resumed = resumePath && fs.existsSync(resumePath) ? JSON.parse(fs.readFileSync(resumePath, 'utf8')) : null;
  const resumedTopics = new Map((resumed && Array.isArray(resumed.topics) ? resumed.topics : []).map((t) => [t.topic, t]));

  /*
   * --carry: 사이트에 실려 있는 직전 판과 그 안의 최근 7일 추천 이력.
   *
   * 왜(사장님 2026-09-10 "오늘의 네이버 추천키워드 갱신 제대로 안 됩니다"):
   * 뽑는 방식이 완전히 결정적이다 — 주제별 검색량 상위 perTopic 개를 훑다가 황금 keep 개가 차면 멈춘다.
   * 창고가 같으면 같은 후보를 같은 순서로 훑으니 답도 같다. 실측: 9/10 판이 9/9 판과 320개 중 319개 일치.
   * 직전 판만 제외하면 A→B→A가 반복된다. 공개 JSON에 7일 이력을 보존해 최근 추천을 후순위로 보낸다.
   *
   * 비우지는 않는다 — 뺐더니 그 주제가 텅 비면 뺀 것을 도로 쓴다(아래 backfill).
   * 빈 표보다는 어제와 겹치더라도 쓸 만한 표가 낫다.
   */
  const carryPath = arg('carry') ? path.resolve(arg('carry')) : '';
  let carried = null;
  try { carried = carryPath && fs.existsSync(carryPath) ? JSON.parse(fs.readFileSync(carryPath, 'utf8')) : null; } catch { carried = null; }
  const startedAt = new Date().toISOString();
  const round = roundAt(Date.parse(startedAt));
  if (arg('respectDone') === 'true' && completeRound(carried, round.id, keep)) {
    console.log(`${round.label} 회차가 이미 발행되어 재측정하지 않습니다.`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(carried, null, 1), 'utf8');
    return;
  }
  // Measurements retain their actual timestamps across rounds. The cache contains no credentials.
  const cachePath = arg('measurementCache') ? path.resolve(arg('measurementCache')) : '';
  let measurements = {};
  try { measurements = cachePath && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {}; } catch { measurements = {}; }
  if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements)) measurements = {};
  measurements = Object.fromEntries(Object.entries(measurements).filter(([, entry]) => cachedMeasurement(entry)));
  const flat = normalizeKeyword;
  const history = recentHistory(carried, Date.parse(startedAt));

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId, clientSecret: cfg.naverClientSecret };
  if (!openApi.clientId || !openApi.clientSecret) {
    console.error('네이버 오픈 API 자격증명이 필요합니다(문서수 실측).');
    process.exit(2);
  }
  /*
   * 입찰가(파워링크 3위) — 황금 안에서 돈 되는 순으로 세운다(2026-09-24 사장님 "돈 될 만한 황금키워드").
   * 키가 없으면 재지 않고 예전처럼 황금비 순이다. 보여 줄 행만 재서 주제당 2콜(PC · 모바일)이다.
   */
  const searchAd = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
  const canBid = Boolean(searchAd.accessLicense && searchAd.secretKey);
  if (!canBid) console.log('검색광고 키 없음 — 입찰가 없이 황금비 순으로 간다.');
  const db = JSON.parse(fs.readFileSync(warehousePath, 'utf8'));
  if (!db || !Array.isArray(db.seeds)) {
    console.error(`창고를 못 읽었습니다: ${warehousePath}`);
    process.exit(2);
  }

  const topics = NAVER_BLOG_TOPICS.map((t) => t.label);
  const byTopic = new Map(topics.map((t) => [t, []]));
  // 종목 이름만 친 말('삼성전자' · 'SK하이닉스')은 주가 카드가 답한다 — 창고의 '○○주가' 씨앗이 이름을 알려 준다.
  const listedNames = listedNamesFromSeeds(db.seeds);
  let listedDropped = 0;
  for (const s of db.seeds) {
    if (!(s.searchVolume >= 500)) continue;
    const kw = String(s.keyword || '');
    if (kw.length < 2 || kw.length > 15) continue;
    if (judgeAnswerCardKeyword(kw).answerCard || judgeEphemeralKeyword(kw).ephemeral) continue;
    if (isListedName(kw, listedNames)) { listedDropped += 1; continue; }
    const t = topicOfSeed(s);
    if (!t || !byTopic.has(t)) continue;
    byTopic.get(t).push(s);
  }

  console.log(`오늘의 추천키워드 — 창고 ${db.seeds.length.toLocaleString('ko-KR')}개 · 주제 ${topics.length} · 주제당 후보 ${perTopic} · 황금비 ${minRatio}+ 앞 · 나머지 채움 · 시즌 표시(${months.join('·')}월) · 남김 ${keep}`);
  console.log(`  종목 이름 ${listedNames.size}개 확인 · 후보에서 뺀 말 ${listedDropped}개`);
  const result = {
    builtAt: startedAt,
    round,
    warehouseBuiltAt: db.builtAt || null,
    perTopic,
    keep,
    selectionVersion: 2,
    minRatio,
    upcomingMonths: months,
    /** 화면이 그대로 옮겨 적을 수 있는 방법 설명 — 숫자의 출처와 한계. */
    method: {
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(PC+모바일)',
      documentCount: '네이버 블로그 오픈 API 문서수 실측 · 24시간 이내 실측은 재사용(행별 measuredAt)',
      ratio: `최근 ${WINDOW_DAYS}일 미추천 후보 우선 · 검색량 ÷ 문서수 ${minRatio} 이상을 먼저, 그 안에서는 입찰가 높은 순 · 신규 부족 시 오래전에 추천한 순으로 재추천`,
      bid: '네이버 검색광고 파워링크 3위 평균 입찰가 실측(PC · 모바일 중 큰 값) — 70원이면 3위 자리까지 광고 경쟁이 없다',
      season: '이번 달·다음 달 피크인 계절 씨앗은 seasonPeakMonth 로 표시 — 트래픽 몰릴 예정',
      depth: '월 평균 노출 검색광고 수 실측 · 0 이면 광고주가 없는 말',
      serp: '자리(상위 10개 정면 글·빈자리)는 재지 않았다 — 선점 회차가 브라이트데이터로 잰다',
    },
    topics: [],
  };
  let calls = 0;
  let successes = 0;
  let reused = 0;
  for (const t of topics) {
    const prev = resumedTopics.get(t);
    if (resumed?.selectionVersion === 2 && resumed?.round?.id === round.id && prev && (prev.golden || 0) >= keep && prev.rows.length === keep && prev.rows.every(row => !history.has(flat(row.keyword)) && cachedMeasurement({count:row.documentCount,measuredAt:row.measuredAt}))) {
      result.topics.push({...prev,rows:selectRows(prev.rows,history,keep,minRatio,orderGoldenByMoney),targetCount:keep,shortfall:0});
      console.log(`  ${t.padEnd(8)} 이전 결과 재사용 — 황금 ${prev.golden} 이미 찼다`);
      continue;
    }
    // 신규 후보를 먼저 측정한다. 부족할 때만 별도 예산 안에서 과거 추천을 오래된 순으로 잰다.
    const pools = candidatePools(byTopic.get(t), history, perTopic);
    const cand = pools.fresh.concat(pools.repeated);
    const golden = [];
    const others = []; // 비황금 — 황금이 모자라면 황금비 순으로 뒤를 채운다
    for (const c of cand) {
      // 신규가 충분하면 반복 후보는 재지 않는다. 신규 황금이 목표만큼 차면 조기 종료한다.
      if ((!history.has(flat(c.keyword)) && golden.length >= keep) || (history.has(flat(c.keyword)) && golden.length + others.length >= keep)) break;
      let documentCount = null;
      const key = flat(c.keyword);
      const cached = cachedMeasurement(measurements[key]);
      let measuredAt = cached?.measuredAt;
      if (cached) { documentCount = cached.count; reused += 1; }
      else {
        try { documentCount = await getNaverBlogDocumentCount(c.keyword, { config: openApi }); } catch { documentCount = null; }
        calls += 1;
        if (Number.isFinite(documentCount) && documentCount >= 0) {
          successes += 1;
          measuredAt = new Date().toISOString();
          measurements[key] = { count: documentCount, measuredAt };
        }
      }
      if (Number.isFinite(documentCount) && documentCount > 0) {
        const ratio = Math.round((c.searchVolume / documentCount) * 100) / 100;
        const peak = seasonPeak(c, months);
        const row = {
          keyword: c.keyword,
          searchVolume: c.searchVolume,
          documentCount,
          measuredAt,
          ratio,
          depth: typeof c.depth === 'number' ? c.depth : null,
          comp: c.comp || null,
          source: String(c.source || '').split(':')[0] || null,
          ...(peak ? { seasonPeakMonth: peak } : {}),
        };
        if (ratio >= minRatio) golden.push(row);
        else others.push(row);
      }
      if (!cached) await sleep(gapMs);
    }
    // 시즌 앞(피크 임박) 비황금을 먼저, 그다음 황금비 순
    others.sort((a, b) => (Number(!!b.seasonPeakMonth) - Number(!!a.seasonPeakMonth)) || (b.ratio - a.ratio));
    const shown = selectRows([...golden,...others],history,keep,minRatio);
    let bids = new Map();
    if (canBid && shown.length > 0) {
      try { bids = await getNaverSearchAdBidPairs(searchAd, shown.map((row) => row.keyword)); } catch (error) {
        console.log(`  !! ${t} 입찰가 — ${String((error && error.message) || error).slice(0, 70)}`);
      }
    }
    const priced = (row) => ({ ...row, money: moneyBidOf(bids.get(bidKey(row.keyword))) });
    // 황금 안에서는 돈 되는 순(입찰가 구간 → 입찰가 → 황금비). 못 잰 것끼리는 예전처럼 황금비 순이다.
    const rows = selectRows(shown.map(priced),history,keep,minRatio,orderGoldenByMoney);
    const goldenCount=rows.filter(row=>row.ratio>=minRatio).length;
    result.topics.push({ topic: t, candidates: cand.length, measured: golden.length + others.length, golden: goldenCount, targetCount:keep, shortfall:keep-rows.length, rows });
    const repeated = rows.filter((r) => r.freshness.status === 'repeated').length;
    console.log(`  ${t.padEnd(8)} 후보 ${String(cand.length).padStart(3)} → 황금 ${String(goldenCount).padStart(2)} + 채움 ${String(rows.length - goldenCount).padStart(2)}  (7일 신규 ${rows.length - repeated}/${rows.length} · 누적 호출 ${calls})`);
    // Keep partial work separate: a failed run never replaces a previously good public payload.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(`${outPath}.partial`, JSON.stringify(result, null, 1), 'utf8');
    if (cachePath) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(measurements), 'utf8');
    }
  }
  if (!canPublish(result, carried, calls, successes)) throw new Error('실측 실패 또는 주제 누락 — 직전 발행본을 유지합니다.');
  result.changes = describeChanges(result, carried);
  result.measurements = { requested: calls, reused, succeeded: successes };
  const selected = result.topics.flatMap(topic=>topic.rows);
  const repeatedCount = selected.filter(row=>row.freshness.status==='repeated').length;
  result.novelty = {windowDays:WINDOW_DAYS,newCount:selected.length-repeatedCount,repeatedCount};
  result.history = updateHistory(carried,selected,result.builtAt);
  fs.writeFileSync(`${outPath}.partial`, JSON.stringify(result, null, 1), 'utf8');
  fs.renameSync(`${outPath}.partial`, outPath);
  const total = result.topics.reduce((n, t) => n + t.rows.length, 0);
  const goldenTotal = result.topics.reduce((n, t) => n + t.golden, 0);
  console.log(`끝 — 행 ${total} · 황금 비율 ${goldenTotal} · 채움 ${total - goldenTotal} · 오픈 API 호출 ${calls} → ${outPath}`);
  process.exit(0);
}

module.exports = { main };

if (require.main === module) main().catch((error) => {
  console.error(`오늘의 추천키워드 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
