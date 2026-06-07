import { getDiscoveryCategorySeeds, matchesDiscoveryCategory, resolveDiscoveryCategoryIds } from './category-discovery-map';

export interface CategoryFirstGoldenSeedPlan {
  category: string;
  categoryIds: string[];
  seeds: string[];
  freshnessHints: string[];
  liveSeedCount: number;
}

const COMMON_INTENTS = [
  '최신',
  '추천',
  '비교',
  '후기',
  '방법',
  '조건',
  '주의사항',
  '총정리',
];

const CATEGORY_INTENTS: Record<string, string[]> = {
  policy: [
    '정책브리핑',
    '공식발표',
    '공고',
    '접수',
    '신청방법',
    '대상',
    '자격',
    '지급일',
    '서류',
    '사용처',
    '조회',
    '마감',
    '변경사항',
    '신규',
  ],
  celeb: [
    '연예 이슈',
    '근황',
    '공식입장',
    '컴백 일정',
    '출연 정보',
    '콘서트 예매',
    '팬미팅 일정',
    '공항패션',
    '인스타',
    '논란 정리',
    '시상식',
  ],
  broadcast: ['출연진', '방송시간', '시청률', '재방송', '공식영상', '게스트', '예고'],
  music: ['컴백', '신곡', '앨범', '콘서트', '팬미팅', '초동', '차트', '티저'],
  movie: ['개봉일', '결말 해석', '쿠키 영상', 'OTT 보는곳', '출연진', '예매 일정', '관람평', '시사회', '원작 차이'],
  drama: ['방송시간', '출연진', '몇부작', '결말 해석', '인물관계도', '재방송', '시청률', 'OST', '촬영지', '공개일'],
  anime: ['방영일', '몇부작', '극장판 개봉일', 'OTT 보는곳', '원작 차이', '최신화', '성우', '굿즈 예약'],
  game: ['출시일', '업데이트', '쿠폰', '공략', '티어표', '이벤트', '사양', '초보 가이드', '패치노트'],
  sports: ['중계', '경기일정', '티켓팅 일정', '라인업', '순위', '선발', '하이라이트', '직관 준비물'],
  book: ['베스트셀러', '서평', '책 추천', '독서법', '신간 일정', '전자책', '오디오북', '북클럽'],
  hobby: ['입문', '클래스', '키트', '재료', '도안', '전시', '디자인', '가드닝', '화분', '재배'],
  self_development: ['명언', '좋은글', '이미지', '습관', '동기부여', '글귀', '루틴', '독서법'],
  electronics: ['리뷰', '후기', '비교', '설치', '용량', '전기요금', '필터 교체', '렌탈'],
  kitchen: ['리뷰', '후기', '비교', '소재', '사용법', '관리법', '추천', '세척'],
  baby_products: ['분유', '기저귀', '유모차', '카시트', '장난감', '이유식', '사이즈', '비교'],
  health: ['효능', '부작용', '복용법', '추천', '비교', '후기', '가격', '검사', '증상'],
  hospital: ['검사', '진료', '예약', '비용', '실비', '준비사항', '검진 대상', '증상'],
  education: ['시험일정', '접수', '기출', '합격률', '국비지원', '준비물', '교재', '독학'],
  english: ['토익', '영어회화', '어학원', '교재', '독학', '시험', '쉐도잉', '화상영어'],
  travel_domestic: ['축제 일정', '주차', '날씨', '준비물', '코스', '입장료', '예약'],
  travel_overseas: ['항공권', '일정', '준비물', '비자', '환전', '숙소', '예약'],
  food: ['맛집', '메뉴', '예약', '가격', '웨이팅', '후기', '주차'],
  recipe: ['황금레시피', '재료', '양념', '보관법', '만드는법', '칼로리'],
  fashion: ['코디', '브랜드', '사이즈', '할인', '후기', '하객룩', '출근룩'],
  beauty: ['성분', '피부타입', '올리브영', '후기', '추천', '순서', '민감성'],
  finance: ['조건', '금리', '한도', '신청방법', '세액공제', '환급', '비교'],
  business: ['사업자등록', '세무', '창업', '지원금', '신고기간', '절세', '비용', '서류'],
  realestate: ['청약', '일정', '조건', '대출', '분양가', '전세', '월세', '시세'],
  sidejob: ['시작방법', '수익', '후기', '세금', '플랫폼', '현실', '무자본'],
  parenting: ['시기', '준비물', '방법', '추천', '주의사항', '발달', '검진'],
  parenting_kids: ['준비물', '공부법', '학원', '시험', '체험학습', '독서', '방학'],
  pregnancy: ['초기증상', '준비물', '주의사항', '검사', '비용', '지원금', '후기'],
  senior: ['자격', '신청', '건강검진', '연금', '비용', '지원금', '주의사항'],
  pet_dog: ['추천', '비용', '병원', '훈련', '간식', '사료', '주의사항'],
  pet_cat: ['추천', '비용', '병원', '모래', '사료', '간식', '주의사항'],
  pet_etc: ['먹이', '케이지', '수조', '분양', '사육환경', '수명', '온도', '병원'],
  car: ['비용', '보험', '교체주기', '후기', '비교', '보조금', '점검'],
  car_maintain: ['교체주기', '비용', '점검', '셀프', '주의사항', '정비'],
  home_life: ['정리', '청소', '수납', '비용', '추천', '방법', '꿀팁'],
  interior: ['비용', '견적', '셀프', '추천', '시공', '후기', '주의사항'],
  it: ['사용법', '설정', '오류 해결', '비교', '추천', '업데이트', '후기'],
  ai_tool: ['사용법', '프롬프트', '무료', '가격', '비교', '업데이트', '활용'],
  smartphone: ['설정', '업데이트', '비교', '가격', '사전예약', '후기', '오류'],
  laptop: ['비교', '추천', '사양', '가격', '후기', '할인', '용도별'],
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2 || value.length > 34) continue;
    const key = value.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeLiveSeed(raw: string): string {
  let value = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[“”"「」『』]/g, ' ')
    .replace(/\[[^\]]{1,18}\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/[가-힣a-zA-Z]/.test(value)) return '';
  if (value.length > 34) {
    const clipped = value.slice(0, 34);
    value = clipped.replace(/\s+\S*$/, '').trim() || clipped.trim();
  }
  return value;
}

function getKoreanDateParts(now = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);

  const year = Number(parts.find(part => part.type === 'year')?.value || now.getFullYear());
  const month = Number(parts.find(part => part.type === 'month')?.value || now.getMonth() + 1);
  return { year, month };
}

function getSeasonLabel(month: number): string {
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

function getCategoryIntents(categoryIds: string[]): string[] {
  const intents: string[] = [];
  for (const id of categoryIds) {
    intents.push(...(CATEGORY_INTENTS[id] || []));
  }
  return unique([...intents, ...COMMON_INTENTS]).slice(0, 14);
}

function isEntertainmentCategory(categoryIds: string[]): boolean {
  return categoryIds.some(id => ['celeb', 'broadcast', 'music', 'drama', 'movie', 'anime'].includes(id));
}

function isSportsLiveSeed(seed: string): boolean {
  return /(KBO|K리그|EPL|NBA|MLB|프로야구|야구|축구|농구|월드컵|올스타전|개막전|결승전)/i.test(seed)
    && /(티켓팅|예매|중계|경기|일정|라인업|하이라이트|순위|직관|선발|티켓)/.test(seed);
}

function selectLiveSeedsForCategory(liveSeeds: string[], category: string, categoryIds: string[]): string[] {
  if (categoryIds.length === 0) return liveSeeds;

  if (categoryIds.includes('sports')) {
    return unique(liveSeeds.filter(seed => isSportsLiveSeed(seed) || matchesDiscoveryCategory(seed, category)));
  }

  const candidateLiveSeeds = isEntertainmentCategory(categoryIds)
    ? liveSeeds.filter(seed => !isSportsLiveSeed(seed))
    : liveSeeds;

  const matched = candidateLiveSeeds.filter(seed => matchesDiscoveryCategory(seed, category));

  // YouTube KR trending often surfaces entity names without category words.
  // Keep those ambiguous live seeds only for entertainment-style categories.
  if (isEntertainmentCategory(categoryIds)) return unique([
    ...matched,
    ...candidateLiveSeeds.filter(seed => !matched.includes(seed)).slice(0, 12),
  ]);

  if (matched.length > 0) return unique(matched);

  return [];
}

export function buildCategoryFirstGoldenSeedPlan(params: {
  category: string;
  keyword?: string;
  maxSeeds?: number;
  now?: Date;
  liveSeeds?: string[];
}): CategoryFirstGoldenSeedPlan {
  const category = String(params.category || '').trim();
  const keyword = String(params.keyword || '').replace(/\s+/g, ' ').trim();
  const maxSeeds = Math.max(30, Math.min(1200, params.maxSeeds || 240));
  const categoryIds = resolveDiscoveryCategoryIds(category);
  const { year, month } = getKoreanDateParts(params.now);
  const season = getSeasonLabel(month);
  const freshnessHints = [`${year}`, `${year}년`, `${month}월`, `${year}년 ${month}월`, season, '최신'];
  const intents = getCategoryIntents(categoryIds);
  const baseSeeds = getDiscoveryCategorySeeds(category, Math.max(160, Math.min(720, maxSeeds)));
  const rawLiveSeeds = unique((params.liveSeeds || []).map(normalizeLiveSeed))
    .slice(0, Math.min(120, Math.max(20, Math.floor(maxSeeds * 0.35))));
  const liveSeeds = selectLiveSeedsForCategory(rawLiveSeeds, category, categoryIds);

  const seeds: string[] = [];

  if (keyword) {
    seeds.push(keyword);
    seeds.push(`${keyword} ${year}`);
    seeds.push(`${keyword} ${month}월`);
    seeds.push(`${keyword} 최신`);
    for (const intent of intents.slice(0, 10)) {
      if (!keyword.includes(intent)) seeds.push(`${keyword} ${intent}`);
    }
  }

  for (const seed of liveSeeds) {
    seeds.push(seed);
  }

  for (const seed of liveSeeds.slice(0, 80)) {
    seeds.push(`${seed} ${year}`);
    seeds.push(`${seed} ${month}월`);
    seeds.push(`${seed} 최신`);
    for (const intent of intents.slice(0, 6)) {
      if (!seed.includes(intent)) seeds.push(`${seed} ${intent}`);
    }
  }

  for (const seed of baseSeeds) {
    seeds.push(seed);
  }

  for (const seed of baseSeeds.slice(0, 90)) {
    seeds.push(`${year} ${seed}`);
    seeds.push(`${month}월 ${seed}`);
    seeds.push(`${seed} 최신`);
    for (const intent of intents.slice(0, 5)) {
      if (!seed.includes(intent)) seeds.push(`${seed} ${intent}`);
    }
  }

  for (const seed of baseSeeds.slice(0, 40)) {
    seeds.push(`${season} ${seed}`);
    seeds.push(`${year}년 ${month}월 ${seed}`);
  }

  return {
    category,
    categoryIds,
    seeds: unique(seeds).slice(0, maxSeeds),
    freshnessHints,
    liveSeedCount: liveSeeds.length,
  };
}
