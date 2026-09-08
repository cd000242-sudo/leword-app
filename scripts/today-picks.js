#!/usr/bin/env node
/**
 * 오늘의 주제별 네이버 추천키워드 — 사이트의 실검 틈새와 키워드 분석 사이 서브탭(2026-09-08).
 *
 * 창고(data/seed-db.json: 검색량·광고 실측)에서 주제별 검색량 상위 후보를 넓게 뽑아 블로그 문서수를
 * 오픈 API로 실측하고(무료), 보드와 같은 황금비(검색량 ÷ 문서수)로 줄을 세운다.
 * 사장님 규칙(2026-09-08): **황금 비율(황금비 1 이상)로 채운다.** 뻔한·비황금 키워드는 싣지 않는다.
 * 예외는 "지금 트래픽이 몰릴 예정"뿐 — 창고의 계절 씨앗(month:M) 중 이번 달·다음 달 피크인 것만
 * 황금비 minSeasonRatio 이상이면 '시즌 앞' 표시로 허용한다. 실시간 이슈는 실검 틈새 탭의 몫이다.
 * 자리(SERP)는 재지 않는다 — 그건 선점 회차가 브라이트데이터로 잰다. 그래서 파일에 그렇게 적는다.
 * 카드 답 검색어(날씨·프로필·시세)와 유통기한 짧은 말은 보드와 같은 가드로 뺀다.
 *
 * 실측·단순 산술만 싣는다. 추정치는 없다.
 *
 * 쓰기:
 *   node scripts/today-picks.js --out=today-picks.json                      # data/seed-db.json 을 읽는다
 *   node scripts/today-picks.js --perTopic=120 --minRatio=1 --minSeasonRatio=0.3
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
const { judgeAnswerCardKeyword, judgeEphemeralKeyword } = require('../src/utils/preemption-supply-guards');
const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
const { EnvironmentManager } = require('../src/utils/environment-manager');

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
  const keep = Number(arg('keep')) || 10;
  const gapMs = Number(arg('gapMs')) || 120;
  const minRatio = Number(arg('minRatio')) || 1;
  const minSeasonRatio = Number(arg('minSeasonRatio')) || 0.3;
  const months = upcomingMonths();

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId, clientSecret: cfg.naverClientSecret };
  if (!openApi.clientId || !openApi.clientSecret) {
    console.error('네이버 오픈 API 자격증명이 필요합니다(문서수 실측).');
    process.exit(2);
  }
  const db = JSON.parse(fs.readFileSync(warehousePath, 'utf8'));
  if (!db || !Array.isArray(db.seeds)) {
    console.error(`창고를 못 읽었습니다: ${warehousePath}`);
    process.exit(2);
  }

  const topics = NAVER_BLOG_TOPICS.map((t) => t.label);
  const byTopic = new Map(topics.map((t) => [t, []]));
  for (const s of db.seeds) {
    if (!(s.searchVolume >= 500)) continue;
    const kw = String(s.keyword || '');
    if (kw.length < 2 || kw.length > 15) continue;
    if (judgeAnswerCardKeyword(kw).answerCard || judgeEphemeralKeyword(kw).ephemeral) continue;
    const t = topicOfSeed(s);
    if (!t || !byTopic.has(t)) continue;
    byTopic.get(t).push(s);
  }

  console.log(`오늘의 추천키워드 — 창고 ${db.seeds.length.toLocaleString('ko-KR')}개 · 주제 ${topics.length} · 주제당 후보 ${perTopic} · 황금비 ${minRatio}+ 만 · 시즌 예외(${months.join('·')}월) ${minSeasonRatio}+ · 남김 ${keep}`);
  const result = {
    builtAt: new Date().toISOString(),
    warehouseBuiltAt: db.builtAt || null,
    perTopic,
    keep,
    minRatio,
    minSeasonRatio,
    upcomingMonths: months,
    /** 화면이 그대로 옮겨 적을 수 있는 방법 설명 — 숫자의 출처와 한계. */
    method: {
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(PC+모바일)',
      documentCount: '네이버 블로그 오픈 API 문서수 실측',
      ratio: `검색량 ÷ 문서수 — ${minRatio} 이상(수요가 공급을 넘는 황금 비율)만 싣는다`,
      season: `예외: 이번 달·다음 달 피크인 계절 씨앗은 황금비 ${minSeasonRatio} 이상이면 '시즌 앞'으로 싣는다`,
      depth: '월 평균 노출 검색광고 수 실측 · 0 이면 광고주가 없는 말',
      serp: '자리(상위 10개 정면 글·빈자리)는 재지 않았다 — 선점 회차가 브라이트데이터로 잰다',
    },
    topics: [],
  };
  let calls = 0;
  for (const t of topics) {
    const cand = byTopic.get(t).sort((a, b) => b.searchVolume - a.searchVolume).slice(0, perTopic);
    const golden = [];
    const season = [];
    for (const c of cand) {
      // 황금 10개가 차면 그 주제는 그만 잰다 — 호출 아끼기
      if (golden.length >= keep) break;
      let documentCount = null;
      try { documentCount = await getNaverBlogDocumentCount(c.keyword, { config: openApi }); } catch { documentCount = null; }
      calls += 1;
      if (typeof documentCount === 'number' && documentCount > 0) {
        const ratio = Math.round((c.searchVolume / documentCount) * 100) / 100;
        const peak = seasonPeak(c, months);
        const row = {
          keyword: c.keyword,
          searchVolume: c.searchVolume,
          documentCount,
          ratio,
          depth: typeof c.depth === 'number' ? c.depth : null,
          comp: c.comp || null,
          source: String(c.source || '').split(':')[0] || null,
          ...(peak ? { seasonPeakMonth: peak } : {}),
        };
        if (ratio >= minRatio) golden.push(row);
        else if (peak && ratio >= minSeasonRatio) season.push(row);
      }
      await sleep(gapMs);
    }
    golden.sort((a, b) => b.ratio - a.ratio);
    season.sort((a, b) => b.ratio - a.ratio);
    const rows = golden.slice(0, keep).concat(season.slice(0, Math.max(0, keep - Math.min(golden.length, keep))));
    result.topics.push({ topic: t, candidates: cand.length, measured: golden.length + season.length, golden: Math.min(golden.length, keep), rows });
    console.log(`  ${t.padEnd(8)} 후보 ${String(cand.length).padStart(3)} → 황금 ${String(Math.min(golden.length, keep)).padStart(2)} + 시즌 ${String(rows.length - Math.min(golden.length, keep)).padStart(2)}  (누적 호출 ${calls})`);
    // 중간 저장 — 도중에 죽어도 잰 만큼은 남는다.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf8');
  }
  const total = result.topics.reduce((n, t) => n + t.rows.length, 0);
  const goldenTotal = result.topics.reduce((n, t) => n + t.golden, 0);
  console.log(`끝 — 행 ${total} · 황금 비율 ${goldenTotal} · 시즌 앞 ${total - goldenTotal} · 오픈 API 호출 ${calls} → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`오늘의 추천키워드 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
