#!/usr/bin/env node
/**
 * Bright Data 보드 배치 — 주중 2회, 최종 행 검증 + 탈락 표본 감사
 *
 * 왜 두 갈래로 나눠 쓰는가:
 *   최종 행만 검증하면 "내보낸 게 맞는가"는 알아도 "버린 게 아까웠는가"는
 *   영영 모른다. 황금키워드의 목적은 브리핑이 못 찾은 걸 발굴하는 것이고,
 *   판정 지표는 원창출률·원창출품질이다. 그래서 탈락분을 표본으로 같이 태워
 *   오탈락률(문서수로 버렸는데 실제론 먹을 수 있었던 비율)을 추적한다.
 *
 * 표본을 몇 건 볼지는 비율이 아니라 "회당 예산"에서 역산한다.
 * 무료 5,000 은 여러 기능이 나눠 쓰므로(golden/affiliate/youtube/mindmap…)
 * golden 몫을 정해 두고, 최종 행을 채우고 남는 만큼을 전부 탈락 감사에 쓴다.
 * 비율을 고정하면 후보 수가 늘 때 예산을 넘고, 줄 때는 남는 예산을 버린다.
 *
 * 기본값: 회당 344건 (= golden 월 3,000 / 8.7회, 무료의 60%. 나머지 40%는 타 기능 몫)
 *   → 최종 96 + 탈락 248 = 344. 탈락 864건 중 29% 감사.
 *
 * 사용:
 *   BRIGHTDATA_TOKEN=xxx node scripts/brightdata-board-batch.js --in=candidates.json
 *   ... --dryRun            네트워크 없이 소요량만 계산(BD 호출 0회)
 *   ... --maxPerRun=344     이번 실행에서 쓸 총 요청 수
 *   ... --sampleRate=0.3    비율을 직접 지정(예산 상한은 그대로 적용)
 *   ... --out=report.json
 *
 * 입력 형식: { finalists: [{keyword,...}], rejected: [{keyword, reason?}] }
 *            또는 [{keyword, selected: true|false}]
 */
'use strict';

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const { brightDataFetch } = require('../src/utils/brightdata-client');
const { analyzeSerp, verdictFor } = require('../src/utils/serp-winnability');
const { brightDataQuotaSnapshot } = require('../src/utils/brightdata-quota-governor');

const ZONE = process.env.BRIGHTDATA_ZONE || '77';
const DELAY_MS = 400;
const FEATURE = 'golden';
/**
 * 회당 요청 상한. golden 월 3,000 ÷ 주2회(월 8.7회) ≈ 344.
 * 무료 5,000 의 60% 를 golden 몫으로 두고 40% 는 타 기능(affiliate/youtube/mindmap…)에 남긴다.
 */
const DEFAULT_MAX_PER_RUN = 344;

function arg(name) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function blogTabUrl(keyword) {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

/** 입력을 { finalists, rejected } 로 정규화. 두 형식을 모두 받는다. */
function loadCandidates(inPath) {
  const parsed = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  if (Array.isArray(parsed)) {
    return {
      finalists: parsed.filter((r) => r && r.selected).map(normalizeRow).filter(Boolean),
      rejected: parsed.filter((r) => r && !r.selected).map(normalizeRow).filter(Boolean),
    };
  }
  return {
    finalists: (parsed.finalists || []).map(normalizeRow).filter(Boolean),
    rejected: (parsed.rejected || []).map(normalizeRow).filter(Boolean),
  };
}

function normalizeRow(row) {
  const keyword = typeof row === 'string' ? row : (row && (row.keyword || row.title));
  if (!keyword || typeof keyword !== 'string') return null;
  return { keyword: keyword.trim(), reason: (row && row.reason) || '' };
}

/**
 * 표본 추출 — 결정적으로 뽑는다.
 * Math.random 을 쓰면 실행마다 표본이 달라져 오탈락률 추이를 비교할 수 없다.
 * 등간격 추출이라 특정 카테고리에 몰리지도 않는다.
 */
function pickSample(rows, rate) {
  const want = Math.min(rows.length, Math.max(0, Math.round(rows.length * rate)));
  if (want === 0) return [];
  const step = rows.length / want;
  const out = [];
  for (let i = 0; i < want; i += 1) out.push(rows[Math.floor(i * step)]);
  return out;
}

async function judge(keyword) {
  const res = await brightDataFetch(blogTabUrl(keyword), FEATURE, { zone: ZONE });
  if (!res.ok) {
    return { keyword, ok: false, quotaBlocked: Boolean(res.quotaBlocked), error: res.error || res.status };
  }
  const serp = analyzeSerp(res.body, keyword);
  const { verdict, reason } = verdictFor(serp);
  return { keyword, ok: true, ...serp, verdict, reason };
}

async function runLane(label, rows, results) {
  for (let i = 0; i < rows.length; i += 1) {
    await sleep(DELAY_MS);
    const row = await judge(rows[i].keyword);
    results.push({ lane: label, ...row });
    if (row.quotaBlocked) {
      console.log(`  쿼터 한도 도달 — ${label} 레인 중단 (${i}/${rows.length} 처리됨)`);
      return false;
    }
    const icon = !row.ok ? '??' : row.verdict === 'WINNABLE' ? '🟢' : row.verdict === 'CONTESTED' ? '🟡' : '🔴';
    console.log(`  ${icon} [${label}] ${row.keyword.padEnd(24)} ${row.ok ? row.verdict : '수집실패 ' + row.error}`);
  }
  return true;
}

async function main() {
  const inPath = arg('in');
  if (!inPath) { console.error('--in=<후보 JSON> 이 필요합니다.'); process.exit(2); }
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }

  const dryRun = hasFlag('dryRun');
  const maxPerRun = Number(arg('maxPerRun')) || DEFAULT_MAX_PER_RUN;
  const outPath = arg('out');

  const { finalists, rejected } = loadCandidates(inPath);

  // 최종 행은 전량 검증이 원칙이라 예산에서 먼저 뺀다.
  // 남는 예산을 전부 탈락 감사에 쓴다 — 남겨봐야 월말에 소멸한다.
  const roomForSample = Math.max(0, maxPerRun - finalists.length);
  const requestedRate = Number(arg('sampleRate')) || 0;
  const wantSample = requestedRate > 0
    ? Math.round(rejected.length * requestedRate)
    : rejected.length;
  const sampleCount = Math.min(wantSample, roomForSample, rejected.length);
  const sample = pickSample(rejected, rejected.length > 0 ? sampleCount / rejected.length : 0);
  const sampleRate = rejected.length > 0 ? sample.length / rejected.length : 0;
  const planned = finalists.length + sample.length;

  console.log('='.repeat(70));
  console.log(`Bright Data 보드 배치  (존 ${ZONE})`);
  console.log('='.repeat(70));
  console.log(`  최종 행       ${finalists.length}건  → 전량 검증`);
  console.log(`  탈락 후보     ${rejected.length}건  → 표본 ${sample.length}건 (${Math.round(sampleRate * 100)}%)`);
  console.log(`  이번 실행 소요 ${planned}건 / 회당 예산 ${maxPerRun}건`);
  if (sample.length < rejected.length && sample.length === roomForSample) {
    console.log('  (예산이 차서 표본을 잘랐다. --maxPerRun 을 올리면 더 본다)');
  }

  const before = brightDataQuotaSnapshot();
  console.log(`  이번 달 사용  ${before.used} / 한도 ${before.freeCeiling}  (남은 ${before.remainingFree})\n`);

  if (dryRun) {
    // 표본을 찍어준다. 운영자가 무엇이 감사될지 미리 보고,
    // 실행 간 표본이 동일한지(추이 비교 가능한지) 확인할 수 있다.
    console.log('표본 대상:');
    sample.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${r.keyword}`));
    console.log('\ndryRun — Bright Data 를 호출하지 않고 종료합니다.');
    process.exit(0);
  }
  if (!(process.env.BRIGHTDATA_TOKEN || '').trim()) {
    console.error('BRIGHTDATA_TOKEN 환경변수가 필요합니다.');
    process.exit(2);
  }

  const results = [];
  const finished = await runLane('최종', finalists, results);
  if (finished) await runLane('표본', sample, results);

  const judged = results.filter((r) => r.ok);
  const byLane = (lane, v) => judged.filter((r) => r.lane === lane && r.verdict === v).length;

  console.log('\n' + '-'.repeat(70));
  console.log(`판정 완료 ${judged.length}건 / 실패 ${results.length - judged.length}건`);
  console.log(`  최종  🟢 ${byLane('최종', 'WINNABLE')}  🟡 ${byLane('최종', 'CONTESTED')}  🔴 ${byLane('최종', 'LOCKED')}`);
  console.log(`  표본  🟢 ${byLane('표본', 'WINNABLE')}  🟡 ${byLane('표본', 'CONTESTED')}  🔴 ${byLane('표본', 'LOCKED')}`);

  // 오탈락률 — 버린 후보 중 실제로는 먹을 수 있었던 비율. 이 배치의 핵심 산출물이다.
  const sampleJudged = judged.filter((r) => r.lane === '표본');
  if (sampleJudged.length > 0) {
    const missed = sampleJudged.filter((r) => r.verdict === 'WINNABLE').length;
    const rate = Math.round((missed / sampleJudged.length) * 100);
    console.log(`\n오탈락률 ${rate}%  — 버린 ${sampleJudged.length}건 중 ${missed}건은 상위에 정면 대응 글이 없었다`);
    if (rate >= 30) console.log('  ⚠️ 30% 이상이면 앞단 게이트가 과하게 조여 있다는 신호다.');
  } else {
    console.log('\n오탈락률: 표본 판정 0건 — 산출 불가');
  }

  const after = brightDataQuotaSnapshot();
  console.log(`\n사용량 ${before.used} → ${after.used} (이번 실행 ${after.used - before.used}건)`);
  console.log(`남은 무료 한도 ${after.remainingFree}건`);
  console.log('-'.repeat(70));

  if (outPath) {
    const report = {
      checkedAt: new Date().toISOString(),
      planned,
      used: after.used - before.used,
      quota: { before: before.used, after: after.used, freeCeiling: after.freeCeiling, remainingFree: after.remainingFree },
      results,
    };
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), 'utf8');
    console.log(`리포트 저장: ${outPath}`);
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
