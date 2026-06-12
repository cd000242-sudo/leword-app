import { rankMindmapExpansionCandidates } from '../mindmap-expansion-quality';

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

const supplement = rankMindmapExpansionCandidates('닥터린 영양제 추천', [
  { keyword: '닥터린 영양제 후기', sources: ['autocomplete'] },
  { keyword: '뉴트리원 영양제 추천', sources: ['sibling'] },
  { keyword: '영양제 복용시간', sources: ['autocomplete'] },
  { keyword: '바로가기 이동', sources: ['naver-smartblock'] },
  { keyword: '박나래 갑질 가격', sources: ['title-extract'] },
  { keyword: '나이키 운동화 추천', sources: ['naver-shopping'] },
], 10).map(item => item.keyword);

assert('mindmap keeps direct autocomplete expansion', supplement.includes('닥터린 영양제 후기'), supplement.join(', '));
assert('mindmap keeps semantic sibling with same head', supplement.includes('뉴트리원 영양제 추천'), supplement.join(', '));
assert('mindmap keeps useful informational longtail', supplement.includes('영양제 복용시간'), supplement.join(', '));
assert('mindmap drops navigation noise', !supplement.includes('바로가기 이동'), supplement.join(', '));
assert('mindmap drops unrelated title noise', !supplement.includes('박나래 갑질 가격'), supplement.join(', '));
assert('mindmap drops unrelated shopping drift', !supplement.includes('나이키 운동화 추천'), supplement.join(', '));

const virenneReview = rankMindmapExpansionCandidates('비렌느스팟엑스 후기', [
  { keyword: '비렌느 스팟 엑스 내돈내산', sources: ['completed-pool'], monthlyVolume: 12380 },
  { keyword: '비렌느 스팟 엑스 쥐젖 후기', sources: ['naver-relkwd'], monthlyVolume: 4910 },
  { keyword: '비렌느 스팟 엑스 효과', sources: ['autocomplete'], monthlyVolume: 1280 },
  { keyword: '비렌느 스팟 엑스 부작용', sources: ['autocomplete'], monthlyVolume: 1900 },
  { keyword: '비렌느 스팟 엑스 편평사마귀', sources: ['completed-pool'], monthlyVolume: 780 },
  { keyword: '비렌느스팟엑스 방법', sources: ['intent-fallback'] },
  { keyword: '비렌느스팟엑스 뜻', sources: ['intent-fallback'] },
  { keyword: '토리든 세럼', sources: ['naver-relkwd'], monthlyVolume: 7700 },
], 12).map(item => item.keyword);

assert('mindmap reuses completed/product candidates for expanded review seed',
  [
    '비렌느 스팟 엑스 내돈내산',
    '비렌느 스팟 엑스 쥐젖 후기',
    '비렌느 스팟 엑스 효과',
    '비렌느 스팟 엑스 부작용',
  ].every(keyword => virenneReview.includes(keyword)),
  virenneReview.join(', '));

assert('mindmap blocks generic hardcoded suffixes for expanded product seeds',
  !virenneReview.some(keyword => /방법|뜻|종류|정리|문제|사례|원인|최신|FAQ/.test(keyword)),
  virenneReview.join(', '));

const noSyntheticBackfill = rankMindmapExpansionCandidates('비렌느스팟엑스 후기', [], 20).map(item => item.keyword);
assert('mindmap does not synthesize hardcoded keywords when live candidates are empty',
  noSyntheticBackfill.length === 0,
  noSyntheticBackfill.join(', '));

const adjacentBeautyProducts = rankMindmapExpansionCandidates('비렌느스팟엑스 후기', [
  { keyword: '토리든 세럼', sources: ['naver-relkwd'], monthlyVolume: 7700 },
  { keyword: '세포랩 에센스', sources: ['naver-relkwd'], monthlyVolume: 5400 },
  { keyword: '웰라쥬 앰플', sources: ['naver-relkwd'], monthlyVolume: 4200 },
  { keyword: '더고운 글루타샷', sources: ['naver-relkwd'], monthlyVolume: 3900 },
  { keyword: '아이폰 가격', sources: ['naver-relkwd'], monthlyVolume: 9000 },
], 10).map(item => item.keyword);
assert('mindmap keeps adjacent same-category products from real related sources',
  ['토리든 세럼', '세포랩 에센스', '웰라쥬 앰플', '더고운 글루타샷'].every(keyword => adjacentBeautyProducts.includes(keyword)),
  adjacentBeautyProducts.join(', '));
assert('mindmap rejects unrelated adjacent products from real related sources',
  !adjacentBeautyProducts.includes('아이폰 가격'),
  adjacentBeautyProducts.join(', '));

const policySparse = rankMindmapExpansionCandidates('고유가 지원금 2차', [
  { keyword: '고유가 지원금 2차 가격', sources: ['autocomplete'] },
  { keyword: '고유가 지원금 2차 추천', sources: ['autocomplete'] },
], 24).map(item => item.keyword);
assert('mindmap does not backfill policy article-pillar templates from sparse candidates',
  !policySparse.some(keyword => /신청방법|자격|대상|서류|조회|문의처/.test(keyword)),
  policySparse.join(', '));

const sibling = rankMindmapExpansionCandidates('뉴발란스 운동화', [
  { keyword: '나이키 운동화', sources: ['sibling'] },
  { keyword: '아디다스 운동화 추천', sources: ['sibling', 'autocomplete'] },
  { keyword: '아이폰 가격', sources: ['autocomplete'] },
  { keyword: '나이키운동화', sources: ['sibling'] },
], 10).map(item => item.keyword);

assert('mindmap keeps peer brand with same product head', sibling.includes('나이키 운동화'), sibling.join(', '));
assert('mindmap keeps peer brand commercial variant', sibling.includes('아디다스 운동화 추천'), sibling.join(', '));
assert('mindmap drops unrelated category candidate', !sibling.includes('아이폰 가격'), sibling.join(', '));
assert('mindmap removes compact duplicates', sibling.filter(k => k.replace(/\s+/g, '') === '나이키운동화').length === 1, sibling.join(', '));

console.log(`\n[mindmap-expansion-quality.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
