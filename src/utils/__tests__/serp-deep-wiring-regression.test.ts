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

// ── C4: keyword-value-verifier 메인 승격(표시용·비필터·무비용) ──
assert('verifyKeywordValue import', /import\s*\{\s*verifyKeywordValue\s*\}\s*from\s*'[^']*keyword-value-verifier'/.test(disc));
assert('발굴 배선은 lenient 모드', /verifyKeywordValue\(\{[\s\S]{0,300}mode:\s*'lenient'/.test(disc));
assert('valueGrade 부가필드 주석', /valueGrade:\s*valueGate\.valueGrade/.test(disc));
assert('MDPResult.valueGrade? 선언', /valueGrade\?\s*:/.test(mdp));
// isKilled 를 랭킹 필터로 쓰지 않음(표시 슬라이스 — 결과 수 급감 방지)
assert('isKilled 로 발굴 결과를 filter 하지 않음',
  !/\.filter\([^)]*valueGate[^)]*isKilled/.test(disc) && !/isKilled\s*\)\s*continue/.test(disc));

// ── C4 slice2: vacancy-detector 상위N 승격(axios → chrome 불필요, 신뢰 실측만 부가) ──
assert('enrichKeywordsWithVacancy import',
  /import\s*\{[^}]*enrichKeywordsWithVacancy[^}]*\}\s*from\s*'[^']*vacancy-enricher'/.test(disc));
assert('vacancy 는 chrome 가드 없이(axios) quickPreview만 제외',
  /if\s*\(\s*!quickPreview[\s\S]{0,120}enrichKeywordsWithVacancy/.test(disc)
  || /enrichKeywordsWithVacancy\(/.test(disc));
assert('vacancy 신뢰 실측(isVacancyReliable)일 때만 부가',
  /isVacancyReliable\(vac\)/.test(disc));
assert('MDPResult.vacancySlots? 선언', /vacancySlots\?\s*:/.test(mdp));

// ── C4 slice3: serp-content-analyzer 실측 콘텐츠 브리핑(chrome 가드, 실측 사실만) ──
assert('enrichKeywordsWithContentBrief import',
  /import\s*\{[^}]*enrichKeywordsWithContentBrief[^}]*\}\s*from\s*'[^']*content-brief-enricher'/.test(disc));
assert('브리핑은 chrome 가드(puppeteer 본문크롤)',
  /if\s*\(\s*!quickPreview[\s\S]{0,150}isChromeAvailable\(\)[\s\S]{0,500}enrichKeywordsWithContentBrief/.test(disc));
assert('브리핑 신뢰 실측일 때만 부가', /isContentBriefReliable\(brief\)/.test(disc));
assert('MDPResult.briefRecommendedWords? 선언', /briefRecommendedWords\?\s*:/.test(mdp));
// win-predictor(예상순위/트래픽 추정치)는 발굴 배선에 미승격(추정치 UI 금지 규칙).
// 주석 언급은 무방 — 실제 import/호출(predictWin())이 없어야 한다.
assert('win-predictor(predictWin) 은 발굴에 미배선(추정치 UI 금지)',
  !/import[^;]*win-predictor/.test(disc) && !/predictWin\s*\(/.test(disc));

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
