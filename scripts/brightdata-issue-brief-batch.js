#!/usr/bin/env node
/**
 * 실시간 검색어 → 이슈 브리프 주입 배치
 *
 * 왜 필요한가:
 *   마인드맵이 "이정후 적시타 전말" 같은 라벨과 "배경, 현재 반응, 남은 쟁점 분리"
 *   라는 고정 문구만 보여준다. 사실이 없어서 초보자가 이걸 보고 글을 못 쓴다.
 *   Bright Data 로 뉴스탭을 받아 실제 정황을 뽑아 스냅샷에 심는다.
 *
 * 무엇을 심는가 (item.insight):
 *   facts   기사 원문에서 뽑은 사실 문장(각 문장이 어느 기사에서 왔는지 포함)
 *   links   공식 확인용 기사 링크 + 언론사
 *   images  기사 대표 사진
 *   press   다룬 언론사 목록
 *   지어내지 않는다. 전부 기사에 실재하는 것만.
 *
 * 예산:
 *   키워드 1건 = BD 1회. 5개 레인 전량이면 하루 39건 ≈ 월 1,170건(무료 5,000의 23%).
 *   황금보드(월 3,000)와 같이 돌려도 무료 안에 들어온다.
 *
 * 사용:
 *   node scripts/brightdata-issue-brief-batch.js --in=source-signals.json --out=enriched.json
 *   ... --dryRun          네트워크 없이 대상만 계산(BD 호출 0회)
 *   ... --limit=5         상위 N건만(실측·시범용)
 *   ... --lanes=naver,zum 특정 레인만
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { brightDataFetch } = require('../src/utils/brightdata-client');
const { extractIssueBrief } = require('../src/utils/issue-brief-extractor');
const { toReadableFacts } = require('../src/utils/issue-brief-readable');
const { brightDataQuotaSnapshot } = require('../src/utils/brightdata-quota-governor');

const FEATURE = 'mindmap';
const DELAY_MS = 400;
const DEFAULT_IN = path.resolve(
  __dirname, '..', 'tmp', 'leaderspro-admin-work', 'spa', 'public', 'data', 'source-signals.json',
);

function arg(name) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newsUrl(keyword) {
  return `https://search.naver.com/search.naver?ssc=tab.news.all&where=news&query=${encodeURIComponent(keyword)}`;
}

/** 브리프를 클라이언트가 쓸 모양으로 줄인다. 스냅샷이 무한정 커지지 않게. */
function toInsight(brief) {
  const facts = toReadableFacts(brief.facts, 4);
  if (facts.length === 0) return null;
  return {
    facts: facts.map((f) => ({ text: f.text, sourceIndex: f.sourceIndex })),
    links: brief.links.slice(0, 3).map((l) => ({ url: l.url, press: l.press })),
    images: brief.articles.map((a) => a.imageUrl).filter(Boolean).slice(0, 3),
    press: [...new Set(brief.articles.map((a) => a.press).filter(Boolean))].slice(0, 6),
    headlines: brief.articles.map((a) => a.title).filter(Boolean).slice(0, 6),
    collectedAt: new Date().toISOString(),
  };
}

async function main() {
  const inPath = arg('in') || DEFAULT_IN;
  const outPath = arg('out') || inPath;
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }

  const dryRun = hasFlag('dryRun');
  const limit = Number(arg('limit')) || 0;
  const laneFilter = arg('lanes') ? arg('lanes').split(',').map((s) => s.trim()).filter(Boolean) : [];

  const snapshot = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const lanes = Array.isArray(snapshot.lanes) ? snapshot.lanes : [];

  // 대상 수집 — 같은 키워드가 여러 레인에 겹치면 한 번만 부른다(호출 절약).
  const targets = [];
  const seen = new Map();
  for (const lane of lanes) {
    if (laneFilter.length > 0 && !laneFilter.includes(lane.id)) continue;
    for (const item of (lane.items || [])) {
      const keyword = String(item.keyword || item.title || '').trim();
      if (!keyword) continue;
      if (!seen.has(keyword)) { seen.set(keyword, []); targets.push(keyword); }
      seen.get(keyword).push(item);
    }
  }
  const planned = limit > 0 ? targets.slice(0, limit) : targets;

  const before = brightDataQuotaSnapshot();
  console.log('='.repeat(70));
  console.log('실시간 검색어 이슈 브리프 배치');
  console.log('='.repeat(70));
  console.log(`  레인          ${lanes.map((l) => l.id).join(', ')}`);
  console.log(`  고유 키워드   ${targets.length}건 (중복 제거 후)`);
  console.log(`  이번 실행     ${planned.length}건 = BD ${planned.length}회`);
  console.log(`  이번 달 사용  ${before.used} / ${before.freeCeiling} (남은 ${before.remainingFree})\n`);

  if (dryRun) {
    planned.forEach((k, i) => console.log(`  ${String(i + 1).padStart(3)}. ${k}`));
    console.log('\ndryRun — Bright Data 를 호출하지 않고 종료합니다.');
    process.exit(0);
  }

  let enriched = 0;
  let empty = 0;
  let failed = 0;
  for (let i = 0; i < planned.length; i += 1) {
    const keyword = planned[i];
    await sleep(DELAY_MS);
    const res = await brightDataFetch(newsUrl(keyword), FEATURE);
    if (!res.ok) {
      failed += 1;
      console.log(`  ?? ${keyword.padEnd(24)} 수집실패 ${res.quotaBlocked ? '쿼터차단' : res.error}`);
      if (res.quotaBlocked) { console.log('  쿼터 한도 도달 — 중단합니다.'); break; }
      continue;
    }
    const insight = toInsight(extractIssueBrief(res.body, keyword));
    if (!insight) {
      empty += 1;
      console.log(`  -- ${keyword.padEnd(24)} 쓸만한 사실 없음(기사 부족)`);
      continue;
    }
    // 같은 키워드를 쓰는 모든 레인 아이템에 같은 브리프를 심는다.
    for (const item of seen.get(keyword)) item.insight = insight;
    enriched += 1;
    console.log(`  OK ${keyword.padEnd(24)} 사실 ${insight.facts.length} · 링크 ${insight.links.length} · 사진 ${insight.images.length}`);
  }

  const after = brightDataQuotaSnapshot();
  console.log('\n' + '-'.repeat(70));
  console.log(`주입 ${enriched}건 / 사실없음 ${empty}건 / 실패 ${failed}건`);
  console.log(`사용량 ${before.used} → ${after.used} (이번 실행 ${after.used - before.used}건)`);
  console.log(`남은 무료 한도 ${after.remainingFree}건`);

  if (enriched === 0) {
    // 좋은 스냅샷을 빈 결과로 덮지 않는다.
    console.log('주입된 것이 없어 스냅샷을 덮어쓰지 않습니다.');
    process.exit(1);
  }

  snapshot.insightUpdatedAt = new Date().toISOString();
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 1), 'utf8');
  fs.renameSync(tmp, outPath);
  console.log(`저장: ${outPath}`);
  console.log('-'.repeat(70));
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
