import * as fs from 'fs';
import * as path from 'path';
import {
  rankKeywordExpansionStrings,
  rankKeywordExpansionCandidates,
} from '../keyword-expansion-ranker';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const supplement = rankKeywordExpansionStrings('닥터린 영양제 추천', [
  '닥터린 영양제 후기',
  '닥터린 영양제 복용시간',
  '닥터린 영양제 부작용',
  '나이키 운동화 추천',
  '바로가기 이동',
], {
  source: 'autocomplete',
  limit: 10,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
});
assert('ranker keeps real same-seed expansion candidates',
  ['닥터린 영양제 후기', '닥터린 영양제 복용시간', '닥터린 영양제 부작용'].every(keyword => supplement.includes(keyword)),
  supplement.join(', '));
assert('ranker drops unrelated/noisy candidates without synthetic replacement',
  !supplement.includes('나이키 운동화 추천') && !supplement.includes('바로가기 이동'),
  supplement.join(', '));

const virenne = rankKeywordExpansionCandidates('비렌느스팟엑스 후기', [
  { keyword: '비렌느 스팟 엑스 내돈내산', sources: ['completed-pool'], monthlyVolume: 12380 },
  { keyword: '비렌느 스팟 엑스 쥐젖 후기', sources: ['naver-relkwd'], monthlyVolume: 4910 },
  { keyword: '비렌느 스팟 엑스 효과', sources: ['autocomplete'], monthlyVolume: 1280 },
  { keyword: '비렌느 스팟 엑스 부작용', sources: ['autocomplete'], monthlyVolume: 1900 },
  { keyword: '비렌느스팟엑스 방법', sources: ['intent-fallback'] },
  { keyword: '비렌느스팟엑스 뜻', sources: ['intent-fallback'] },
], {
  limit: 12,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 8,
}).map(item => item.keyword);

assert('ranker preserves completed product-review candidates for expanded seed',
  [
    '비렌느 스팟 엑스 내돈내산',
    '비렌느 스팟 엑스 쥐젖 후기',
    '비렌느 스팟 엑스 효과',
    '비렌느 스팟 엑스 부작용',
  ].every(keyword => virenne.includes(keyword)),
  virenne.join(', '));
assert('ranker does not prefer hardcoded intent-fallback candidates',
  !virenne.some(keyword => /방법|뜻|종류|정리|문제|사례|원인|최신|FAQ/.test(keyword)),
  virenne.join(', '));

const emptyDefault = rankKeywordExpansionStrings('비렌느스팟엑스 후기', [], {
  source: 'autocomplete',
  limit: 20,
  minScore: 30,
  ensureIntentCoverage: true,
  intentCoverageMin: 12,
});
assert('ranker returns empty output when live candidates are empty by default',
  emptyDefault.length === 0,
  emptyDefault.join(', '));

const adjacentBeautyProducts = rankKeywordExpansionCandidates('비렌느스팟엑스 후기', [
  { keyword: '토리든 세럼', sources: ['naver-relkwd'], monthlyVolume: 7700 },
  { keyword: '세포랩 에센스', sources: ['naver-relkwd'], monthlyVolume: 5400 },
  { keyword: '웰라쥬 앰플', sources: ['naver-relkwd'], monthlyVolume: 4200 },
  { keyword: '더고운 글루타샷', sources: ['naver-relkwd'], monthlyVolume: 3900 },
  { keyword: '아이폰 가격', sources: ['naver-relkwd'], monthlyVolume: 9000 },
], {
  limit: 10,
  minScore: 30,
  fallbackMinScore: 22,
}).map(item => item.keyword);

assert('ranker keeps adjacent same-category products from real Naver related sources',
  ['토리든 세럼', '세포랩 에센스', '웰라쥬 앰플', '더고운 글루타샷'].every(keyword => adjacentBeautyProducts.includes(keyword)),
  adjacentBeautyProducts.join(', '));
assert('ranker still blocks unrelated adjacent products even from related-source candidates',
  !adjacentBeautyProducts.includes('아이폰 가격'),
  adjacentBeautyProducts.join(', '));

const keywordAnalysisHandler = fs.readFileSync(
  path.join(__dirname, '..', '..', 'main', 'handlers', 'keyword-analysis.ts'),
  'utf8',
);
const naverAutocompleteSource = fs.readFileSync(
  path.join(__dirname, '..', 'naver-autocomplete.ts'),
  'utf8',
);
const mindmapQualitySource = fs.readFileSync(
  path.join(__dirname, '..', 'mindmap-expansion-quality.ts'),
  'utf8',
);

assert('keyword analysis expansion paths explicitly disable synthetic fallback',
  (keywordAnalysisHandler.match(/allowSyntheticFallback:\s*false/g) || []).length >= 3,
  'keyword-analysis.ts must keep all user-facing expansion calls real-source only');

assert('naver autocomplete ranking explicitly disables synthetic fallback',
  (naverAutocompleteSource.match(/allowSyntheticFallback:\s*false/g) || []).length >= 2
    && /rankKeywordExpansionCandidates/.test(naverAutocompleteSource),
  'naver-autocomplete.ts can still synthesize missing suggestions');

assert('mindmap quality gate has no empty-candidate intent backfill branch',
  !/rankKeywordExpansionCandidates\(seed,\s*\[\],/.test(mindmapQualitySource),
  'mindmap can still generate hardcoded suffixes when candidates are thin');

console.log(`\n[keyword-expansion-ranker.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
