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

const insuranceCalculator = rankMindmapExpansionCandidates('\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30', [
  { keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC2E4\uC218\uB839\uC561 \uC6D4\uAE09 \uACC4\uC0B0 \uBC29\uBC95 \uCD1D\uC815\uB9AC', sources: ['naver-relkwd'] },
  { keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30: \uAE30\uC900', sources: ['naver-relkwd'] },
  { keyword: '\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30 \uC4F0\uAE30 \uC804 \uD655\uC778\uD560 3\uAC00\uC9C0', sources: ['naver-relkwd'] },
  { keyword: '4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30', sources: ['autocomplete'] },
  { keyword: '4\uB300\uBCF4\uD5D8 \uC694\uC728', sources: ['autocomplete'] },
], 10).map(item => item.keyword);
assert('mindmap drops article-title calculator noise',
  !insuranceCalculator.some(keyword => /\uCD1D\uC815\uB9AC|:|\uD655\uC778\uD560 3\uAC00\uC9C0/.test(keyword)),
  insuranceCalculator.join(', '));
assert('mindmap keeps concise measured-search calculator candidates',
  insuranceCalculator.includes('4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30')
    && insuranceCalculator.includes('4\uB300\uBCF4\uD5D8 \uC694\uC728'),
  insuranceCalculator.join(', '));

const hongMindmap = rankMindmapExpansionCandidates('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4', [
  { keyword: 'AEO \uB2F5\uBCC0\uD615', sources: ['ai-strategy'] },
  { keyword: 'GEO \uADFC\uAC70\uD615', sources: ['ai-strategy'] },
  { keyword: '\uC800\uACBD\uC7C1 \uD6C4\uD0B9 \uC81C\uBAA9', sources: ['ai-strategy'] },
  { keyword: '\uD6C4\uD0B9 \uB871\uD14C\uC77C', sources: ['ai-strategy'] },
  { keyword: '\uC9C8\uBB38 \uD574\uACB0 \uCF58\uD150\uCE20', sources: ['ai-strategy'] },
  { keyword: '\uD2B8\uB798\uD53D \uC21C\uD658 \uD074\uB7EC\uC2A4\uD130', sources: ['ai-strategy'] },
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4, \uC9C0\uAE08 \uBD10\uC57C \uD560 \uAC74 \uB274\uC2A4 \uC81C\uBAA9\uBCF4\uB2E4 \uAE30\uB85D\uC774 \uBC14\uAFBC \uB2E4\uC74C \uD310\uB3C4', sources: ['ai-strategy'] },
  { keyword: '\uAC80\uC0C9\uB7C9 \uBD99\uAE30 \uC804\uC5D0 \uC7A1\uC544\uC57C \uD560 \uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4\uC758 \uC228\uC740 \uBCC0\uC218', sources: ['ai-strategy'] },
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4 \uC774\uC720', sources: ['autocomplete'] },
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4 \uC5EC\uB860', sources: ['autocomplete'] },
  { keyword: '\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uAC10\uB3C5 \uAD50\uCCB4', sources: ['naver-relkwd'] },
], 20).map(item => item.keyword);
assert('mindmap drops content-strategy markdown labels and article-title copy',
  !hongMindmap.some(keyword => /AEO|GEO|\uC800\uACBD\uC7C1|\uD6C4\uD0B9|\uC9C8\uBB38 \uD574\uACB0|\uD2B8\uB798\uD53D|\uB274\uC2A4 \uC81C\uBAA9|\uAC80\uC0C9\uB7C9 \uBD99\uAE30/.test(keyword)),
  hongMindmap.join(', '));
assert('mindmap keeps automation-ready keyword expansions',
  hongMindmap.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4 \uC774\uC720')
    && hongMindmap.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4 \uC5EC\uB860'),
  hongMindmap.join(', '));

const hongIssueBridge = rankMindmapExpansionCandidates('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4', [
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uB2E4\uC74C \uAC10\uB3C5 \uD6C4\uBCF4', sources: ['mindmap-issue-bridge'] },
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC120\uC784 \uACFC\uC815', sources: ['mindmap-issue-bridge'] },
  { keyword: '\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uBE44\uB9AC \uC804\uB9D0', sources: ['mindmap-issue-bridge'] },
  { keyword: '\uC774\uAC15\uC778 \uC774\uC7AC\uC131 \uD22C\uC785 \uC694\uCCAD', sources: ['mindmap-issue-bridge'] },
  { keyword: '\uAE40\uBBFC\uC7AC \uAD50\uCCB4 \uD56D\uC758', sources: ['mindmap-issue-bridge'] },
  { keyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4 \uBC29\uBC95', sources: ['autocomplete'] },
], 10).map(item => item.keyword);
assert('mindmap prioritizes investigative issue branches over shallow suffix-only expansion',
  hongIssueBridge.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uB2E4\uC74C \uAC10\uB3C5 \uD6C4\uBCF4')
    && hongIssueBridge.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC120\uC784 \uACFC\uC815')
    && hongIssueBridge.includes('\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uBE44\uB9AC \uC804\uB9D0')
    && hongIssueBridge.includes('\uC774\uAC15\uC778 \uC774\uC7AC\uC131 \uD22C\uC785 \uC694\uCCAD')
    && hongIssueBridge.includes('\uAE40\uBBFC\uC7AC \uAD50\uCCB4 \uD56D\uC758'),
  hongIssueBridge.join(', '));

console.log(`\n[mindmap-expansion-quality.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
