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
