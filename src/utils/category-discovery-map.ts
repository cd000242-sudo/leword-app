import { getCategorySeeds, isKeywordMatchingCategory } from './categories';
import { getEnhancedCategoryGoldenKeywords } from './profit-keyword-hunter-upgrade';

const CATEGORY_ALIASES: Record<string, string[]> = {
  '': [],
  all: [],
  전체: [],
  정치: ['policy'],
  경제: ['finance', 'business'],
  사회: ['policy', 'life_tips'],
  국제: ['policy'],
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
  엔터테인먼트: ['celeb'],
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
  celeb: ['celeb'],
  fashion: ['fashion', 'beauty'],
  parenting_kids: ['parenting', 'education', 'baby_products'],
  pregnancy: ['parenting', 'baby_products', 'health'],
  senior: ['health', 'finance', 'policy'],
  home: ['home_life', 'interior', 'kitchen'],
  culture: ['movie', 'drama', 'music', 'book', 'hobby'],
  self: ['self_development'],
  auto: ['car', 'car_maintain'],
  travel: ['travel_domestic', 'travel_overseas'],
  pet: ['pet_dog', 'pet_cat', 'pet_etc'],
  car_all: ['car', 'car_maintain'],
  life_tips: ['life_tips', 'home_life'],
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
