import { buildFreshIssueGoldenSeeds } from '../fresh-issue-golden-seeds';
import { generateQueryPatterns } from '../pattern-generator';
import { splitKeywordSemantically } from '../semantic-splitter';
import { ExternalSignals } from '../mdp-engine';

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

const signalMap = new Map<string, ExternalSignals>([
  ['티빙 정보 유출', {
    communityBuzzScore: 92,
    snsLeadingScore: 54,
    sources: ['naver-news', 'theqoo', 'youtube-kr'],
  }],
  ['고유가 지원금 2차', {
    communityBuzzScore: 58,
    snsLeadingScore: 18,
    sources: ['korea-kr', 'naver-news'],
  }],
  ['뉴스', {
    communityBuzzScore: 100,
    snsLeadingScore: 100,
    sources: ['naver-news', 'zum'],
  }],
]);

const freshSeeds = buildFreshIssueGoldenSeeds(signalMap, {
  maxBaseSeeds: 10,
  intentsPerSeed: 10,
});
const seedKeywords = freshSeeds.map(item => item.keyword);

assert('fresh issue radar keeps the base incident seed',
  seedKeywords.includes('티빙 정보 유출'),
  seedKeywords.join(', '));

assert('fresh issue radar expands incident seeds into practical article intents',
  seedKeywords.some(keyword => /티빙 정보 유출.*피해 확인/.test(keyword))
    && seedKeywords.some(keyword => /티빙 정보 유출.*보상/.test(keyword)),
  seedKeywords.join(', '));

assert('fresh issue radar blocks commerce drift for incident seeds',
  !seedKeywords.some(keyword => /티빙 정보 유출.*(가격|추천|후기|리뷰|비교)/.test(keyword)),
  seedKeywords.join(', '));

assert('fresh issue radar expands policy seeds into pillar article intents',
  seedKeywords.some(keyword => /고유가 지원금 2차.*신청방법/.test(keyword))
    && seedKeywords.some(keyword => /고유가 지원금 2차.*자격/.test(keyword))
    && seedKeywords.some(keyword => /고유가 지원금 2차.*혜택/.test(keyword)),
  seedKeywords.join(', '));

assert('fresh issue radar filters generic broad noise',
  !seedKeywords.includes('뉴스'),
  seedKeywords.join(', '));

const policyOnlySeeds = buildFreshIssueGoldenSeeds(signalMap, {
  maxBaseSeeds: 10,
  intentsPerSeed: 4,
  categoryIds: ['policy'],
}).map(item => item.keyword);

assert('fresh issue category filter keeps policy signals inside policy category',
  policyOnlySeeds.some(keyword => keyword.startsWith('고유가 지원금 2차')),
  policyOnlySeeds.join(', '));

assert('fresh issue category filter blocks unrelated incident signals inside policy category',
  !policyOnlySeeds.some(keyword => keyword.startsWith('티빙 정보 유출')),
  policyOnlySeeds.join(', '));

const mixedIssueSeeds = buildFreshIssueGoldenSeeds(new Map<string, ExternalSignals>([
  ['카카오톡 먹통 보상', {
    communityBuzzScore: 88,
    snsLeadingScore: 40,
    sources: ['naver-news', 'theqoo', 'clien'],
  }],
  ['전기요금 감면 변경', {
    communityBuzzScore: 64,
    snsLeadingScore: 22,
    sources: ['korea-kr', 'naver-news'],
  }],
  ['아이돌 컴백 일정', {
    communityBuzzScore: 70,
    snsLeadingScore: 68,
    sources: ['youtube-kr', 'theqoo', 'sbs-ent'],
  }],
  ['뉴진스 컴백 일정', {
    communityBuzzScore: 74,
    snsLeadingScore: 70,
    sources: ['youtube-kr', 'theqoo', 'sbs-ent'],
  }],
  ['임영웅 콘서트 예매', {
    communityBuzzScore: 72,
    snsLeadingScore: 46,
    sources: ['naver-news', 'youtube-kr'],
  }],
]), {
  maxBaseSeeds: 8,
  intentsPerSeed: 5,
}).map(item => item.keyword);

assert('fresh issue radar uses incident-specific intents beyond the first incident example',
  mixedIssueSeeds.includes('카카오톡 먹통 보상 피해 확인')
    && mixedIssueSeeds.includes('카카오톡 먹통 보상 공식 공지')
    && mixedIssueSeeds.includes('카카오톡 먹통 보상 보상 기준')
    && !mixedIssueSeeds.includes('카카오톡 먹통 보상 뜻'),
  mixedIssueSeeds.join(', '));

assert('fresh issue radar uses policy-specific intents beyond support-payment examples',
  mixedIssueSeeds.includes('전기요금 감면 변경 신청방법')
    && mixedIssueSeeds.includes('전기요금 감면 변경 대상')
    && mixedIssueSeeds.includes('전기요금 감면 변경 자격')
    && !mixedIssueSeeds.includes('전기요금 감면 변경 뜻'),
  mixedIssueSeeds.join(', '));

assert('fresh issue radar uses entertainment-specific intents without weak profile filler',
  mixedIssueSeeds.includes('뉴진스 컴백 일정 공식입장')
    && mixedIssueSeeds.includes('뉴진스 컴백 일정 컴백 날짜')
    && mixedIssueSeeds.includes('뉴진스 컴백 일정 신곡')
    && !mixedIssueSeeds.some(keyword => keyword.startsWith('아이돌 컴백 일정'))
    && !mixedIssueSeeds.includes('뉴진스 컴백 일정 나이'),
  mixedIssueSeeds.join(', '));

assert('fresh issue radar uses concert-specific intents without broadcast filler',
  mixedIssueSeeds.includes('임영웅 콘서트 예매 예매 방법')
    && mixedIssueSeeds.includes('임영웅 콘서트 예매 티켓팅')
    && mixedIssueSeeds.includes('임영웅 콘서트 예매 장소')
    && !mixedIssueSeeds.includes('임영웅 콘서트 예매 방송시간')
    && !mixedIssueSeeds.includes('임영웅 콘서트 예매 출연'),
  mixedIssueSeeds.join(', '));

const bulkIssueSignals = new Map<string, ExternalSignals>([
  '뉴진스 컴백 일정',
  '아이브 신곡 발표',
  '임영웅 콘서트 예매',
  '블랙핑크 팬미팅 일정',
  '세븐틴 앨범 티저',
  '카카오톡 먹통 보상',
  '티빙 정보 유출',
  '쿠팡 개인정보 유출',
  '고유가 지원금 2차',
  '전기요금 감면 변경',
  '근로장려금 지급일 발표',
  '청년월세 지원 신청',
].map((keyword, index) => [keyword, {
  communityBuzzScore: 70 + (index % 5) * 4,
  snsLeadingScore: 35 + (index % 4) * 8,
  sources: index % 2 === 0
    ? ['naver-news', 'theqoo', 'youtube-kr']
    : ['korea-kr', 'naver-news', 'bigkinds'],
}] as [string, ExternalSignals]));

const bulkIssueSeeds = buildFreshIssueGoldenSeeds(bulkIssueSignals, {
  maxBaseSeeds: 20,
  intentsPerSeed: 8,
});

assert('fresh issue radar can supply 100+ concrete seeds for bulk golden discovery',
  bulkIssueSeeds.length >= 100
    && !bulkIssueSeeds.some(item => item.keyword.startsWith('아이돌 '))
    && bulkIssueSeeds.some(item => item.keyword === '티빙 정보 유출 피해 확인')
    && bulkIssueSeeds.some(item => item.keyword === '뉴진스 컴백 일정 신곡')
    && bulkIssueSeeds.some(item => item.keyword === '청년월세 지원 신청 신청방법'),
  bulkIssueSeeds.map(item => item.keyword).join(', '));

const incidentPatterns = generateQueryPatterns(
  splitKeywordSemantically('티빙 정보 유출'),
  ['가격', '후기', '피해 확인'],
);

assert('pattern generator gives incident seeds issue-safe patterns',
  incidentPatterns.includes('티빙 정보 유출 피해 확인')
    && incidentPatterns.includes('티빙 정보 유출 보상')
    && incidentPatterns.includes('티빙 정보 유출 공식 공지'),
  incidentPatterns.join(', '));

assert('pattern generator suppresses incident commerce suffixes from autocomplete',
  !incidentPatterns.some(pattern => /티빙 정보 유출 (가격|후기|추천|비교)$/.test(pattern))
    && !incidentPatterns.some(pattern => /가성비 티빙 정보 유출/.test(pattern)),
  incidentPatterns.join(', '));

const policyPatterns = generateQueryPatterns(
  splitKeywordSemantically('고유가 지원금 2차'),
  ['가격', '추천', '신청방법'],
);

assert('pattern generator gives policy seeds policy-safe patterns',
  policyPatterns.includes('고유가 지원금 2차 신청방법')
    && policyPatterns.includes('고유가 지원금 2차 자격')
    && policyPatterns.includes('고유가 지원금 2차 혜택')
    && policyPatterns.includes('고유가 지원금 2차 정책브리핑'),
  policyPatterns.join(', '));

assert('pattern generator suppresses policy commerce suffixes from autocomplete',
  !policyPatterns.some(pattern => /고유가 지원금 2차 (가격|후기|추천|비교)$/.test(pattern))
    && !policyPatterns.some(pattern => /가성비 고유가 지원금 2차/.test(pattern)),
  policyPatterns.join(', '));

console.log(`[fresh-issue-golden-seeds.test] passed=${passed} failed=${failed}`);
if (failed > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
