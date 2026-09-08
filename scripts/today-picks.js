#!/usr/bin/env node
/**
 * 오늘의 주제별 네이버 추천키워드 — 사이트의 실검 틈새키워드 아래에 싣는 표(2026-09-08).
 *
 * 창고(data/seed-db.json: 검색량·광고 실측)에서 주제별 검색량 상위 후보를 뽑아 블로그 문서수를
 * 오픈 API로 실측하고(무료), 보드와 같은 황금비(검색량 ÷ 문서수) 순으로 주제당 10개를 남긴다.
 * 자리(SERP)는 재지 않는다 — 그건 선점 회차가 브라이트데이터로 잰다. 그래서 파일에 그렇게 적는다.
 * 카드 답 검색어(날씨·프로필·시세)와 유통기한 짧은 말은 보드와 같은 가드로 뺀다.
 *
 * 실측·단순 산술만 싣는다. 추정치는 없다(사장님 규칙).
 *
 * 쓰기:
 *   node scripts/today-picks.js --out=today-picks.json            # data/seed-db.json 을 읽는다
 *   node scripts/today-picks.js --warehouse=경로 --perTopic=20     # 다른 창고·후보 폭
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

async function main() {
  const warehousePath = path.resolve(arg('warehouse') || path.join(__dirname, '..', 'data', 'seed-db.json'));
  const outPath = path.resolve(arg('out') || 'today-picks.json');
  const perTopic = Number(arg('perTopic')) || 20;
  const keep = Number(arg('keep')) || 10;
  const gapMs = Number(arg('gapMs')) || 150;

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

  console.log(`오늘의 추천키워드 — 창고 ${db.seeds.length.toLocaleString('ko-KR')}개 · 주제 ${topics.length} · 주제당 후보 ${perTopic} · 남김 ${keep}`);
  const result = {
    builtAt: new Date().toISOString(),
    warehouseBuiltAt: db.builtAt || null,
    perTopic,
    keep,
    /** 화면이 그대로 옮겨 적을 수 있는 방법 설명 — 숫자의 출처와 한계. */
    method: {
      searchVolume: '검색광고 키워드도구 월간 검색량 실측(PC+모바일)',
      documentCount: '네이버 블로그 오픈 API 문서수 실측',
      ratio: '검색량 ÷ 문서수 — 1 을 넘으면 수요가 공급을 넘는다',
      depth: '월 평균 노출 검색광고 수 실측 · 0 이면 광고주가 없는 말',
      serp: '자리(상위 10개 정면 글·빈자리)는 재지 않았다 — 선점 회차가 브라이트데이터로 잰다',
    },
    topics: [],
  };
  let calls = 0;
  for (const t of topics) {
    const cand = byTopic.get(t).sort((a, b) => b.searchVolume - a.searchVolume).slice(0, perTopic);
    const rows = [];
    for (const c of cand) {
      let documentCount = null;
      try { documentCount = await getNaverBlogDocumentCount(c.keyword, { config: openApi }); } catch { documentCount = null; }
      calls += 1;
      if (typeof documentCount === 'number' && documentCount > 0) {
        rows.push({
          keyword: c.keyword,
          searchVolume: c.searchVolume,
          documentCount,
          ratio: Math.round((c.searchVolume / documentCount) * 100) / 100,
          depth: typeof c.depth === 'number' ? c.depth : null,
          comp: c.comp || null,
          source: String(c.source || '').split(':')[0] || null,
        });
      }
      await sleep(gapMs);
    }
    rows.sort((a, b) => b.ratio - a.ratio);
    result.topics.push({ topic: t, candidates: cand.length, measured: rows.length, rows: rows.slice(0, keep) });
    console.log(`  ${t.padEnd(8)} 후보 ${String(cand.length).padStart(2)} → 문서수 ${String(rows.length).padStart(2)} → 남김 ${Math.min(rows.length, keep)}  (누적 호출 ${calls})`);
    // 중간 저장 — 도중에 죽어도 잰 만큼은 남는다.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf8');
  }
  const total = result.topics.reduce((n, t) => n + t.rows.length, 0);
  const golden = result.topics.reduce((n, t) => n + t.rows.filter((r) => r.ratio >= 1).length, 0);
  console.log(`끝 — 행 ${total} · 황금 비율 ${golden} · 오픈 API 호출 ${calls} → ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`오늘의 추천키워드 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
