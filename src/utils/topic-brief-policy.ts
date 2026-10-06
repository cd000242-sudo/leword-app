import { BRIEF_FIELDS } from './topic-briefs';

/** Editorial allocation, separate from data-based keyword scores or earning estimates. */
export const DEFAULT_BRIEF_GOAL = 60;
export const MAX_BRIEF_GOAL = 100;
// 주력 = 정책·복지(사회·정치)와 소상공인·금융(비즈니스·경제). 2026-10-06 네이버 32주제로 옮기며 같은 뜻의 주제로 바꿨다.
export const DEFAULT_BRIEF_MAIN_CATEGORIES = ['사회·정치', '비즈니스·경제'] as const;
/**
 * 32주제 전부에 비중을 준다(2026-09-29 17분야 원칙을 2026-10-06 네이버 32주제로 옮김, 사장님 "다른 카테고리들도 전부").
 * 경제·비즈니스·지원금은 2, 나머지는 1 — 비중은 두되 어느 분야도 비우지 않는다.
 * 옛 기본(5분야만 3·3·2·1·1)은 나머지 12분야를 아예 안 뽑아 사이트에 5분야만 보였다.
 */
export const DEFAULT_BRIEF_CATEGORY_WEIGHTS: Record<string, number> = Object.fromEntries(
  BRIEF_FIELDS.map(({ field }) => [field, (DEFAULT_BRIEF_MAIN_CATEGORIES as readonly string[]).includes(field) ? 2 : 1]),
);

export interface TopicBriefPolicyOptions {
  goal?: number;
  mainCategories?: readonly string[];
  /** Share reserved for selected main categories. Default 80%; bounded to 0–100%. */
  mainCategoryShare?: number;
  /** Nonnegative editorial weights; zero removes a category. */
  weights?: Readonly<Record<string, number>>;
}

export function normalizeBriefGoal(goal?: number): number {
  return typeof goal === 'number' && Number.isFinite(goal)
    ? Math.max(1, Math.min(MAX_BRIEF_GOAL, Math.floor(goal))) : DEFAULT_BRIEF_GOAL;
}

export function buildTopicBriefPolicy(options: TopicBriefPolicyOptions = {}) {
  const goal = normalizeBriefGoal(options.goal);
  const weights = { ...DEFAULT_BRIEF_CATEGORY_WEIGHTS, ...options.weights };
  const entries = Object.entries(weights).filter(([field, weight]) => field.trim() && Number.isFinite(weight) && weight > 0)
    .map(([field, weight]) => [field, Math.min(weight, 1_000_000)] as const);
  const requested = Array.isArray(options.mainCategories) ? options.mainCategories : DEFAULT_BRIEF_MAIN_CATEGORIES;
  const mainCategories = [...new Set(requested.filter(field => typeof field === 'string').map(field => field.trim()))].filter(field => entries.some(([name]) => name === field));
  const mainSet = new Set(mainCategories);
  const mainWeight = entries.filter(([field]) => mainSet.has(field)).reduce((sum, [, weight]) => sum + weight, 0);
  const otherWeight = entries.filter(([field]) => !mainSet.has(field)).reduce((sum, [, weight]) => sum + weight, 0);
  const share = Number.isFinite(options.mainCategoryShare) ? Math.max(0, Math.min(1, options.mainCategoryShare!)) : 0.8;
  // 사용자가 주력 분야나 몫을 직접 고르면 80% 몫을 준다. 기본 회차는 가중치 비례로만 나눠 17분야가 다 실린다.
  const reserveShare = Array.isArray(options.mainCategories) || Number.isFinite(options.mainCategoryShare);
  const allocations = entries.map(([field, weight], index) => {
    const main = mainSet.has(field);
    const fraction = reserveShare && mainWeight && otherWeight ? (main ? share * weight / mainWeight : (1 - share) * weight / otherWeight) : weight / (mainWeight + otherWeight);
    const exact = goal * fraction;
    return { field, desiredTarget: Math.floor(exact + 1e-10), targetCount: 4, weight, main, fraction: exact - Math.floor(exact + 1e-10), index };
  });
  let remaining = goal - allocations.reduce((sum, entry) => sum + entry.desiredTarget, 0);
  const remainderOrder = [...allocations].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; remainderOrder.length && remaining > 0; index++, remaining--) remainderOrder[index % remainderOrder.length].desiredTarget++;
  return { goal, batchSize: 4, mainCategories, mainCategoryShare: share, allocations: allocations.map(({ fraction, index, ...entry }) => entry) };
}
