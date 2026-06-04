import { CATEGORY_MAP, getCategorySeeds, isKeywordMatchingCategory } from './categories';
import { getEnhancedCategoryGoldenKeywords } from './profit-keyword-hunter-upgrade';

const CATEGORY_ALIASES: Record<string, string[]> = {
  '': [],
  all: [],
  전체: [],
  정치: ['policy'],
  경제: ['finance', 'business'],
  사회: ['policy', 'life_tips'],
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
  AI: ['ai_tool', 'it'],
  ai: ['ai_tool', 'it'],
  생활: ['life_tips', 'home_life'],
  건강: ['health'],
  육아: ['parenting', 'baby_products'],
  반려동물: ['pet_dog', 'pet_cat', 'pet_etc'],
  인테리어: ['interior'],
  엔터테인먼트: ['celeb', 'broadcast', 'music'],
  연예: ['celeb', 'broadcast', 'music'],
  연예인: ['celeb', 'broadcast', 'music'],
  스타: ['celeb', 'broadcast', 'music'],
  스타연예인: ['celeb', 'broadcast', 'music'],
  연예인이슈: ['celeb', 'broadcast', 'music'],
  스타이슈: ['celeb', 'broadcast', 'music'],
  연예뉴스: ['celeb', 'broadcast', 'music'],
  실시간연예: ['celeb', 'broadcast', 'music'],
  아이돌: ['celeb', 'music'],
  영화: ['movie'],
  드라마: ['drama'],
  음악: ['music'],
  예능: ['broadcast'],
  쇼핑: ['electronics', 'fashion', 'beauty'],
  패션: ['fashion'],
  뷰티: ['beauty'],
  가전: ['electronics'],
  음식: ['food', 'recipe'],
  맛집: ['food'],
  카페: ['food'],
  레시피: ['recipe'],
  여행: ['travel_domestic', 'travel_overseas'],
  국내여행: ['travel_domestic'],
  해외여행: ['travel_overseas'],
  호텔: ['travel_domestic', 'travel_overseas'],
  자동차: ['car'],
  전기차: ['car'],
  중고차: ['car'],
  부동산: ['realestate'],
  아파트: ['realestate'],
  오피스텔: ['realestate'],
  부동산투자: ['realestate'],
  투자: ['finance', 'realestate'],
  교육: ['education'],
  자격증: ['education'],
  학원: ['education'],
  어학: ['english'],
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
  창업: ['business'],
  마케팅: ['business'],
  부업: ['sidejob', 'business'],
  N잡: ['sidejob', 'business'],
  n잡: ['sidejob', 'business'],
  자기계발: ['self_development'],
  결혼: ['wedding'],
  웨딩: ['wedding'],
  celeb: ['celeb'],
  celebrity: ['celeb', 'broadcast', 'music'],
  policy: ['policy'],
  subsidy: ['policy'],
  support: ['policy'],
  entertainment: ['celeb', 'broadcast', 'music'],
  star: ['celeb', 'broadcast', 'music'],
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

export function getDiscoveryCategorySeeds(category: string | undefined | null, maxSeeds = 120): string[] {
  const ids = resolveDiscoveryCategoryIds(category);
  if (ids.length === 0) return [];

  const baseSeeds: string[] = [];
  for (const id of ids) {
    baseSeeds.push(...getCategorySeeds(id));
    baseSeeds.push(...getEnhancedCategoryGoldenKeywords(id));
  }

  const expanded: string[] = [];
  for (const seed of baseSeeds.slice(0, Math.max(12, Math.min(baseSeeds.length, 60)))) {
    expanded.push(seed);
    const hasIntent = SEED_EXTRA_SUFFIXES.some(suffix => seed.includes(suffix));
    if (hasIntent) continue;
    for (const suffix of SEED_EXTRA_SUFFIXES.slice(0, 4)) {
      expanded.push(`${seed} ${suffix}`);
    }
  }

  return unique([...baseSeeds, ...expanded]).slice(0, maxSeeds);
}

export function getCrossCategoryDiscoverySeeds(excludedCategoryIds: string[] = [], maxSeeds = 240): string[] {
  const excluded = new Set((excludedCategoryIds || []).map(id => String(id || '').trim()).filter(Boolean));
  const categoryIds = Array.from(CATEGORY_MAP.values())
    .map(category => category.id)
    .filter(id => id && id !== 'all' && id !== 'pro_premium' && !excluded.has(id));

  const out: string[] = [];
  const perCategoryBaseLimit = Math.max(3, Math.min(8, Math.ceil(maxSeeds / Math.max(1, categoryIds.length))));
  for (const id of categoryIds) {
    const seeds = unique([
      ...getCategorySeeds(id),
      ...getEnhancedCategoryGoldenKeywords(id),
    ]).slice(0, perCategoryBaseLimit);
    for (const seed of seeds) {
      out.push(seed);
      const hasIntent = SEED_EXTRA_SUFFIXES.some(suffix => seed.includes(suffix));
      if (hasIntent) continue;
      for (const suffix of SEED_EXTRA_SUFFIXES.slice(0, 2)) {
        out.push(`${seed} ${suffix}`);
      }
    }
  }

  return unique(out).slice(0, maxSeeds);
}
