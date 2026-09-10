#!/usr/bin/env node
/**
 * 오늘의 주제별 네이버 추천키워드 — 사이트의 실검 틈새와 키워드 분석 사이 서브탭(2026-09-08).
 *
 * 창고(data/seed-db.json: 검색량·광고 실측)에서 주제별 검색량 상위 후보를 넓게 뽑아 블로그 문서수를
 * 오픈 API로 실측하고(무료), 보드와 같은 황금비(검색량 ÷ 문서수)로 줄을 세운다.
 * 사장님 규칙(2026-09-08): **황금 비율(황금비 1 이상)을 최대한 올린다 — 앞에 둔다.** 그래도 10개가
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
 *   node scripts/today-picks.js --resume=이전결과.json --perTopic=800   # 황금 10개가 찬 주제는 건너뛰고 얇은 주제만 더 넓게 잰다
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
  const months = upcomingMonths();
  // --resume: 이전 결과에서 황금 keep 개가 찬 주제는 그대로 옮기고, 얇은 주제만 다시(더 넓게) 잰다.
  const resumePath = arg('resume') ? path.resolve(arg('resume')) : '';
  const resumed = resumePath && fs.existsSync(resumePath) ? JSON.parse(fs.readFileSync(resumePath, 'utf8')) : null;
  const resumedTopics = new Map((resumed && Array.isArray(resumed.topics) ? resumed.topics : []).map((t) => [t.topic, t]));

  /*
   * --carry: 사이트에 실려 있는 직전 판. 거기 있던 키워드는 오늘 다시 내지 않는다.
   *
   * 왜(사장님 2026-09-10 "오늘의 네이버 추천키워드 갱신 제대로 안 됩니다"):
   * 뽑는 방식이 완전히 결정적이다 — 주제별 검색량 상위 perTopic 개를 훑다가 황금 keep 개가 차면 멈춘다.
   * 창고가 같으면 같은 후보를 같은 순서로 훑으니 답도 같다. 실측: 9/10 판이 9/9 판과 320개 중 319개 일치.
   * 창고는 워크플로가 매일 새로 긁게 했고, 그래도 겹치는 것은 여기서 뺀다.
   *
   * 비우지는 않는다 — 뺐더니 그 주제가 텅 비면 뺀 것을 도로 쓴다(아래 backfill).
   * 빈 표보다는 어제와 겹치더라도 쓸 만한 표가 낫다.
   */
  const carryPath = arg('carry') ? path.resolve(arg('carry')) : '';
  let carried = null;
  try { carried = carryPath && fs.existsSync(carryPath) ? JSON.parse(fs.readFileSync(carryPath, 'utf8')) : null; } catch { carried = null; }
  const flat = (k) => String(k || '').replace(/\s+/g, '');
  const alreadyShown = new Set(
    (carried && Array.isArray(carried.topics) ? carried.topics : [])
      .flatMap((t) => (Array.isArray(t.rows) ? t.rows : []).map((r) => flat(r.keyword)))
      .filter(Boolean),
  );

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

  console.log(`오늘의 추천키워드 — 창고 ${db.seeds.length.toLocaleString('ko-KR')}개 · 주제 ${topics.length} · 주제당 후보 ${perTopic} · 황금비 ${minRatio}+ 앞 · 나머지 채움 · 시즌 표시(${months.join('·')}월) · 남김 ${keep}`);
  const result = {
    builtAt: new Date().toISOString(),
    warehouseBuiltAt: db.builtAt || null,
    perTopic,
    keep,
    minRatio,
    upcomingMonths: months,
    /** 화면이 그대로 옮겨 적을 수 있는 방법 설명 — 숫자의 출처와 한계. */
    method: {
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(PC+모바일)',
      documentCount: '네이버 블로그 오픈 API 문서수 실측',
      ratio: `검색량 ÷ 문서수 — ${minRatio} 이상(황금 비율)을 앞에, 모자라면 나머지를 황금비 순으로 채운다`,
      season: '이번 달·다음 달 피크인 계절 씨앗은 seasonPeakMonth 로 표시 — 트래픽 몰릴 예정',
      depth: '월 평균 노출 검색광고 수 실측 · 0 이면 광고주가 없는 말',
      serp: '자리(상위 10개 정면 글·빈자리)는 재지 않았다 — 선점 회차가 브라이트데이터로 잰다',
    },
    topics: [],
  };
  let calls = 0;
  for (const t of topics) {
    const prev = resumedTopics.get(t);
    if (prev && (prev.golden || 0) >= keep) {
      result.topics.push(prev);
      console.log(`  ${t.padEnd(8)} 이전 결과 재사용 — 황금 ${prev.golden} 이미 찼다`);
      continue;
    }
    // 어제 실린 것은 뒤로 미룬다 — 앞에서 잘리지 않게 후보 목록에서 빼고, 모자라면 뒤에 도로 붙인다.
    const ordered = byTopic.get(t).sort((a, b) => b.searchVolume - a.searchVolume);
    const fresh = ordered.filter((c) => !alreadyShown.has(flat(c.keyword)));
    const repeats = ordered.filter((c) => alreadyShown.has(flat(c.keyword)));
    const cand = fresh.concat(repeats).slice(0, perTopic);
    const golden = [];
    const others = []; // 비황금 — 황금이 모자라면 황금비 순으로 뒤를 채운다
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
        else others.push(row);
      }
      await sleep(gapMs);
    }
    golden.sort((a, b) => b.ratio - a.ratio);
    // 시즌 앞(피크 임박) 비황금을 먼저, 그다음 황금비 순
    others.sort((a, b) => (Number(!!b.seasonPeakMonth) - Number(!!a.seasonPeakMonth)) || (b.ratio - a.ratio));
    const g = golden.slice(0, keep);
    const rows = g.concat(others.slice(0, keep - g.length));
    result.topics.push({ topic: t, candidates: cand.length, measured: golden.length + others.length, golden: g.length, rows });
    const repeated = rows.filter((r) => alreadyShown.has(flat(r.keyword))).length;
    console.log(`  ${t.padEnd(8)} 후보 ${String(cand.length).padStart(3)} → 황금 ${String(g.length).padStart(2)} + 채움 ${String(rows.length - g.length).padStart(2)}  (새것 ${rows.length - repeated}/${rows.length} · 누적 호출 ${calls})`);
    // 중간 저장 — 도중에 죽어도 잰 만큼은 남는다.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf8');
  }
  const total = result.topics.reduce((n, t) => n + t.rows.length, 0);
  const goldenTotal = result.topics.reduce((n, t) => n + t.golden, 0);
  console.log(`끝 — 행 ${total} · 황금 비율 ${goldenTotal} · 채움 ${total - goldenTotal} · 오픈 API 호출 ${calls} → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`오늘의 추천키워드 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
