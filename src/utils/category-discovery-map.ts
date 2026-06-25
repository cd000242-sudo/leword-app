import { CATEGORY_MAP, getCategorySeeds, isKeywordMatchingCategory } from './categories';
import { getEnhancedCategoryGoldenKeywords } from './profit-keyword-hunter-upgrade';

const CATEGORY_ALIASES: Record<string, string[]> = {
  '': [],
  all: [],
  전체: [],
  정치: ['policy'],
  경제: ['finance', 'business'],
  사회: ['policy', 'life_tips'],
  '사회·정치': ['policy', 'life_tips'],
  사회정치: ['policy', 'life_tips'],
  국제: ['policy'],
  정책: ['policy'],
  지원금: ['policy'],
  정부지원금: ['policy'],
  정책브리핑: ['policy'],
  대한민국정책브리핑: ['policy'],
  정책브리핑지원금: ['policy'],
  지원금정책브리핑: ['policy'],
  보조금: ['policy'],
  보조금24: ['policy'],
  정부24: ['policy'],
  복지로: ['policy'],
  복지: ['policy'],
  혜택: ['policy'],
  IT: ['it'],
  it: ['it'],
  과학: ['it', 'ai_tool'],
  스마트폰: ['smartphone'],
  컴퓨터: ['laptop', 'it'],
  'IT·컴퓨터': ['it', 'laptop', 'smartphone', 'ai_tool'],
  IT컴퓨터: ['it', 'laptop', 'smartphone', 'ai_tool'],
  AI: ['ai_tool', 'it'],
  ai: ['ai_tool', 'it'],
  생활: ['life_tips', 'home_life'],
  건강: ['health'],
  '건강·의학': ['health', 'hospital'],
  건강의학: ['health', 'hospital'],
  육아: ['parenting', 'baby_products'],
  '육아·생활': ['parenting', 'baby_products', 'home_life', 'life_tips'],
  육아생활: ['parenting', 'baby_products', 'home_life', 'life_tips'],
  '유아·질문': ['parenting', 'baby_products'],
  유아질문: ['parenting', 'baby_products'],
  반려동물: ['pet_dog', 'pet_cat', 'pet_etc'],
  인테리어: ['interior'],
  '인테리어·DIY': ['interior', 'home_life', 'hobby'],
  인테리어DIY: ['interior', 'home_life', 'hobby'],
  엔터테인먼트: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  연예: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  연예인: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  스타: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  '스타·연예인': ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  스타연예인: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  연예인이슈: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  스타이슈: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  연예뉴스: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  실시간연예: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  아이돌: ['celeb', 'music'],
  '문학·책': ['book'],
  문학책: ['book'],
  영화: ['movie'],
  드라마: ['drama'],
  음악: ['music'],
  방송: ['broadcast'],
  예능: ['broadcast'],
  '만화·애니': ['anime', 'book'],
  만화애니: ['anime', 'book'],
  '미술·디자인': ['hobby', 'self_development'],
  미술디자인: ['hobby', 'self_development'],
  '공연·전시': ['music', 'hobby', 'celeb'],
  공연전시: ['music', 'hobby', 'celeb'],
  쇼핑: ['electronics', 'fashion', 'beauty'],
  shopping: ['electronics', 'fashion', 'beauty', 'kitchen', 'baby_products'],
  product: ['electronics', 'fashion', 'beauty', 'kitchen', 'baby_products'],
  review: ['electronics', 'fashion', 'beauty', 'kitchen'],
  상품리뷰: ['electronics', 'fashion', 'beauty', 'kitchen'],
  패션: ['fashion'],
  '패션·미용': ['fashion', 'beauty'],
  패션미용: ['fashion', 'beauty'],
  뷰티: ['beauty'],
  가전: ['electronics'],
  음식: ['food', 'recipe'],
  맛집: ['food'],
  카페: ['food'],
  레시피: ['recipe'],
  '요리·레시피': ['recipe', 'food'],
  요리레시피: ['recipe', 'food'],
  여행: ['travel_domestic', 'travel_overseas'],
  국내여행: ['travel_domestic'],
  세계여행: ['travel_overseas'],
  해외여행: ['travel_overseas'],
  호텔: ['travel_domestic', 'travel_overseas'],
  자동차: ['car', 'car_maintain'],
  전기차: ['car'],
  중고차: ['car'],
  사진: ['hobby', 'smartphone'],
  '원예·재배': ['hobby', 'home_life'],
  원예재배: ['hobby', 'home_life'],
  '좋은글·이미지': ['book', 'self_development', 'hobby'],
  좋은글이미지: ['book', 'self_development', 'hobby'],
  부동산: ['realestate'],
  아파트: ['realestate'],
  오피스텔: ['realestate'],
  부동산투자: ['realestate'],
  투자: ['finance', 'realestate'],
  교육: ['education'],
  '교육·학문': ['education', 'book'],
  교육학문: ['education', 'book'],
  자격증: ['education'],
  학원: ['education'],
  어학: ['english'],
  '어학·외국어': ['english', 'education'],
  어학외국어: ['english', 'education'],
  금융: ['finance'],
  주식: ['finance'],
  보험: ['insurance_safe'],
  스포츠: ['sports'],
  축구: ['sports'],
  야구: ['sports'],
  골프: ['sports'],
  게임: ['game'],
  모바일게임: ['game'],
  PC게임: ['game'],
  콘솔게임: ['game'],
  취미: ['hobby'],
  독서: ['book'],
  영화감상: ['movie'],
  음악감상: ['music'],
  비즈니스: ['business'],
  '비즈니스·경제': ['business', 'finance', 'sidejob'],
  비즈니스경제: ['business', 'finance', 'sidejob'],
  창업: ['business'],
  마케팅: ['business'],
  부업: ['sidejob', 'business'],
  N잡: ['sidejob', 'business'],
  n잡: ['sidejob', 'business'],
  자기계발: ['self_development'],
  결혼: ['wedding'],
  웨딩: ['wedding'],
  celeb: ['celeb'],
  celebrity: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  policy: ['policy'],
  subsidy: ['policy'],
  support: ['policy'],
  entertainment: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  star: ['celeb', 'broadcast', 'music', 'drama', 'movie'],
  fashion: ['fashion', 'beauty'],
  parenting_kids: ['parenting', 'education', 'baby_products'],
  pregnancy: ['parenting', 'baby_products', 'health'],
  senior: ['health', 'finance', 'policy'],
  home: ['home_life', 'interior', 'kitchen'],
  culture: ['movie', 'drama', 'broadcast', 'celeb', 'music', 'book', 'hobby'],
  self: ['self_development'],
  auto: ['car', 'car_maintain'],
  travel: ['travel_domestic', 'travel_overseas'],
  pet: ['pet_dog', 'pet_cat', 'pet_etc'],
  car_all: ['car', 'car_maintain'],
  life_tips: ['life_tips', 'home_life'],
  '육아(영유아)': ['parenting'],
  '육아(초중고)': ['parenting', 'education', 'baby_products'],
  '뷰티/화장품': ['beauty'],
  '패션/스타일': ['fashion', 'beauty'],
  '맛집/요리': ['food', 'recipe'],
  '여행/숙박': ['travel_domestic', 'travel_overseas'],
  '건강/운동': ['health'],
  'IT/디지털': ['it', 'smartphone', 'laptop', 'ai_tool'],
  '인테리어/생활': ['interior', 'home_life', 'kitchen'],
  '재테크/투자': ['finance', 'realestate'],
  '지원금/정책/복지': ['policy'],
  '교육/자격증': ['education'],
  '문화/엔터': ['movie', 'drama', 'broadcast', 'celeb', 'music', 'book', 'hobby'],
  '스타/연예이슈': ['celeb', 'broadcast', 'music'],
  '스타/연예 이슈': ['celeb', 'broadcast', 'music'],
  '결혼/예식': ['wedding'],
  '임신/출산': ['parenting', 'baby_products', 'health', 'policy'],
  '시니어/노후': ['health', 'finance', 'policy'],
  '부업/N잡': ['sidejob', 'business'],
};

const SEED_EXTRA_SUFFIXES = [
  '추천',
  '비교',
  '후기',
  '가격',
  '방법',
  '신청',
  '조건',
  '체크리스트',
];

const DISCOVERY_COMMON_SUFFIXES = [
  '최신',
  '총정리',
  '주의사항',
  '일정',
  '순위',
  '꿀팁',
  '초보',
  '2026',
  '이번주',
  '오늘',
  '예상',
  '정리',
];

const CATEGORY_DISCOVERY_SUFFIXES: Record<string, string[]> = {
  policy: ['정책브리핑', '공식발표', '공고', '접수', '신청방법', '대상', '자격', '지급일', '서류', '사용처', '조회', '마감'],
  finance: ['금리', '한도', '조건', '환급', '세액공제', '신청방법', '비교', '전망', '주의사항', '계산'],
  business: ['사업자등록', '세무', '창업', '지원금', '신고기간', '절세', '비용', '서류', '마감', '체크리스트'],
  sidejob: ['시작방법', '수익', '후기', '세금', '플랫폼', '현실', '무자본', '주의사항'],
  movie: ['개봉일', '결말 해석', '쿠키 영상', 'OTT 보는곳', '출연진', '예매 일정', '관람평', '시사회', '시리즈 순서', '원작 차이', '상영관'],
  drama: ['방송시간', '출연진', '몇부작', '결말 해석', '인물관계도', '재방송', '시청률', 'OST', '촬영지', '공개일', '후속작'],
  broadcast: ['방송시간', '출연진', '게스트', '재방송', '시청률', '다시보기', '공식영상', '회차 정보', '방청 신청', '편성표'],
  celeb: ['근황', '공식입장', '컴백 일정', '팬미팅 예매', '콘서트 예매', '출연 정보', '인스타', '공항패션', '화보', '인터뷰', '소속사 입장'],
  music: ['컴백 일정', '콘서트 예매', '앨범 발매일', '티저 공개', '차트 순위', '가사 해석', '응원봉 가격', '굿즈 예약', '팬사인회 응모'],
  anime: ['방영일', '몇부작', '결말 해석', '극장판 개봉일', 'OTT 보는곳', '원작 차이', '굿즈 예약', '최신화', '성우'],
  game: ['출시일', '업데이트', '쿠폰', '공략', '티어표', '리세마라', '이벤트', '사양', '초보 가이드', '패치노트'],
  sports: ['중계', '경기일정', '티켓팅 일정', '라인업', '순위', '선발', '하이라이트', '예매', '직관 준비물', '부상 소식'],
  book: ['베스트셀러', '서평', '책 추천', '독서법', '작가 인터뷰', '신간 일정', '전자책', '오디오북', '북클럽', '독후감'],
  hobby: ['입문', '클래스', '키트', '재료', '도안', '작품', '원데이클래스', '전시', '디자인', '가드닝', '화분', '재배'],
  self_development: ['명언', '좋은글', '이미지', '습관', '동기부여', '글귀', '루틴', '독서법', '성장', '노트'],
  electronics: ['리뷰', '후기', '비교', '설치', '용량', '전기요금', '필터 교체', '렌탈', '할인', '사용법'],
  fashion: ['코디', '브랜드', '사이즈', '할인', '후기', '하객룩', '출근룩', '착용샷', '계절 코디', '세일'],
  beauty: ['성분', '피부타입', '올리브영', '후기', '추천', '순서', '민감성', '트러블', '컬러', '발색'],
  kitchen: ['리뷰', '후기', '비교', '소재', '사용법', '관리법', '추천', '세척', '장단점', '보관'],
  interior: ['견적', '셀프', '시공', '비용', '후기', '업체', '주의사항', '원룸', '가구 배치', '조명'],
  home_life: ['청소', '수납', '정리', '생활 꿀팁', '자취', '살림', '절약', '관리법', '셀프', '체크리스트'],
  parenting: ['시기', '준비물', '방법', '주의사항', '발달', '검진', '비용', '지원금', '어린이집', '육아휴직'],
  baby_products: ['분유', '기저귀', '유모차', '카시트', '장난감', '이유식', '사이즈', '설치법', '비교', '후기'],
  pet_dog: ['사료', '간식', '병원', '훈련', '미용', '산책', '예방접종', '보험', '입양', '주의사항'],
  pet_cat: ['사료', '모래', '간식', '병원', '캣타워', '중성화', '화장실', '입양', '구토 원인', '주의사항'],
  pet_etc: ['먹이', '케이지', '수조', '분양', '사육환경', '수명', '온도', '병원', '입문', '주의사항'],
  car: ['출시일정', '보조금', '보험', '시승', '견적', '중고차', '유지비', '연비', '옵션', '리콜'],
  car_maintain: ['교체주기', '점검', '비용', '셀프', '정비', '보험갱신', '세차', '엔진오일', '타이어', '블랙박스'],
  travel_domestic: ['축제 일정', '주차', '날씨', '준비물', '코스', '입장료', '예약', '숙소', '가볼만한곳', '당일치기'],
  travel_overseas: ['항공권', '일정', '준비물', '비자', '환전', '숙소', '예약', '경비', '로밍', '유심'],
  food: ['맛집', '메뉴', '예약', '가격', '웨이팅', '후기', '주차', '영업시간', '런치', '핫플'],
  recipe: ['황금레시피', '재료', '양념', '보관법', '만드는법', '칼로리', '간단', '자취', '아이 간식', '도시락'],
  health: ['효능', '부작용', '복용법', '검사', '증상', '성분', '하루 권장량', '주의사항', '병원', '비용'],
  hospital: ['검사', '진료', '예약', '비용', '실비', '준비사항', '검진 대상', '증상', '결과 해석', '주의사항'],
  education: ['시험일정', '접수', '기출', '합격률', '국비지원', '준비물', '교재', '독학', '공부법', '합격 후기'],
  english: ['토익', '영어회화', '어학원', '교재', '독학', '시험', '쉐도잉', '화상영어', '점수', '비즈니스 영어'],
  it: ['사용법', '설정', '오류 해결', '비교', '추천', '업데이트', '후기', '보안', '설치', '단축키'],
  smartphone: ['카메라', '사진', '보정', '설정', '업데이트', '가격', '사전예약', '오류', '배터리', '보호필름'],
  laptop: ['컴퓨터', '노트북', '사양', '가격', '후기', '할인', '용도별', '설정', '오류', '업그레이드'],
  ai_tool: ['사용법', '프롬프트', '무료', '가격', '비교', '업데이트', '활용', '오류', '자동화', '추천'],
};

function normalizeCategory(value: string | undefined | null): string {
  return String(value || '').replace(/\s+/g, '').trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2) continue;
    const key = value.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function resolveDiscoveryCategoryIds(category: string | undefined | null): string[] {
  const raw = String(category || '').trim();
  const normalized = normalizeCategory(raw);
  const direct = CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[normalized];
  if (direct) return direct;
  return raw ? [raw] : [];
}

export function filterFocusedProfileCategoryIds(
  requestedCategory: string | undefined | null,
  profileCategoryIds: string[],
): string[] {
  const profileIds = unique((profileCategoryIds || []).map(id => String(id || '').trim()));
  const requestedIds = resolveDiscoveryCategoryIds(requestedCategory);
  if (requestedIds.length === 0) return profileIds;

  const requestedSet = new Set(requestedIds);
  return profileIds.filter((profileId) => {
    const resolved = resolveDiscoveryCategoryIds(profileId);
    return resolved.some(id => requestedSet.has(id));
  });
}

export function matchesDiscoveryCategory(keyword: string, category: string | undefined | null): boolean {
  const ids = resolveDiscoveryCategoryIds(category);
  if (ids.length === 0) return true;
  return ids.some(id => isKeywordMatchingCategory(keyword, id));
}

function getCategoryDiscoverySuffixes(categoryIds: string[]): string[] {
  const specific: string[] = [];
  for (const id of categoryIds) {
    specific.push(...(CATEGORY_DISCOVERY_SUFFIXES[id] || []));
  }
  return unique([...specific, ...SEED_EXTRA_SUFFIXES, ...DISCOVERY_COMMON_SUFFIXES]).slice(0, 36);
}

function getExpansionBaseLimit(seedCount: number, maxSeeds: number): number {
  const requested = Math.max(12, maxSeeds || 120);
  const cap = requested >= 1000 ? 180 : requested >= 500 ? 140 : requested >= 160 ? 100 : 70;
  return Math.max(12, Math.min(seedCount, cap));
}

function appendExpandedSeeds(out: string[], seed: string, suffixes: string[], maxSuffixes: number, currentYear: number): void {
  out.push(seed);

  for (const suffix of suffixes.slice(0, maxSuffixes)) {
    if (!seed.includes(suffix)) {
      out.push(`${seed} ${suffix}`);
    }
  }

  if (!seed.includes(String(currentYear))) out.push(`${currentYear} ${seed}`);
  if (!seed.includes('최신')) out.push(`${seed} 최신`);
  if (!seed.includes('이번주')) out.push(`${seed} 이번주`);
  if (!seed.includes('오늘')) out.push(`${seed} 오늘`);
}

export function getDiscoveryCategorySeeds(category: string | undefined | null, maxSeeds = 120): string[] {
  const ids = resolveDiscoveryCategoryIds(category);
  if (ids.length === 0) return [];

  const categorySeeds: string[] = [];
  const enhancedSeeds: string[] = [];
  for (const id of ids) {
    categorySeeds.push(...getCategorySeeds(id));
    enhancedSeeds.push(...getEnhancedCategoryGoldenKeywords(id));
  }

  const currentYear = new Date().getFullYear();
  const suffixes = getCategoryDiscoverySuffixes(ids);
  const expanded: string[] = [];
  for (const seed of unique(categorySeeds).slice(0, getExpansionBaseLimit(categorySeeds.length, maxSeeds))) {
    appendExpandedSeeds(expanded, seed, suffixes, maxSeeds >= 160 ? 18 : 10, currentYear);
  }

  const enhancedExpanded: string[] = [];
  for (const seed of unique(enhancedSeeds).slice(0, Math.max(8, Math.min(24, Math.floor(maxSeeds / 8))))) {
    appendExpandedSeeds(enhancedExpanded, seed, suffixes, maxSeeds >= 160 ? 8 : 4, currentYear);
  }

  return unique([...categorySeeds, ...expanded, ...enhancedSeeds, ...enhancedExpanded]).slice(0, maxSeeds);
}

export function getCrossCategoryDiscoverySeeds(excludedCategoryIds: string[] = [], maxSeeds = 240): string[] {
  const excluded = new Set((excludedCategoryIds || []).map(id => String(id || '').trim()).filter(Boolean));
  const categoryIds = Array.from(CATEGORY_MAP.values())
    .map(category => category.id)
    .filter(id => id && id !== 'all' && id !== 'pro_premium' && !excluded.has(id));

  const out: string[] = [];
  const perCategoryBaseLimit = Math.max(3, Math.min(8, Math.ceil(maxSeeds / Math.max(1, categoryIds.length))));
  const currentYear = new Date().getFullYear();
  for (const id of categoryIds) {
    const suffixes = getCategoryDiscoverySuffixes([id]);
    const seeds = unique([
      ...getCategorySeeds(id),
      ...getEnhancedCategoryGoldenKeywords(id),
    ]).slice(0, perCategoryBaseLimit);
    for (const seed of seeds) {
      appendExpandedSeeds(out, seed, suffixes, 3, currentYear);
    }
  }

  return unique(out).slice(0, maxSeeds);
}
