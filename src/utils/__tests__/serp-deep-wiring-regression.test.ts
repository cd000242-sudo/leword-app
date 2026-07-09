/**
 * serp-deep-wiring-regression.test.ts
 *
 * C2 phase2 심층 SERP enricher 가 on-demand 발굴(find-golden-keywords)에 graceful-degrade 로
 * 연결돼 있음을 소스 패턴으로 고정. 핵심 계약: 브라우저 미가용/quickPreview 시 완전 스킵(무회귀),
 * 실패해도 발굴 본류를 막지 않으며, 코어 등급/score 는 실측 SERP 로 되먹이지 않는다.
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}

const disc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-discovery.ts'),
  'utf8',
);
const mdp = fs.readFileSync(path.join(__dirname, '..', 'mdp-engine.ts'), 'utf8');

// ── enricher 연결 ──
assert('enrichKeywordsWithDeepSerp import',
  /import\s*\{[^}]*enrichKeywordsWithDeepSerp[^}]*\}\s*from\s*'[^']*deep-serp-enricher'/.test(disc));
assert('isChromeAvailable import(값싼 pre-flight)',
  /import\s*\{\s*isChromeAvailable\s*\}\s*from\s*'[^']*chrome-finder'/.test(disc));
assert('analyzeSmartBlocks analyzer 주입',
  /analyzer:\s*analyzeSmartBlocks/.test(disc));

// ── graceful-degrade 게이트: quickPreview 제외 + isChromeAvailable pre-flight + abort 존중 ──
assert('브라우저 가용성 pre-flight 게이트',
  /if\s*\(\s*!quickPreview[\s\S]{0,120}isChromeAvailable\(\)/.test(disc),
  'enrich 는 반드시 !quickPreview && isChromeAvailable() 로 게이트돼야 함(미가용 시 스킵)');

// ── 발굴 본류 보호: enrich 블록 try/catch + enricher .catch 폴백 ──
assert('enricher 실패 시 빈 Map 폴백',
  /enrichKeywordsWithDeepSerp\([\s\S]{0,200}\.catch\(\(\)\s*=>\s*new\s+Map/.test(disc));
assert('실측 SERP 블록 try/catch(발굴 안 막음)',
  /실측 SERP 심층분석 스킵/.test(disc));

// ── 코어 등급/score 무회귀: serpAdjustedCompetition 을 grade/score 에 되먹이지 않음 ──
assert('applySerpDifficulty 는 winnable 주석용으로만 사용',
  /applySerpDifficulty\([\s\S]{0,60}\)\.winnable/.test(disc));
assert('grade/score 를 serpAdjusted 로 재산정하지 않음',
  !/grade\s*=\s*[^;]*serpAdjustedCompetition/.test(disc)
  && !/score\s*=\s*[^;]*serpAdjustedCompetition/.test(disc));

// ── MDPResult 부가필드(additive, 옵션) ──
assert('MDPResult.winnable? 선언', /winnable\?\s*:\s*boolean/.test(mdp));
assert('MDPResult.serpMeasured? 선언', /serpMeasured\?\s*:\s*boolean/.test(mdp));

// ── 24/7 워커(live-golden-radar)엔 puppeteer 미연결(부하 회피) ──
const radar = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'live-golden-radar.ts'), 'utf8');
assert('24/7 워커에 analyzeSmartBlocks 미연결', !/analyzeSmartBlocks/.test(radar));
assert('24/7 워커에 deep-serp-enricher 미연결', !/deep-serp-enricher/.test(radar));

console.log(`\n[serp-deep-wiring-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
