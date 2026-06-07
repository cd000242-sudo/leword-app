/**
 * 카테고리 분류 로직 — categories.ts의 데이터를 기반으로 키워드 분류
 */
import { CATEGORIES, CategoryDefinition } from './categories';

export const CATEGORY_MAP: ReadonlyMap<string, CategoryDefinition> = new Map(
  CATEGORIES.map((cat) => [cat.id, cat])
);

export function getCategoryById(id: string): CategoryDefinition | undefined {
  return CATEGORY_MAP.get(id);
}

// 부모 카테고리 매핑: pet_dog → pet 등
const PARENT_GROUPS: Record<string, string[]> = {
  pet: ['pet_dog', 'pet_cat', 'pet_etc'],
  travel: ['travel_domestic', 'travel_overseas'],
  car_all: ['car', 'car_maintain'],
  season: ['season_spring', 'season_summer', 'season_fall', 'season_winter'],
  self_development: ['education', 'english', 'coding', 'job'],
  business: ['finance', 'sidejob'],
  it: ['smartphone', 'laptop', 'app', 'ai_tool', 'electronics'],
  life_tips: ['home_life'],
};

// 자식 → 부모 역매핑
const CHILD_TO_PARENT: Record<string, string> = {};
for (const [parent, children] of Object.entries(PARENT_GROUPS)) {
  for (const child of children) {
    CHILD_TO_PARENT[child] = parent;
  }
}

export interface ClassifyResult {
  primary: string;
  secondary?: string;
  confidence: number;
}

// 필터링 전용 캐시 (성능)
const classifyCache = new Map<string, ClassifyResult>();

/**
 * 키워드를 카테고리로 분류 (주/보조 카테고리 반환)
 */
export function classifyKeyword(keyword: string): ClassifyResult {
  const cached = classifyCache.get(keyword);
  if (cached) return cached;

  const kw = keyword.toLowerCase();
  const compact = kw.replace(/\s+/g, '');
  const entertainmentWorkRe = /(멋진신세계|신입사원강회장|참교육|하트시그널|나는솔로|환승연애|솔로지옥|미스터트롯|현역가왕|불타는트롯맨|유퀴즈|런닝맨|라디오스타|전지적참견시점|나혼자산다|복면가왕|싱어게인|쇼미더머니|흠뻑쇼|워터밤|콘서트|팬미팅|아이돌|배우|가수|드라마|영화|예능|방송|넷플릭스|티빙|디즈니플러스|쿠팡플레이)/i;
  const dramaBroadcastIntentRe = /(몇부작|출연진|공식영상|인물관계도|등장인물|방송시간|다시보기|재방송|원작|시청률|촬영지|결말|예고편|ost|ott|줄거리|게스트|방청신청|편성표)/i;
  const movieIntentRe = /(개봉일|쿠키영상|상영관|예매|관람평|후기|결말해석|감독|출연진|줄거리|ott보는곳)/i;
  const musicIntentRe = /(공연일정|일정|콘서트|예매|좌석|티켓팅|라인업|컴백|팬미팅|뮤직비디오|음원|앨범)/i;
  if (entertainmentWorkRe.test(compact)) {
    const result: ClassifyResult | null = dramaBroadcastIntentRe.test(compact)
      ? { primary: 'drama', secondary: 'broadcast', confidence: 0.95 }
      : movieIntentRe.test(compact)
        ? { primary: 'movie', secondary: undefined, confidence: 0.95 }
        : musicIntentRe.test(compact)
          ? { primary: 'music', secondary: 'celeb', confidence: 0.95 }
          : null;
    if (result) {
      if (classifyCache.size > 5000) classifyCache.clear();
      classifyCache.set(keyword, result);
      return result;
    }
  }
  const sportsEventRe = /(kbo|k리그|epl|nba|mlb|프로야구|야구|축구|농구|월드컵|올스타전|개막전|결승전)/i;
  const sportsIntentRe = /(티켓팅|예매|중계|경기|일정|라인업|하이라이트|순위|직관|선발|티켓)/;
  if (sportsEventRe.test(kw) && sportsIntentRe.test(kw)) {
    const result: ClassifyResult = {
      primary: 'sports',
      secondary: undefined,
      confidence: 0.95,
    };
    if (classifyCache.size > 5000) classifyCache.clear();
    classifyCache.set(keyword, result);
    return result;
  }

  const META_IDS = new Set(['all', 'pro_premium']);

  let bestPrimary: { id: string; score: number } = { id: 'all', score: 0 };
  let bestSecondary: { id: string; score: number } = { id: '', score: 0 };

  for (const cat of CATEGORIES) {
    if (META_IDS.has(cat.id)) continue;

    if (cat.excludeTokens.length > 0 && cat.excludeTokens.some(t => kw.includes(t.toLowerCase()))) {
      continue;
    }

    const primaryHits = cat.primaryTokens.filter(t => kw.includes(t.toLowerCase())).length;
    const secondaryHits = cat.secondaryTokens.filter(t => kw.includes(t.toLowerCase())).length;

    let score = 0;
    if (primaryHits > 0) {
      score = 0.7 + Math.min(0.3, primaryHits * 0.1);
    } else if (secondaryHits >= 2) {
      score = 0.3 + Math.min(0.3, secondaryHits * 0.1);
    } else if (secondaryHits === 1) {
      score = 0.2;
    }

    if (score > bestPrimary.score) {
      if (bestPrimary.score > 0) {
        bestSecondary = { ...bestPrimary };
      }
      bestPrimary = { id: cat.id, score };
    } else if (score > bestSecondary.score && cat.id !== bestPrimary.id) {
      bestSecondary = { id: cat.id, score };
    }
  }

  const result: ClassifyResult = {
    primary: bestPrimary.id,
    secondary: bestSecondary.id || undefined,
    confidence: bestPrimary.score,
  };

  if (classifyCache.size > 5000) classifyCache.clear();
  classifyCache.set(keyword, result);

  return result;
}

/**
 * 키워드가 선택한 카테고리에 매칭되는지 (OR 조건: 주/보조/부모그룹 매칭)
 */
export function isKeywordMatchingCategory(keyword: string, selectedCategory: string): boolean {
  if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'pro_premium') return true;

  const selectedEntertainmentIds = new Set(['celeb', 'broadcast', 'music', 'drama', 'movie']);
  if (selectedEntertainmentIds.has(selectedCategory)) {
    const compact = String(keyword || '').replace(/\s+/g, '');
    const personIntentRe = /^[가-힣]{2,5}(프로필|나이|인스타|근황|공식입장)$/;
    const nonEntertainmentPersonRe = /(강훈식|정성호|이진숙|홍명보|이정효|오현규|호날두|프로당구|대표팀|감독|선수|장관|의원|후보|선거|대통령|총리|시장|지사)/;
    if (personIntentRe.test(compact) && !nonEntertainmentPersonRe.test(compact)) {
      return true;
    }
  }

  const { primary, secondary } = classifyKeyword(keyword);

  if (primary === selectedCategory || secondary === selectedCategory) return true;

  const parentOfSelected = CHILD_TO_PARENT[selectedCategory];
  const childrenOfSelected = PARENT_GROUPS[selectedCategory];

  if (childrenOfSelected) {
    if (childrenOfSelected.includes(primary) || (secondary && childrenOfSelected.includes(secondary))) {
      return true;
    }
  }

  if (parentOfSelected && (primary === parentOfSelected || secondary === parentOfSelected)) {
    return true;
  }

  return false;
}

/**
 * categories.ts 기반 시드 키워드 가져오기
 */
export function getCategorySeeds(categoryId: string): string[] {
  const cat = CATEGORY_MAP.get(categoryId);
  if (!cat) return [];

  const combined: string[] = [...cat.seeds];
  const year = new Date().getFullYear();

  for (const seed of cat.seeds.slice(0, 5)) {
    for (const pattern of cat.profitPatterns) {
      if (!seed.includes(pattern)) {
        combined.push(`${seed} ${pattern}`);
      }
    }
  }

  for (const seed of cat.seeds.slice(0, 3)) {
    combined.push(`${year} ${seed}`);
  }

  return combined;
}

/**
 * classifyKeyword 캐시 초기화
 */
export function clearClassifyCache(): void {
  classifyCache.clear();
}
