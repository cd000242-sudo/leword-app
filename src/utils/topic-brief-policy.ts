/** Editorial allocation, separate from data-based keyword scores or earning estimates. */
export const DEFAULT_BRIEF_GOAL = 50;
export const MAX_BRIEF_GOAL = 100;
export const DEFAULT_BRIEF_MAIN_CATEGORIES = ['지원금·복지', '비즈니스·소상공인', '경제·금융'] as const;
export const DEFAULT_BRIEF_CATEGORY_WEIGHTS: Record<string, number> = {
  '지원금·복지': 3, '비즈니스·소상공인': 3, '경제·금융': 2,
  '생활경제·부동산': 1, '주요 이슈': 1,
};

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
  const allocations = entries.map(([field, weight], index) => {
    const main = mainSet.has(field);
    const fraction = mainWeight && otherWeight ? (main ? share * weight / mainWeight : (1 - share) * weight / otherWeight) : weight / (mainWeight + otherWeight);
    const exact = goal * fraction;
    return { field, desiredTarget: Math.floor(exact + 1e-10), targetCount: 4, weight, main, fraction: exact - Math.floor(exact + 1e-10), index };
  });
  let remaining = goal - allocations.reduce((sum, entry) => sum + entry.desiredTarget, 0);
  const remainderOrder = [...allocations].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; remainderOrder.length && remaining > 0; index++, remaining--) remainderOrder[index % remainderOrder.length].desiredTarget++;
  return { goal, batchSize: 4, mainCategories, mainCategoryShare: share, allocations: allocations.map(({ fraction, index, ...entry }) => entry) };
}
