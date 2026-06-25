/**
 * category-discovery-regression.test.ts
 *
 * Guards category-only golden discovery and PRO category hunting against
 * regressions where the UI category value does not inject enough real seeds.
 */

import {
  filterFocusedProfileCategoryIds,
  getCrossCategoryDiscoverySeeds,
  getDiscoveryCategorySeeds,
  matchesDiscoveryCategory,
  resolveDiscoveryCategoryIds,
} from '../category-discovery-map';
import { buildCategoryFirstGoldenSeedPlan } from '../category-first-golden-discovery';
import { BLOGGER_CATEGORIES } from '../blogger-profile';
import { getSeedsForUserCategories } from '../sources/category-seed-catalog';

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

const policyIds = resolveDiscoveryCategoryIds('policy');
assert('policy id resolves directly', policyIds.includes('policy'), policyIds.join(','));

const supportIds = resolveDiscoveryCategoryIds('지원금');
assert('support-fund Korean alias resolves to policy', supportIds.includes('policy'), supportIds.join(','));

const governmentSupportIds = resolveDiscoveryCategoryIds('정부지원금');
assert('government support alias resolves to policy', governmentSupportIds.includes('policy'), governmentSupportIds.join(','));

const policyBriefingIds = resolveDiscoveryCategoryIds('정책브리핑');
assert('policy briefing alias resolves to policy', policyBriefingIds.includes('policy'), policyBriefingIds.join(','));

const koreaPolicyBriefingIds = resolveDiscoveryCategoryIds('대한민국 정책브리핑');
assert('Korea policy briefing spaced alias resolves to policy', koreaPolicyBriefingIds.includes('policy'), koreaPolicyBriefingIds.join(','));

const starIds = resolveDiscoveryCategoryIds('스타');
assert('star Korean alias resolves to entertainment family',
  starIds.includes('celeb') && starIds.includes('broadcast') && starIds.includes('music'),
  starIds.join(','));
const starCelebrityIds = resolveDiscoveryCategoryIds('스타 연예인');
assert('compound star celebrity alias resolves to entertainment family',
  starCelebrityIds.includes('celeb') && starCelebrityIds.includes('broadcast') && starCelebrityIds.includes('music'),
  starCelebrityIds.join(','));
const celebrityIssueIds = resolveDiscoveryCategoryIds('연예인 이슈');
assert('celebrity issue alias resolves to entertainment family',
  celebrityIssueIds.includes('celeb') && celebrityIssueIds.includes('broadcast') && celebrityIssueIds.includes('music'),
  celebrityIssueIds.join(','));
const celebrityIds = resolveDiscoveryCategoryIds('celebrity');
assert('celebrity UI alias resolves to entertainment family',
  celebrityIds.includes('celeb') && celebrityIds.includes('broadcast') && celebrityIds.includes('music'),
  celebrityIds.join(','));

assert('focused support category keeps only matching profile seed category',
  JSON.stringify(filterFocusedProfileCategoryIds('지원금', ['beauty', 'policy', 'celeb'])) === JSON.stringify(['policy']),
  filterFocusedProfileCategoryIds('지원금', ['beauty', 'policy', 'celeb']).join(','));
assert('focused star category keeps only entertainment profile seed category',
  JSON.stringify(filterFocusedProfileCategoryIds('스타', ['policy', 'celeb', 'beauty'])) === JSON.stringify(['celeb']),
  filterFocusedProfileCategoryIds('스타', ['policy', 'celeb', 'beauty']).join(','));
assert('unfocused category mode can still use every profile category',
  filterFocusedProfileCategoryIds('all', ['policy', 'celeb']).length === 2,
  filterFocusedProfileCategoryIds('all', ['policy', 'celeb']).join(','));

const fashionIds = resolveDiscoveryCategoryIds('fashion');
assert('fashion UI category keeps beauty sibling', fashionIds.includes('fashion') && fashionIds.includes('beauty'), fashionIds.join(','));

const shoppingIds = resolveDiscoveryCategoryIds('쇼핑');
assert('shopping category fans out to commerce categories',
  shoppingIds.includes('electronics') && shoppingIds.includes('fashion') && shoppingIds.includes('beauty'),
  shoppingIds.join(','));

const sidejobIds = resolveDiscoveryCategoryIds('N잡');
assert('sidejob Korean alias resolves to sidejob/business',
  sidejobIds.includes('sidejob') && sidejobIds.includes('business'),
  sidejobIds.join(','));

const weddingIds = resolveDiscoveryCategoryIds('결혼');
assert('wedding Korean alias resolves to wedding', weddingIds.includes('wedding'), weddingIds.join(','));

const healthSeeds = getDiscoveryCategorySeeds('health', 80);
assert('health category-only discovery has at least 30 seeds', healthSeeds.length >= 30, `${healthSeeds.length}`);
assert('health seeds contain intent-expanded variants',
  healthSeeds.some(seed => /추천|비교|후기|방법/.test(seed)),
  healthSeeds.slice(0, 12).join(', '));

const policySeeds = getDiscoveryCategorySeeds('policy', 80);
assert('policy category-only discovery has at least 30 seeds', policySeeds.length >= 30, `${policySeeds.length}`);
assert('policy seeds preserve application/support intent',
  policySeeds.some(seed => /지원금|신청|조건|바우처/.test(seed)),
  policySeeds.slice(0, 12).join(', '));
const policyBriefingSeeds = getDiscoveryCategorySeeds('정책브리핑', 80);
assert('policy briefing category entry uses official-support seed pool',
  policyBriefingSeeds.length >= 30
    && policyBriefingSeeds.some(seed => /정책브리핑|정부24|보조금24|복지로|지원금/.test(seed)),
  policyBriefingSeeds.slice(0, 16).join(', '));

const celebSeeds = getDiscoveryCategorySeeds('celeb', 80);
assert('celeb category-only discovery has at least 30 seeds', celebSeeds.length >= 30, `${celebSeeds.length}`);
assert('celeb seeds preserve star/entertainment intent',
  celebSeeds.some(seed => /연예|아이돌|컴백|팬미팅|콘서트/.test(seed)),
  celebSeeds.slice(0, 12).join(', '));
const starCelebritySeeds = getDiscoveryCategorySeeds('스타 연예인', 80);
assert('compound star celebrity category entry uses entertainment issue seed pool',
  starCelebritySeeds.length >= 30
    && starCelebritySeeds.some(seed => /연예인|스타|아이돌|컴백|공식입장|팬미팅/.test(seed)),
  starCelebritySeeds.slice(0, 16).join(', '));
const celebritySeeds = getDiscoveryCategorySeeds('celebrity', 80);
assert('celebrity UI alias does not fall back to generic template seeds',
  celebritySeeds.length >= 30
    && celebritySeeds.some(seed => /연예|아이돌|컴백|팬미팅|콘서트|드라마|예능/.test(seed))
    && !celebritySeeds.slice(0, 8).every(seed => /추천|비교|후기|가격|방법|효과|차이점|순위/.test(seed)),
  celebritySeeds.slice(0, 16).join(', '));

const profileIds = BLOGGER_CATEGORIES.map(c => c.id);
assert('blogger profile exposes policy category', profileIds.includes('policy'), profileIds.join(','));
assert('blogger profile exposes celeb category', profileIds.includes('celeb'), profileIds.join(','));

const userPolicySeeds = getSeedsForUserCategories(['policy'], 40);
assert('user policy profile injects at least 30 support seeds', userPolicySeeds.length >= 30, `${userPolicySeeds.length}`);
assert('user policy seeds include official lookup intent',
  userPolicySeeds.some(seed => /보조금24|정부24|소상공인|근로장려금/.test(seed)),
  userPolicySeeds.slice(0, 12).join(', '));

const userCelebSeeds = getSeedsForUserCategories(['celeb'], 40);
assert('user celeb profile injects at least 30 star seeds', userCelebSeeds.length >= 30, `${userCelebSeeds.length}`);
assert('user celeb seeds include fast issue intent',
  userCelebSeeds.some(seed => /컴백|공식입장|근황|시상식/.test(seed)),
  userCelebSeeds.slice(0, 12).join(', '));

const june2026 = new Date('2026-06-01T09:00:00+09:00');
const policyPlan = buildCategoryFirstGoldenSeedPlan({
  category: '지원금',
  maxSeeds: 180,
  now: june2026,
});
assert('category-first support plan resolves policy id',
  policyPlan.categoryIds.includes('policy'),
  policyPlan.categoryIds.join(','));
assert('category-first support plan fills a large current seed pool',
  policyPlan.seeds.length >= 160,
  `${policyPlan.seeds.length}`);
assert('category-first support plan includes current-date and application intent',
  policyPlan.seeds.some(seed => /2026|6월|최신/.test(seed))
    && policyPlan.seeds.some(seed => /신청|대상|자격|지급일|마감/.test(seed)),
  policyPlan.seeds.slice(0, 20).join(', '));

const livePolicyPlan = buildCategoryFirstGoldenSeedPlan({
  category: '지원금',
  maxSeeds: 140,
  now: june2026,
  liveSeeds: ['청년 도약 보조금 신청', '소상공인 새출발 지원금 접수'],
});
assert('category-first support plan prioritizes live policy briefing seeds',
  livePolicyPlan.liveSeedCount === 2
    && livePolicyPlan.seeds.slice(0, 14).some(seed => seed === '청년 도약 보조금 신청')
    && livePolicyPlan.seeds.slice(0, 22).some(seed => /소상공인 새출발 지원금 접수/.test(seed)),
  livePolicyPlan.seeds.slice(0, 28).join(', '));
assert('category-first support live seeds get current intent expansions',
  livePolicyPlan.seeds.some(seed => /청년 도약 보조금 신청.*(2026|6월|최신|신청방법|대상|자격)/.test(seed)),
  livePolicyPlan.seeds.slice(0, 32).join(', '));

const policyBriefingPlan = buildCategoryFirstGoldenSeedPlan({
  category: '대한민국 정책브리핑',
  maxSeeds: 140,
  now: june2026,
  liveSeeds: ['대한민국 정책브리핑 소상공인 지원금 접수'],
});
assert('category-first policy briefing plan resolves and expands official live seeds',
  policyBriefingPlan.categoryIds.includes('policy')
    && policyBriefingPlan.seeds.some(seed => /대한민국 정책브리핑 소상공인 지원금 접수/.test(seed))
    && policyBriefingPlan.seeds.some(seed => /정책브리핑|공식발표|공고|신청방법|대상/.test(seed)),
  policyBriefingPlan.seeds.slice(0, 32).join(', '));

const focusedPolicyPlan = buildCategoryFirstGoldenSeedPlan({
  category: '지원금',
  keyword: '근로장려금',
  maxSeeds: 80,
  now: june2026,
});
assert('category-first optional keyword acts as a category-scoped focus seed',
  focusedPolicyPlan.seeds.slice(0, 12).some(seed => /근로장려금/.test(seed))
    && focusedPolicyPlan.seeds.some(seed => /근로장려금.*(신청|지급일|대상|자격)/.test(seed)),
  focusedPolicyPlan.seeds.slice(0, 20).join(', '));

const starPlan = buildCategoryFirstGoldenSeedPlan({
  category: '스타',
  maxSeeds: 180,
  now: june2026,
});
assert('category-first star plan resolves entertainment family',
  starPlan.categoryIds.includes('celeb') && starPlan.categoryIds.includes('broadcast') && starPlan.categoryIds.includes('music'),
  starPlan.categoryIds.join(','));
assert('category-first star plan includes fresh entertainment intent',
  starPlan.seeds.some(seed => /2026|6월|최신/.test(seed))
    && starPlan.seeds.some(seed => /컴백|근황|공식입장|콘서트|팬미팅|시상식/.test(seed)),
  starPlan.seeds.slice(0, 20).join(', '));

const liveStarPlan = buildCategoryFirstGoldenSeedPlan({
  category: '스타',
  maxSeeds: 140,
  now: june2026,
  liveSeeds: ['아이돌 컴백 공식입장', '배우 드라마 출연 확정'],
});
assert('category-first star plan prioritizes live entertainment seeds',
  liveStarPlan.liveSeedCount === 2
    && liveStarPlan.seeds.slice(0, 14).some(seed => seed === '아이돌 컴백 공식입장')
    && liveStarPlan.seeds.slice(0, 22).some(seed => /배우 드라마 출연 확정/.test(seed)),
  liveStarPlan.seeds.slice(0, 28).join(', '));
assert('category-first star live seeds get current entertainment expansions',
  liveStarPlan.seeds.some(seed => /아이돌 컴백 공식입장.*(2026|6월|최신|근황|공식입장|컴백 일정)/.test(seed)),
  liveStarPlan.seeds.slice(0, 32).join(', '));

const compoundStarPlan = buildCategoryFirstGoldenSeedPlan({
  category: '스타 연예인',
  maxSeeds: 140,
  now: june2026,
  liveSeeds: ['연예인 이슈 공식입장'],
});
assert('category-first compound star celebrity plan keeps entertainment issue intent',
  compoundStarPlan.categoryIds.includes('celeb')
    && compoundStarPlan.categoryIds.includes('broadcast')
    && compoundStarPlan.categoryIds.includes('music')
    && compoundStarPlan.seeds.some(seed => /연예인 이슈 공식입장/.test(seed))
    && compoundStarPlan.seeds.some(seed => /근황|공식입장|컴백 일정|출연 정보/.test(seed)),
  compoundStarPlan.seeds.slice(0, 32).join(', '));

const screenshotUiCategoryCases: Array<{
  label: string;
  expectedIds: string[];
  marker: RegExp;
}> = [
  { label: '문학·책', expectedIds: ['book'], marker: /베스트셀러|서평|독서|책 추천|도서 추천/ },
  { label: '영화', expectedIds: ['movie'], marker: /개봉|결말|쿠키|OTT|예매/ },
  { label: '미술·디자인', expectedIds: ['hobby'], marker: /그림|수채화|캘리그라피|전시|디자인|클래스/ },
  { label: '공연·전시', expectedIds: ['music', 'hobby'], marker: /공연|콘서트|티켓|뮤지컬|전시/ },
  { label: '음악', expectedIds: ['music'], marker: /컴백|콘서트|앨범|차트|음원/ },
  { label: '드라마', expectedIds: ['drama'], marker: /방송시간|출연진|몇부작|결말|재방송|시청률/ },
  { label: '스타·연예인', expectedIds: ['celeb', 'broadcast', 'music'], marker: /근황|공식입장|컴백|팬미팅|콘서트/ },
  { label: '만화·애니', expectedIds: ['anime', 'book'], marker: /애니|극장판|방영일|라프텔|원작/ },
  { label: '방송', expectedIds: ['broadcast'], marker: /방송시간|출연진|게스트|재방송|다시보기|방청/ },
  { label: '육아·생활', expectedIds: ['parenting', 'home_life'], marker: /육아|준비물|검진|생활|청소|수납/ },
  { label: '유아·질문', expectedIds: ['parenting', 'baby_products'], marker: /육아|유아|준비물|발달|검진|질문/ },
  { label: '반려동물', expectedIds: ['pet_dog', 'pet_cat', 'pet_etc'], marker: /강아지|고양이|사료|병원|훈련/ },
  { label: '좋은글·이미지', expectedIds: ['book', 'self_development', 'hobby'], marker: /명언|좋은글|이미지|서평|에세이|독서/ },
  { label: '패션·미용', expectedIds: ['fashion', 'beauty'], marker: /코디|브랜드|사이즈|올리브영|성분/ },
  { label: '인테리어·DIY', expectedIds: ['interior', 'home_life', 'hobby'], marker: /인테리어|DIY|셀프|시공|견적/ },
  { label: '요리·레시피', expectedIds: ['recipe', 'food'], marker: /레시피|재료|양념|맛집|만드는법/ },
  { label: '상품리뷰', expectedIds: ['electronics', 'fashion', 'beauty', 'kitchen'], marker: /리뷰|후기|비교|추천|순위/ },
  { label: '원예·재배', expectedIds: ['hobby', 'home_life'], marker: /원예|식물|가드닝|화분|재배/ },
  { label: '게임', expectedIds: ['game'], marker: /게임|공략|출시|업데이트|스팀/ },
  { label: '스포츠', expectedIds: ['sports'], marker: /중계|티켓|경기|라인업|순위/ },
  { label: '사진', expectedIds: ['hobby', 'smartphone'], marker: /사진|촬영|카메라|보정|출사지/ },
  { label: '자동차', expectedIds: ['car', 'car_maintain'], marker: /자동차|중고차|보험|점검|교체/ },
  { label: '취미', expectedIds: ['hobby'], marker: /취미|DIY|클래스|키트|재료/ },
  { label: '국내여행', expectedIds: ['travel_domestic'], marker: /여행|축제|주차|코스|숙소/ },
  { label: '세계여행', expectedIds: ['travel_overseas'], marker: /항공권|비자|환전|해외|숙소/ },
  { label: '맛집', expectedIds: ['food'], marker: /맛집|메뉴|예약|웨이팅|주차/ },
  { label: 'IT·컴퓨터', expectedIds: ['it', 'laptop'], marker: /컴퓨터|노트북|아이폰|갤럭시|오류|업데이트/ },
  { label: '사회·정치', expectedIds: ['policy', 'life_tips'], marker: /정책|지원금|공식발표|이슈|사회/ },
  { label: '건강·의학', expectedIds: ['health'], marker: /건강|증상|검사|복용법|부작용|병원/ },
  { label: '비즈니스·경제', expectedIds: ['business', 'finance'], marker: /사업자|세무|창업|금리|환급|지원금/ },
  { label: '어학·외국어', expectedIds: ['english', 'education'], marker: /영어|어학|토익|회화|시험/ },
  { label: '교육·학문', expectedIds: ['education', 'book'], marker: /시험|기출|합격률|교재|독학|교육/ },
];

const screenshotUiSeedUniverse = new Set<string>();
for (const uiCategory of screenshotUiCategoryCases) {
  const ids = resolveDiscoveryCategoryIds(uiCategory.label);
  const seeds = getDiscoveryCategorySeeds(uiCategory.label, 160);
  const seedText = seeds.join('|');
  const plan = buildCategoryFirstGoldenSeedPlan({
    category: uiCategory.label,
    maxSeeds: 220,
    now: june2026,
  });

  seeds.forEach(seed => screenshotUiSeedUniverse.add(seed));

  assert(`screenshot UI category ${uiCategory.label} resolves to concrete ids`,
    uiCategory.expectedIds.every(id => ids.includes(id))
      && !ids.includes(uiCategory.label)
      && !ids.includes(uiCategory.label.replace(/\s+/g, '')),
    `${uiCategory.label} => ${ids.join(',')}`);
  assert(`screenshot UI category ${uiCategory.label} produces 100+ measurable seed candidates`,
    seeds.length >= 100,
    `${uiCategory.label}: ${seeds.length} seeds`);
  assert(`screenshot UI category ${uiCategory.label} preserves category-specific intent`,
    uiCategory.marker.test(seedText),
    `${uiCategory.label}: ${seeds.slice(0, 24).join(', ')}`);
  assert(`category-first plan ${uiCategory.label} expands to 180+ current candidates`,
    plan.seeds.length >= 180 && uiCategory.expectedIds.every(id => plan.categoryIds.includes(id)),
    `${uiCategory.label}: ${plan.seeds.length} seeds, ids=${plan.categoryIds.join(',')}`);
}

assert('screenshot UI category universe provides 1000+ unique candidates before measurement',
  screenshotUiSeedUniverse.size >= 1000,
  `${screenshotUiSeedUniverse.size}`);

for (const category of BLOGGER_CATEGORIES) {
  const profileSeeds = getSeedsForUserCategories([category.id], 30);
  assert(`profile category ${category.id} injects 30+ seeds`,
    profileSeeds.length >= 30,
    `${category.label}: ${profileSeeds.length}`);

  const discoverySeeds = getDiscoveryCategorySeeds(category.id, 80);
  assert(`discovery category ${category.id} expands to 30+ seeds`,
    discoverySeeds.length >= 30,
    `${category.label}: ${discoverySeeds.length}`);
}

const genericFallbackPattern = /추천 가성비 순위 2026|비교 장단점 총정리|후기 실사용 솔직 리뷰/;
const shoppingDiscoverySeeds = getDiscoveryCategorySeeds('shopping', 80);
assert('internal shopping category resolves to concrete product-category seeds',
  shoppingDiscoverySeeds.length >= 30
    && !genericFallbackPattern.test(shoppingDiscoverySeeds.slice(0, 12).join('|'))
    && /건조기|로봇청소기|선크림|프라이팬|유모차|기저귀/.test(shoppingDiscoverySeeds.slice(0, 60).join('|')),
  shoppingDiscoverySeeds.slice(0, 12).join(', '));
for (const category of BLOGGER_CATEGORIES) {
  const labelIds = resolveDiscoveryCategoryIds(category.label);
  const labelSeeds = getDiscoveryCategorySeeds(category.label, 40);
  const normalizedLabel = category.label.replace(/\s+/g, '');

  assert(`profile label ${category.id} resolves to concrete discovery ids`,
    labelIds.length > 0
      && !labelIds.includes(category.label)
      && !labelIds.includes(normalizedLabel),
    `${category.label} => ${labelIds.join(',')}`);
  assert(`profile label ${category.id} avoids generic fallback seed templates`,
    labelSeeds.length >= 30
      && !genericFallbackPattern.test(labelSeeds.slice(0, 6).join('|')),
    `${category.label}: ${labelSeeds.slice(0, 8).join(', ')}`);
}

assert('health matcher accepts vitamin/ supplement keywords',
  matchesDiscoveryCategory('비타민D 영양제 추천', 'health'));
assert('policy matcher accepts support fund keywords',
  matchesDiscoveryCategory('소상공인 지원금 신청 조건', 'policy'));
assert('celeb matcher accepts star issue keywords',
  matchesDiscoveryCategory('아이돌 컴백 일정 팬미팅', 'celeb'));
assert('entertainment matcher accepts live drama episode-count keywords',
  matchesDiscoveryCategory('멋진 신세계 몇부작', '엔터테인먼트'));
assert('drama matcher accepts live drama relationship-map keywords',
  matchesDiscoveryCategory('신입사원 강회장 인물관계도', 'drama'));
assert('broadcast matcher accepts live official-video keywords',
  matchesDiscoveryCategory('멋진 신세계 공식영상', 'broadcast'));
assert('music matcher accepts concert schedule keywords',
  matchesDiscoveryCategory('2026 흠뻑쇼 일정', 'music'));
assert('entertainment matcher accepts live celeb profile keywords',
  matchesDiscoveryCategory('장한별 프로필', '엔터테인먼트'));
assert('entertainment matcher rejects obvious non-entertainment profile keywords',
  !matchesDiscoveryCategory('강훈식 프로필', '엔터테인먼트'));
assert('policy matcher rejects unrelated fashion keyword',
  !matchesDiscoveryCategory('여름 원피스 코디 추천', 'policy'));

const crossCategorySeeds = getCrossCategoryDiscoverySeeds(['policy'], 120);
assert('cross-category supplement seeds provide broad non-primary coverage',
  crossCategorySeeds.length >= 100,
  `${crossCategorySeeds.length}`);
assert('cross-category supplement excludes primary category seed family',
  !crossCategorySeeds.slice(0, 80).some(seed => matchesDiscoveryCategory(seed, 'policy')),
  crossCategorySeeds.slice(0, 20).join(', '));

console.log(`\n[category-discovery-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
