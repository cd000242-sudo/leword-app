#!/usr/bin/env node
/**
 * 0단계: Bright Data 예산 모델 — "주중 2회 배치가 무료 5,000 안에 들어오는가"
 *
 * 왜 이게 먼저인가:
 *   SERP 판정을 퍼널의 어느 지점에 두느냐로 월 사용량이 10배 갈린다. 후보 전량에
 *   태우면 넘치고, 최종 행에만 태우면 남는다. 이 숫자를 모르고 배치 러너를 먼저
 *   짜면 주기·후보 수·퍼널 폭을 전부 다시 짜게 된다.
 *
 * 이 스크립트는 Bright Data 를 호출하지 않는다. 실제 코드의 설정 상수를 읽어
 * 퍼널 시나리오별 월 사용량을 계산하고 무료 한도와 대조할 뿐이다.
 *
 * 사용:
 *   node scripts/brightdata-budget-model.js
 *   node scripts/brightdata-budget-model.js --runsPerWeek=2
 *   node scripts/brightdata-budget-model.js --budget=30    월 $30 까지 쓸 수 있을 때
 *
 * 유료 구간까지 본다:
 *   무료 한도를 넘겨도 되는 상황이면 "얼마 더 내고 얼마나 더 정확해지는가"가
 *   진짜 질문이다. 서버 $52 와 같은 자를 대고 비교할 수 있어야 판단이 선다.
 *
 * 한계(정직하게):
 *   퍼널 통과율(passRate)은 아직 실측값이 아니다. 그래서 단일 숫자를 뱉지 않고
 *   통과율을 훑어가며 "어디서 한도가 깨지는가(손익분기)"를 같이 보여준다.
 *   실측은 배치 러너에 카운터를 달아 1회 돌려봐야 확정된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function argNumber(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  const v = Number(found ? found.slice(name.length + 3) : fallback);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 실제 인제스트 스크립트에서 설정 상수를 읽는다 — 문서가 아니라 코드가 근거다. */
function readIngestConfig() {
  const file = path.resolve(__dirname, 'run-core-golden-ingest.js');
  const src = fs.readFileSync(file, 'utf8');
  const categories = (src.match(/const CORE_DISCOVERY_CATEGORIES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/) || [])[1];
  const categoryCount = categories ? (categories.match(/'/g) || []).length / 2 : 0;
  const target = Number((src.match(/argNumber\('targetPerCategory',\s*(\d+)\)/) || [])[1] || 0);
  const maxCand = Number((src.match(/argNumber\('maxCandidatesPerCategory',\s*(\d+)\)/) || [])[1] || 0);
  return { file, categoryCount, targetPerCategory: target, maxCandidatesPerCategory: maxCand };
}

/** 거버너의 무료 상한 — env 로 조정 가능하므로 같은 경로로 읽는다. */
function freeCeiling() {
  const raw = Number(process.env.LEWORD_BRIGHTDATA_FREE_CEILING);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 5000;
}

const cfg = readIngestConfig();
const CEILING = freeCeiling();
/** Bright Data 유료 단가. 거버너 주석 기준 $3 / 1,000 요청. */
const PAID_PER_1K = argNumber('paidPer1k', 3);
/** 월 지출 상한(USD). 0 이면 무료 안에서만. */
const BUDGET_USD = Number(
  (process.argv.find((a) => a.startsWith('--budget=')) || '').slice(9) || 0,
);
const runsPerWeek = argNumber('runsPerWeek', 2);
// 월 환산은 4.345주(=365/7/12). "월 8회"로 어림하면 12% 과소평가된다.
const runsPerMonth = runsPerWeek * (365 / 7 / 12);

const candidatesPerRun = cfg.categoryCount * cfg.maxCandidatesPerCategory;
const finalRowsPerRun = cfg.categoryCount * cfg.targetPerCategory;

console.log('Bright Data 예산 모델 — BD 호출 0회\n');
console.log('실제 설정값 (근거: scripts/run-core-golden-ingest.js)');
console.log(`  카테고리                ${cfg.categoryCount}개`);
console.log(`  카테고리당 최대 후보    ${cfg.maxCandidatesPerCategory}건`);
console.log(`  카테고리당 최종 행      ${cfg.targetPerCategory}건`);
console.log(`  → 1회 실행 후보 총량    ${candidatesPerRun.toLocaleString()}건`);
console.log(`  → 1회 실행 최종 행      ${finalRowsPerRun.toLocaleString()}건`);
console.log(`\n배치 주기               주 ${runsPerWeek}회 = 월 ${runsPerMonth.toFixed(1)}회`);
console.log(`무료 한도               월 ${CEILING.toLocaleString()}회\n`);

const scenarios = [
  { name: 'A. 후보 전량에 SERP', perRun: candidatesPerRun,
    note: '가장 정확하지만 가장 비싸다' },
  { name: 'B. 최종 행에만 SERP', perRun: finalRowsPerRun,
    note: '최종 노출분만 검증. 버려진 후보의 오탈락은 못 잡는다' },
  { name: 'C. 최종 행 + 탈락 표본', perRun: finalRowsPerRun + Math.round(candidatesPerRun * 0.05),
    note: '탈락분 5% 를 표본 감사해 오탈락률을 추적한다' },
];

/** 무료를 넘긴 만큼의 월 비용(USD). */
function paidCost(monthly) {
  return Math.max(0, monthly - CEILING) * (PAID_PER_1K / 1000);
}

console.log('시나리오별 월 사용량 / 비용');
console.log('─'.repeat(72));
for (const s of scenarios) {
  const monthly = Math.round(s.perRun * runsPerMonth);
  const pct = (monthly / CEILING) * 100;
  const cost = paidCost(monthly);
  const money = cost === 0 ? '무료' : `$${cost.toFixed(2)}/월`;
  console.log(`${s.name.padEnd(24)} 회당 ${String(s.perRun).padStart(5)}  월 ${String(monthly).padStart(6)}  한도의 ${String(pct.toFixed(0)).padStart(3)}%  ${money}`);
  console.log(`${''.padEnd(24)} ${s.note}`);
}

console.log('\n손익분기 — 후보 중 몇 %에 SERP 를 태우면 한도가 깨지는가');
console.log('─'.repeat(72));
const breakEvenRate = CEILING / (candidatesPerRun * runsPerMonth);
console.log(`  통과율 ${(breakEvenRate * 100).toFixed(1)}% 까지 무료. 넘으면 유료로 샌다.`);
console.log(`  (= 1회 실행당 SERP ${Math.floor(CEILING / runsPerMonth)}건이 상한)\n`);

console.log('통과율 민감도');
for (const rate of [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0]) {
  const monthly = Math.round(candidatesPerRun * rate * runsPerMonth);
  const mark = monthly <= CEILING ? 'OK ' : '초과';
  console.log(`  ${String(Math.round(rate * 100)).padStart(3)}%  월 ${String(monthly).padStart(6)}회  ${mark}`);
}

// ── 유료 구간 ───────────────────────────────────────────────────────
console.log('\n예산을 쓰면 어디까지 가는가');
console.log('─'.repeat(72));
for (const usd of [0, 5, 10, 20, 30, 52]) {
  const affordable = CEILING + Math.floor((usd / PAID_PER_1K) * 1000);
  const perRun = Math.floor(affordable / runsPerMonth);
  const coverage = Math.min(100, (perRun / candidatesPerRun) * 100);
  const label = usd === 0 ? '무료만' : `$${usd}/월`;
  const note = usd === 52 ? '  ← 지금 서버와 동액' : '';
  console.log(
    `  ${label.padEnd(8)} 월 ${String(affordable).padStart(6)}회  회당 ${String(perRun).padStart(4)}건  `
    + `후보 커버리지 ${coverage.toFixed(0)}%${note}`,
  );
}
const fullCoverageCost = paidCost(Math.round(candidatesPerRun * runsPerMonth));
console.log(`\n  후보 전량(회당 ${candidatesPerRun}건) 커버 비용: $${fullCoverageCost.toFixed(2)}/월`);

if (BUDGET_USD > 0) {
  const affordable = CEILING + Math.floor((BUDGET_USD / PAID_PER_1K) * 1000);
  const perRun = Math.floor(affordable / runsPerMonth);
  console.log(`\n지정 예산 $${BUDGET_USD}/월 기준`);
  console.log(`  월 ${affordable}회 · 회당 ${perRun}건 까지 가능`);
  console.log(`  거버너 설정: LEWORD_BRIGHTDATA_PAID_OVERAGE=${affordable - CEILING}`);
  console.log('  ⚠️ 이 값을 열기 전까지는 무료 한도에서 자동으로 멈춘다(기본 0).');
}

console.log('\n다음에 확정해야 할 것');
console.log('  퍼널 통과율은 아직 추정이다. 배치 러너에 카운터를 달아 1회 돌려야 실측된다.');
console.log('  그때까지는 거버너 feature cap 으로 golden 상한을 걸어 유료 유출을 막는 게 안전하다.');
console.log(`  예: LEWORD_BRIGHTDATA_FEATURE_CAPS='{"golden":${Math.floor(CEILING * 0.6)}}'`);
