#!/usr/bin/env node
/**
 * 실검 틈새 보드 발행 — 회차 원장을 사이트가 읽는 공개 JSON 으로 옮긴다.
 *
 * 변환 규칙은 src/utils/issue-niche-board-publish.ts 가 전부 가진다(순수 함수,
 * 테스트 대상). 이 파일은 파일 읽고 쓰는 껍데기다.
 *
 * 안전장치(황금키워드보드 publish-preemption-board.js 와 같다):
 *   ① 이번 회차에 실을 행(틈새·선점 후보)이 0 이면 기존 파일을 덮지 않는다.
 *   ② generator 가 sample/ui-check/test 면 거부한다 — 검증용 가짜 데이터 발행 사고 방지.
 *
 * 사용:
 *   node scripts/publish-issue-niche-board.js --in=issue-board.json
 *   ... --dest=<경로>     기본: site/spa/public/data/issue-niche-board.json
 *   ... --carryHours=48   직전 발행본 이월 시간
 *   ... --dryRun          무엇이 올라갈지만 보여준다
 */
'use strict';

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const { buildIssueBoardPayload } = require('../src/utils/issue-niche-board-publish');

const DEFAULT_DEST = path.join(__dirname, '..', 'site', 'spa', 'public', 'data', 'issue-niche-board.json');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn(`읽기 실패(무시): ${file} — ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function main() {
  const inPath = arg('in');
  if (!inPath) { console.error('--in=<회차 원장 JSON> 이 필요합니다.'); process.exit(2); }
  if (!fs.existsSync(inPath)) { console.error(`입력 파일 없음: ${inPath}`); process.exit(2); }
  const dest = arg('dest') || DEFAULT_DEST;
  const carryHours = Number(arg('carryHours')) || 48;

  const ledger = readJson(inPath);
  if (!ledger) process.exit(2);
  if (/sample|ui-check|test/i.test(String(ledger.generator || ''))) {
    console.error(`거부: generator=${ledger.generator} — 검증용 데이터는 발행하지 않는다.`);
    process.exit(3);
  }

  const prev = fs.existsSync(dest) ? readJson(dest) : null;
  const { payload, fresh, carried, expired } = buildIssueBoardPayload(ledger, prev, { nowMs: Date.now(), carryHours });

  console.log(`원장  ${inPath}  (${ledger.generatedAt || '시각 없음'}, 실측 ${payload.measured.candidates}행)`);
  console.log(`발행  틈새 ${payload.rows.filter((r) => r.verdict === 'niche').length} · 선점 후보 ${payload.rows.filter((r) => r.verdict === 'preemption').length}  ← 신규 ${fresh} + 이월 ${carried} (만료 ${expired})`);
  payload.rows.slice(0, 12).forEach((r) => {
    const mark = r.verdict === 'niche' ? '◆' : '▷';
    console.log(`  ${mark} ${r.keyword}  [${r.issue}] 문서수 ${r.documentCount ?? '—'} · 수요 ${r.hasLiveDemand ? '▲' : '—'}${r.carried ? ' · 이월' : ''}`);
  });

  if (fresh === 0) {
    console.error(`이번 회차에 실을 행이 0 이다 — 기존 파일을 ${fs.existsSync(dest) ? '그대로 둔다' : '만들지 않는다'}.`);
    process.exit(4);
  }
  if (hasFlag('dryRun')) { console.log('\n--dryRun: 쓰지 않았다.'); process.exit(0); }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n발행: ${dest}`);
}

main();
