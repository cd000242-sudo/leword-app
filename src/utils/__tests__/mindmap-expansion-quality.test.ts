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

const policy = rankMindmapExpansionCandidates('소상공인 지원금', [
  { keyword: '소상공인 지원금 신청', sources: ['naver-relkwd'], monthlyVolume: 2400 },
  { keyword: '정부 지원금 대상', sources: ['autocomplete'] },
  { keyword: '청년 지원금 조건', sources: ['autocomplete'] },
  { keyword: '무선 이어폰 추천', sources: ['naver-shopping'] },
], 10).map(item => item.keyword);

assert('mindmap keeps same seed phrase policy keyword', policy.includes('소상공인 지원금 신청'), policy.join(', '));
assert('mindmap keeps same-head policy keyword', policy.includes('정부 지원금 대상'), policy.join(', '));
assert('mindmap keeps related policy segment keyword', policy.includes('청년 지원금 조건'), policy.join(', '));
assert('mindmap drops unrelated commerce keyword', !policy.includes('무선 이어폰 추천'), policy.join(', '));

const policyPillars = rankMindmapExpansionCandidates('고유가 지원금 2차', [
  { keyword: '고유가 지원금 2차 가격', sources: ['autocomplete'] },
  { keyword: '고유가 지원금 2차 추천', sources: ['autocomplete'] },
], 24).map(item => item.keyword);
const requiredPolicyPillars = [
  '고유가 지원금 2차 신청방법',
  '고유가 지원금 2차 자격',
  '고유가 지원금 2차 혜택',
  '고유가 지원금 2차 지원내용',
  '고유가 지원금 2차 신청기간',
  '고유가 지원금 2차 서류',
  '고유가 지원금 2차 조회',
  '고유가 지원금 2차 문의처',
];
assert('mindmap policy seed backfills article-pillar intents for spiderweb content',
  requiredPolicyPillars.every(keyword => policyPillars.includes(keyword))
    && !policyPillars.some(keyword => /가격|추천|후기|리뷰|비교|순위/.test(keyword.replace('고유가 지원금 2차', ''))),
  policyPillars.join(', '));

const incidentPillars = rankMindmapExpansionCandidates('티빙 정보 유출', [
  { keyword: '티빙 정보 유출 장 가격', sources: ['autocomplete'] },
  { keyword: '티빙 정보 유출 추천', sources: ['autocomplete'] },
], 16).map(item => item.keyword);
assert('mindmap incident seed backfills response intents and blocks commerce noise',
  ['티빙 정보 유출 확인', '티빙 정보 유출 피해 확인', '티빙 정보 유출 공지', '티빙 정보 유출 보상']
    .every(keyword => incidentPillars.includes(keyword))
    && !incidentPillars.some(keyword => /장\s*(방법|가격|비교)|가격|추천|후기|리뷰|비교|순위/.test(keyword.replace('티빙 정보 유출', ''))),
  incidentPillars.join(', '));

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

const genericPillars = rankMindmapExpansionCandidates('티빙 정보', [], 12).map(item => item.keyword);
assert('mindmap generic seed backfills useful article intents instead of empty output',
  ['티빙 정보 방법', '티빙 정보 뜻', '티빙 정보 원인', '티빙 정보 해결', '티빙 정보 주의사항']
    .every(keyword => genericPillars.includes(keyword)),
  genericPillars.join(', '));

console.log(`\n[mindmap-expansion-quality.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
