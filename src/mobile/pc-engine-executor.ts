import {
  type GoldenDiscoveryMobileParams,
  type HomeBoardMobileParams,
  type MobileAgentAssistContext,
  type MobileKeywordAgentInsight,
  type MobileAgentAwareParams,
  type KeywordAnalysisMobileParams,
  type KinHiddenHoneyMobileParams,
  type MindmapExpansionMobileParams,
  type MobileKeywordContextCandidate,
  type NaverMateMobileParams,
  type MobileJobEnvelope,
  type MobileKeywordMetric,
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobileResultGrade,
  type MobileShoppingProductPick,
  type MobileSignalItem,
  type MobileSourceSignalLane,
  type ProTrafficMobileParams,
  type ShoppingConnectMobileParams,
  type YoutubeGoldenMobileParams,
} from './contracts';
import {
  type MobileJobExecutor,
  type MobileJobExecutorContext,
} from './job-orchestrator';
import {
  rankKeywordExpansionCandidates,
} from '../utils/keyword-expansion-ranker';
import {
  isMindmapExpansionKeywordCandidate,
  type MindmapExpansionCandidate,
  rankMindmapExpansionCandidates,
} from '../utils/mindmap-expansion-quality';
import {
  type MDPDiscoverProgress,
  MDPEngine,
  type MDPResult,
} from '../utils/mdp-engine';
import {
  buildCategoryFirstGoldenSeedPlan,
} from '../utils/category-first-golden-discovery';
import {
  type ProTrafficHuntResult,
  type ProTrafficKeyword,
  huntProTrafficKeywords,
} from '../utils/pro-traffic-keyword-hunter';
import {
  HOME_HUNTER_MIN_SPLUS_RESULTS,
  expandHomeNeedKeywords,
  rankHomeNeedKeywords,
} from '../utils/pro-hunter-v12/home-keyword-intent';
import {
  buildHomePublishPlan,
} from '../utils/pro-hunter-v12/home-publish-planner';
import {
  type EnvConfig,
  EnvironmentManager,
} from '../utils/environment-manager';
import {
  getNaverSearchAdKeywordVolume,
  type KeywordSearchVolume,
} from '../utils/naver-searchad-api';
import {
  getNaverBlogDocumentCount,
  naverBlogDocumentCountQueryKey,
  normalizeNaverBlogBroadQuery,
  peekCachedNaverBlogDocumentCountMeasurement,
} from '../utils/naver-blog-api';
import { searchAdKeywordBindingMetadata } from '../utils/searchad-result-alignment';
import {
  calculateMindmapMetricGrade,
} from '../utils/mindmap-metrics';
import { normalizeStoredGrade } from '../utils/grade';
import {
  countSss,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
} from '../utils/golden-discovery-floor';
import {
  discoverDirectGoldenKeywords,
} from '../utils/direct-golden-keyword-miner';
import {
  buildMobileSourceSignalSnapshot,
} from './source-signals';
import {
  attachPublishDecisions,
} from './publish-decision';
import {
  attachKeywordAiJudges,
  hasFreshCanonicalDocumentCountMeasurement,
  hasTrustedDocumentCountMeasurement,
  hasTrustedSearchVolumeMeasurement,
  isUltimateGoldenKeywordCandidate,
  isUltimateLowValueLookupKeyword,
} from './keyword-ai-judge';

const EXTERNAL_AGENT_MAX_ROWS = 8;
const EXTERNAL_AGENT_MAX_OUTPUT_TOKENS = 2048;

export class MobilePcEngineNotConnectedError extends Error {
  constructor(product: MobileKeywordProduct) {
    super(`${product} PC engine adapter is not connected yet`);
    this.name = 'MobilePcEngineNotConnectedError';
  }
}

export class MobilePcEngineConfigError extends Error {
  constructor(product: MobileKeywordProduct, message: string) {
    super(`${product} PC engine config error: ${message}`);
    this.name = 'MobilePcEngineConfigError';
  }
}

export type MobileGoldenDiscoveryAdapter = (
  params: GoldenDiscoveryMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileProTrafficAdapter = (
  params: ProTrafficMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileHomeBoardAdapter = (
  params: HomeBoardMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileKinHiddenHoneyAdapter = (
  params: KinHiddenHoneyMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileShoppingConnectAdapter = (
  params: ShoppingConnectMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileYoutubeGoldenAdapter = (
  params: YoutubeGoldenMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileNaverMateAdapter = (
  params: NaverMateMobileParams,
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordResult>;

export type MobileKeywordMetricsAdapter = (
  metrics: MobileKeywordMetric[],
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordMetric[]>;

export interface MobilePcEngineExecutorOptions {
  runGoldenDiscovery?: MobileGoldenDiscoveryAdapter;
  runProTraffic?: MobileProTrafficAdapter;
  runHomeBoard?: MobileHomeBoardAdapter;
  runKinHiddenHoney?: MobileKinHiddenHoneyAdapter;
  runShoppingConnect?: MobileShoppingConnectAdapter;
  runYoutubeGolden?: MobileYoutubeGoldenAdapter;
  runNaverMate?: MobileNaverMateAdapter;
  measureKeywordMetrics?: MobileKeywordMetricsAdapter;
  getEnvConfig?: () => Partial<EnvConfig>;
}

function ensureNotAborted(context: MobileJobExecutorContext): void {
  if (context.signal.aborted) {
    throw new Error('cancelled');
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeKeyword(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const clean = normalizeKeyword(item);
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeAgentAssistContext(value: unknown): MobileAgentAssistContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled !== false;
  if (!enabled) return { enabled: false };
  const usageWindowHours = Number(raw.usageWindowHours);
  const externalAiKeyOwner = normalizeKeyword(raw.externalAiKeyOwner);
  const externalAiProvider = normalizeKeyword(raw.externalAiProvider).toLowerCase();
  const externalAiProviders = normalizeStringList(raw.externalAiProviders, 2)
    .map((provider) => provider.toLowerCase())
    .filter((provider): provider is 'anthropic' | 'openai' => (
      provider === 'anthropic' || provider === 'openai'
    ));
  return {
    enabled: true,
    version: normalizeKeyword(raw.version) || 'web-agent-assist-v1',
    mode: normalizeKeyword(raw.mode) || 'server-default-worker',
    featureId: normalizeKeyword(raw.featureId) || undefined,
    provider: normalizeKeyword(raw.provider) || 'server-auto',
    providerLabel: normalizeKeyword(raw.providerLabel) || undefined,
    seedKeyword: normalizeKeyword(raw.seedKeyword) || null,
    includeAiInference: raw.includeAiInference === true,
    forceExternalInference: raw.forceExternalInference === true,
    externalAi: raw.externalAi === true,
    externalAiKeyOwner: externalAiKeyOwner === 'user-local' || externalAiKeyOwner === 'server-approved'
      ? externalAiKeyOwner
      : undefined,
    externalAiProvider: externalAiProvider === 'anthropic' || externalAiProvider === 'openai'
      ? externalAiProvider
      : undefined,
    externalAiProviders,
    maxAgentRows: clampInt(raw.maxAgentRows, EXTERNAL_AGENT_MAX_ROWS, 1, EXTERNAL_AGENT_MAX_ROWS),
    mindmapAssist: raw.mindmapAssist !== false,
    keywordResearchAssist: raw.keywordResearchAssist !== false,
    usageWindowHours: Number.isFinite(usageWindowHours) && usageWindowHours > 0 ? usageWindowHours : null,
    tasks: normalizeStringList(raw.tasks, 16),
    qualityGates: normalizeStringList(raw.qualityGates, 12),
    mission: normalizeKeyword(raw.mission) || undefined,
    mustFind: normalizeStringList(raw.mustFind, 16),
    rejectIf: normalizeStringList(raw.rejectIf, 16),
    rankingRubric: normalizeStringList(raw.rankingRubric, 16),
    researchChecklist: normalizeStringList(raw.researchChecklist, 16),
    hunterCharter: raw.hunterCharter && typeof raw.hunterCharter === 'object' && !Array.isArray(raw.hunterCharter)
      ? raw.hunterCharter as Record<string, unknown>
      : undefined,
    outputContract: raw.outputContract && typeof raw.outputContract === 'object' && !Array.isArray(raw.outputContract)
      ? Object.fromEntries(Object.entries(raw.outputContract as Record<string, unknown>).map(([key, val]) => [
        key,
        Array.isArray(val) ? normalizeStringList(val, 24) : val === true,
      ]))
      : undefined,
    serverVerified: raw.serverVerified === true,
  };
}

function copyAgentAwareParams(payload: Partial<MobileAgentAwareParams>): MobileAgentAwareParams {
  return {
    includeAiInference: payload.includeAiInference === true,
    agentAssist: normalizeAgentAssistContext(payload.agentAssist),
    adminAiWorker: normalizeAgentAssistContext(payload.adminAiWorker) || null,
  };
}

function compactKeyword(value: string): string {
  return normalizeKeyword(value).toLowerCase().replace(/\s+/g, '');
}

/**
 * Identity of the exact unquoted broad Blog OpenAPI query.
 *
 * SearchAd intentionally treats spaced/unspaced aliases as one keyword, but
 * Naver Blog totals do not have that contract.  Never use compactKeyword for
 * document-count maps.
 */
export function documentCountBroadQueryKey(value: unknown): string {
  return naverBlogDocumentCountQueryKey(value);
}

export function selectForceFreshDocumentCountQueryKey(
  metrics: Array<Pick<MobileKeywordMetric, 'keyword' | 'intent' | 'source'>>,
): string | null {
  for (const metric of metrics) {
    if (metric.intent !== 'requested-keyword' && metric.source !== 'pc-keyword-analysis-exact') {
      continue;
    }
    const queryKey = documentCountBroadQueryKey(metric.keyword);
    if (queryKey) return queryKey;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ratioFromMetrics(totalSearchVolume: number | null, documentCount: number | null): number | null {
  if (totalSearchVolume === null || documentCount === null || documentCount <= 0) return null;
  return Number((totalSearchVolume / documentCount).toFixed(2));
}

function measuredGrade(
  currentGrade: MobileResultGrade,
  totalSearchVolume: number | null,
  documentCount: number | null,
  goldenRatio: number | null,
): MobileResultGrade {
  if (totalSearchVolume === null || documentCount === null || goldenRatio === null) {
    return currentGrade;
  }
  return calculateMindmapMetricGrade(totalSearchVolume, documentCount, goldenRatio);
}

function normalizeGrade(value: unknown, fallbackScore = 0): MobileResultGrade {
  // 등급 SSoT(../utils/grade) 위임 — 지표 미확인 점수-only 는 SSS/SS 승격 금지(최대 S).
  // 기존 '점수 85→SSS' 가짜 SSS 누수 차단. MobileResultGrade 에 'D' 가 없어 D→C 클램프.
  const g = normalizeStoredGrade(value, fallbackScore);
  return g === 'D' ? 'C' : g;
}

function metricFromExpansion(
  keyword: string,
  score: number,
  source: string,
  intent: string,
  category: string,
  evidence: string[],
): MobileKeywordMetric {
  return {
    keyword,
    grade: normalizeGrade(undefined, score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    cpc: null,
    category,
    source,
    intent,
    evidence,
    isMeasured: false,
    measurementStatus: 'unmeasured',
  };
}

export function metricFromMdpResult(result: MDPResult, categoryId: string): MobileKeywordMetric {
  const pcSearchVolumeLt10 = (result as any).pcSearchVolumeLt10 === true;
  const mobileSearchVolumeLt10 = (result as any).mobileSearchVolumeLt10 === true;
  const hasSearchVolumeRange = pcSearchVolumeLt10 || mobileSearchVolumeLt10;
  const rawTotalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount);
  const rawPcSearchVolume = finiteNumber(result.pcSearchVolume);
  const rawMobileSearchVolume = finiteNumber(result.mobileSearchVolume);
  const pcSearchVolume = pcSearchVolumeLt10 ? null : rawPcSearchVolume;
  const mobileSearchVolume = mobileSearchVolumeLt10 ? null : rawMobileSearchVolume;
  const totalSearchVolume = hasSearchVolumeRange ? null : rawTotalSearchVolume;
  const hasConsistentBoundSplit = pcSearchVolume !== null
    && mobileSearchVolume !== null
    && totalSearchVolume !== null
    && pcSearchVolume + mobileSearchVolume === totalSearchVolume;
  const bindingMetadata = hasConsistentBoundSplit || hasSearchVolumeRange
    ? searchAdKeywordBindingMetadata(result)
    : null;
  return {
    keyword: normalizeKeyword(result.keyword),
    grade: hasSearchVolumeRange ? 'C' : normalizeGrade(result.grade, result.score),
    score: hasSearchVolumeRange ? null : finiteNumber(result.score),
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount,
    goldenRatio: hasSearchVolumeRange ? null : finiteNumber(result.goldenRatio),
    cpc: finiteNumber(result.cpc),
    category: categoryId || (result.categoryMatched ? 'matched' : 'auto'),
    source: 'pc-mdp-engine',
    intent: result.intent || 'golden-discovery',
    evidence: [
      'pc-mdp-engine',
      result.goldenReason || '',
      ...(result.externalSources || []),
    ].filter(Boolean),
    isMeasured: !hasSearchVolumeRange && totalSearchVolume !== null && documentCount !== null,
    ...(hasSearchVolumeRange
      ? {
          pcSearchVolumeLt10,
          mobileSearchVolumeLt10,
          measurementStatus: 'partial' as const,
        }
      : {}),
    ...(bindingMetadata
      ? {
          searchVolumeSource: 'searchad' as const,
          searchVolumeConfidence: hasSearchVolumeRange ? 'low' as const : 'high' as const,
          isSearchVolumeEstimated: hasSearchVolumeRange,
          ...bindingMetadata,
        }
      : {}),
  };
}

function metricFromDirectGoldenResult(result: MDPResult, categoryId: string): MobileKeywordMetric {
  const metric = metricFromMdpResult(result, categoryId);
  return {
    ...metric,
    source: 'pc-direct-golden-keyword-miner',
    evidence: [
      'pc-direct-golden-keyword-miner',
      ...metric.evidence,
    ],
  };
}

function recoverDocumentCountFromText(value: unknown): number | null {
  const text = String(value || '');
  const patterns = [
    /문서\s*([0-9,]+)\s*개/i,
    /documents?\s*[:：]?\s*([0-9,]+)/i,
    /documentCount\s*[:：]?\s*([0-9,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const count = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(count) && count > 0) return count;
  }
  return null;
}

function recoverProTrafficDocumentCount(result: ProTrafficKeyword): number | null {
  return recoverDocumentCountFromText(result.profitAnalysis?.gradeReason)
    ?? recoverDocumentCountFromText(result.goldenBackground)
    ?? recoverDocumentCountFromText(result.proStrategy?.title);
}

function metricFromProResult(result: ProTrafficKeyword, categoryId: string): MobileKeywordMetric {
  const totalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount) ?? recoverProTrafficDocumentCount(result);
  const cpc = finiteNumber(result.profitAnalysis?.estimatedCPC)
    ?? finiteNumber(result.revenueEstimate?.estimatedCPC)
    ?? null;
  const recoveredDocumentCount = documentCount !== null && finiteNumber(result.documentCount) === null;

  return {
    keyword: normalizeKeyword(result.keyword),
    grade: normalizeGrade(result.grade, result.totalScore),
    score: finiteNumber(result.totalScore),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(result.goldenRatio),
    cpc,
    category: normalizeKeyword((result as any).category) || categoryId || 'auto',
    source: normalizeKeyword((result as any).source) || 'pc-pro-traffic-keyword-hunter',
    intent: normalizeKeyword((result as any).type)
      || normalizeKeyword(result.timing?.urgency)
      || 'pro-traffic',
    evidence: [
      'pc-pro-traffic-keyword-hunter',
      result.profitAnalysis?.gradeReason || '',
      result.goldenBackground || '',
      result.proStrategy?.title || '',
      recoveredDocumentCount ? 'pc-pro-traffic-document-count-recovered' : '',
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null && documentCount !== null,
  };
}

function gradeFromHomeNeed(value: unknown): MobileResultGrade {
  const grade = String(value || '').toUpperCase();
  if (grade === 'S+') return 'SSS';
  if (grade === 'S') return 'SS';
  if (grade === 'A') return 'S';
  if (grade === 'B') return 'A';
  return 'B';
}

function metricFromHomeNeedResult(
  item: { keyword: string; category?: string; homeNeedScore: number; homeNeedGrade: string },
  categoryId: string,
): MobileKeywordMetric {
  const plan = buildHomePublishPlan({
    keyword: item.keyword,
    category: item.category || categoryId,
    homeScore: item.homeNeedScore,
    valueScore: item.homeNeedScore,
  });

  return {
    keyword: normalizeKeyword(item.keyword),
    grade: gradeFromHomeNeed(item.homeNeedGrade),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    cpc: null,
    category: item.category || categoryId || 'auto',
    source: 'pc-home-need-intent-planner',
    intent: 'home-board-publish-angle',
    evidence: [
      'pc-home-keyword-intent',
      'pc-home-publish-planner',
      `homeNeedScore ${item.homeNeedScore}`,
      `title: ${plan.primaryTitle}`,
      `status: ${plan.status}`,
    ],
    isMeasured: false,
  };
}

function metricFromKinQuestion(question: any): MobileKeywordMetric {
  const score = finiteNumber(question?.honeyPotScore ?? question?.goldenScore) ?? 0;
  const viewCount = finiteNumber(question?.viewCount);
  const answerCount = finiteNumber(question?.answerCount);
  return {
    keyword: normalizeKeyword(question?.title),
    grade: normalizeGrade(question?.honeyPotGrade ?? question?.goldenGrade, score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    cpc: null,
    category: normalizeKeyword(question?.category) || 'naver-kin',
    source: 'pc-naver-kin-golden-hunter-v3',
    intent: 'kin-hidden-honey',
    evidence: [
      'pc-naver-kin-golden-hunter-v3',
      normalizeKeyword(question?.honeyPotReason ?? question?.goldenReason),
      normalizeKeyword(question?.answerAngle),
      normalizeKeyword(question?.blogBridgeTitle),
      viewCount !== null ? `kin-view-count ${viewCount}` : '',
      answerCount !== null ? `kin-answer-count ${answerCount}` : '',
    ].filter(Boolean),
    isMeasured: false,
  };
}

function shoppingText(value: unknown): string {
  return normalizeKeyword(String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'));
}

function uniqueShoppingNotes(values: unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = shoppingText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function buildShoppingRecommendedAngle(seed: any, item: any): string {
  const signalText = [
    seed?.relation,
    seed?.reason,
    item?.writeRecommendation,
    ...(Array.isArray(item?.opportunityReasons) ? item.opportunityReasons : []),
    ...(Array.isArray(item?.opportunityBadges) ? item.opportunityBadges : []),
  ].map(shoppingText).join(' ');
  const hotScore = finiteNumber(item?.shoppingProductQuality?.hotSignalScore) ?? 0;
  const opportunityGrade = shoppingText(item?.opportunityGrade).toUpperCase();
  if (/가격|할인|가성비|비교|최저|후기|추천/.test(signalText)) return '가격/후기 비교형';
  if (hotScore >= 5 || opportunityGrade === 'HOT') return '지금 수요 상승형';
  if (/입문|초보|처음|방법|고르는/.test(signalText)) return '구매 전 선택 기준형';
  return '구매 전환 정보형';
}

function buildShoppingProductPick(
  seed: any,
  item: any,
  fallbackKeyword: string,
): MobileShoppingProductPick | undefined {
  const keyword = shoppingText(seed?.keyword || item?.discoveryQuery || fallbackKeyword);
  const productName = shoppingText(item?.cleanTitle || item?.simplifiedTitle || item?.title || keyword);
  if (!productName) return undefined;

  const category = uniqueShoppingNotes([
    item?.category1,
    item?.category2,
    item?.category3,
    item?.category4,
  ], 4).join(' > ');
  const mallName = shoppingText(item?.mallName);
  const brand = shoppingText(item?.brand || item?.maker);
  const price = finiteNumber(item?.lprice);
  const conversionScore = finiteNumber(item?.conversionScore ?? item?.opportunityScore);
  const qualityScore = finiteNumber(item?.shoppingProductQuality?.score);
  const hotSignalScore = finiteNumber(item?.shoppingProductQuality?.hotSignalScore);
  const recommendedAngle = buildShoppingRecommendedAngle(seed, item);
  const writeRecommendation = shoppingText(item?.writeRecommendation);
  const sellableReason = shoppingText(writeRecommendation || seed?.reason || item?.discoveryReason)
    || uniqueShoppingNotes(item?.opportunityReasons || [], 1)[0]
    || `${keyword || productName} 검색 의도를 ${productName} 비교 글로 연결`;
  const priceTrigger = price !== null ? `가격대 ${price.toLocaleString('ko-KR')}원 기준 비교` : '';
  const mallTrigger = mallName ? `${mallName} 판매 정보와 후기 확인` : '';
  const qualityTrigger = hotSignalScore !== null && hotSignalScore > 0 ? '최근 수요 신호가 붙은 제품군' : '';
  const reasonTriggers = uniqueShoppingNotes([
    ...(Array.isArray(item?.opportunityReasons) ? item.opportunityReasons : []),
    ...(Array.isArray(item?.shoppingProductQuality?.reasons) ? item.shoppingProductQuality.reasons : []),
  ], 3);
  const buyingTriggers = uniqueShoppingNotes([
    priceTrigger,
    mallTrigger,
    qualityTrigger,
    ...reasonTriggers,
    '구매 전 스펙/후기/대체품 비교',
  ], 4);
  const titleBase = keyword || productName;
  const titleDrafts = uniqueShoppingNotes([
    `${titleBase} 구매 전 ${productName} 선택 기준`,
    `${productName} 후기·가격 비교, 지금 살 만한 이유`,
    `${titleBase} 찾는 사람이 ${productName}에서 확인할 포인트`,
  ], 3);
  const caution = item?.shoppingProductQuality?.reject
    ? '상품성 신호가 약해 상위 노출 전 재검증 필요'
    : (item?.opportunityGrade === 'WATCH' ? '수요 근거가 약하면 후기/비교형으로만 접근' : undefined);

  return {
    productName,
    productTitle: shoppingText(item?.title) || productName,
    mallName: mallName || undefined,
    brand: brand || undefined,
    category: category || undefined,
    imageUrl: shoppingText(item?.image) || undefined,
    productUrl: shoppingText(item?.link || item?.productUrl) || undefined,
    price,
    conversionScore,
    qualityScore,
    hotSignalScore,
    sellableReason,
    writeRecommendation: writeRecommendation || undefined,
    recommendedAngle,
    titleDrafts,
    buyingTriggers,
    caution,
  };
}

function metricFromShoppingSeed(seed: any, item: any, fallbackKeyword: string): MobileKeywordMetric {
  const searchVolume = finiteNumber(seed?.searchVolume);
  const documentCount = finiteNumber(seed?.documentCount);
  const goldenRatio = finiteNumber(seed?.goldenRatio)
    ?? (searchVolume !== null && documentCount !== null && documentCount > 0 ? searchVolume / documentCount : null);
  const score = finiteNumber(seed?.entryScore)
    ?? finiteNumber(item?.opportunityScore)
    ?? finiteNumber(item?.conversionScore)
    ?? 50;
  return {
    keyword: normalizeKeyword(seed?.keyword || item?.discoveryQuery || fallbackKeyword),
    grade: normalizeGrade(undefined, score),
    score,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: searchVolume,
    documentCount,
    goldenRatio,
    cpc: null,
    category: normalizeKeyword(item?.category1 || item?.category2) || 'shopping',
    source: 'pc-shopping-connect',
    intent: normalizeKeyword(seed?.relation) || 'commerce-entry',
    evidence: [
      'pc-shopping-connect',
      normalizeKeyword(item?.title || item?.cleanTitle),
      normalizeKeyword(item?.writeRecommendation),
      ...(Array.isArray(item?.opportunityReasons) ? item.opportunityReasons : []),
    ].filter(Boolean),
    isMeasured: searchVolume !== null || documentCount !== null,
    shoppingProductPick: buildShoppingProductPick(seed, item, fallbackKeyword),
  };
}

function metricFromShoppingDiscoverySeed(seed: any): MobileKeywordMetric | null {
  const keyword = normalizeKeyword(seed?.keyword);
  if (!keyword) return null;
  const pcSearchVolume = finiteNumber(seed?.pcSearchVolume);
  const mobileSearchVolume = finiteNumber(seed?.mobileSearchVolume);
  const totalSearchVolume = finiteNumber(seed?.searchVolume);
  const documentCount = finiteNumber(seed?.documentCount);
  if (pcSearchVolume === null || mobileSearchVolume === null || totalSearchVolume === null || documentCount === null) {
    return null;
  }
  const goldenRatio = finiteNumber(seed?.goldenRatio)
    ?? (totalSearchVolume !== null && documentCount !== null && documentCount > 0
      ? Number((totalSearchVolume / documentCount).toFixed(2))
      : null);
  return {
    keyword,
    grade: measuredGrade('B', totalSearchVolume, documentCount, goldenRatio),
    score: finiteNumber(seed?.priorityScore) ?? 60,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount,
    goldenRatio,
    cpc: null,
    category: normalizeKeyword(seed?.category) || 'shopping',
    source: 'pc-shopping-verified-discovery',
    intent: 'commerce-entry',
    evidence: [
      'pc-shopping-verified-discovery',
      normalizeKeyword(seed?.reason),
    ].filter(Boolean),
    isMeasured: pcSearchVolume !== null && mobileSearchVolume !== null && totalSearchVolume !== null && documentCount !== null,
    searchVolumeSource: pcSearchVolume !== null || mobileSearchVolume !== null ? 'searchad' : undefined,
    searchVolumeConfidence: pcSearchVolume !== null || mobileSearchVolume !== null ? 'high' : undefined,
    isSearchVolumeEstimated: false,
    documentCountSource: documentCount !== null ? 'naver-api' : undefined,
    documentCountConfidence: documentCount !== null ? 'high' : undefined,
    isDocumentCountEstimated: false,
  };
}

const SHOPPING_RELEVANCE_STOP_TOKENS = new Set([
  '추천',
  '후기',
  '가격',
  '비교',
  '순위',
  '최저가',
  '구매',
  '리뷰',
  '2026',
  '2025',
]);

function shoppingRelevanceTokens(value: unknown): string[] {
  return normalizeKeyword(value)
    .toLowerCase()
    .replace(/[^\dA-Za-z가-힣\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !SHOPPING_RELEVANCE_STOP_TOKENS.has(token));
}

function isShoppingItemRelevantToDiscovery(item: any, fallbackKeyword: string): boolean {
  const queryTokens = shoppingRelevanceTokens(item?.discoveryQuery || fallbackKeyword);
  if (queryTokens.length === 0) return true;
  const itemText = [
    item?.title,
    item?.cleanTitle,
    item?.simplifiedTitle,
    item?.brand,
    item?.maker,
    item?.category1,
    item?.category2,
    item?.category3,
    item?.category4,
  ].map(normalizeKeyword).join(' ').toLowerCase();
  if (!itemText) return false;
  return queryTokens.some((token) => itemText.includes(token));
}

function shoppingItemKeywordMatchScore(keyword: string, item: any, fallbackKeyword: string): number {
  const key = compactKeyword(keyword);
  if (!key) return 0;
  let score = 0;
  let strongSignals = 0;
  const compactValue = (value: unknown) => compactKeyword(shoppingText(value));
  const brand = compactValue(item?.brand || item?.maker);
  const categories = [
    item?.category4,
    item?.category3,
    item?.category2,
    item?.category1,
  ].map(compactValue).filter((value) => value.length >= 2);
  const discovery = compactValue(item?.discoveryQuery || fallbackKeyword);
  const productTokens = shoppingRelevanceTokens([
    item?.cleanTitle,
    item?.simplifiedTitle,
    item?.title,
  ].map(shoppingText).join(' '));

  if (brand && key.includes(brand)) {
    score += 6;
    strongSignals += 2;
  }
  for (const category of categories) {
    if (key.includes(category)) {
      score += 5;
      strongSignals += 2;
      break;
    }
  }
  if (discovery && (key.includes(discovery) || discovery.includes(key))) score += 3;
  const tokenHits = productTokens
    .filter((token) => !/^(?:스마트|무선|자동|추천|가격|후기|비교|순위|가성비|구매처)$/.test(token))
    .filter((token) => key.includes(compactKeyword(token))).length;
  if (tokenHits >= 2) strongSignals += 1;
  score += Math.min(4, tokenHits);
  if (isShoppingItemRelevantToDiscovery(item, fallbackKeyword)) score += 1;
  if (strongSignals === 0) return 0;
  return score;
}

function attachShoppingProductPicksToMetrics(
  metrics: MobileKeywordMetric[],
  shoppingItems: any[],
  fallbackKeyword: string,
): MobileKeywordMetric[] {
  if (!metrics.length || !shoppingItems.length) return metrics;
  const candidates = shoppingItems.slice(0, 120);
  return metrics.map((metric) => {
    if (metric.shoppingProductPick) return metric;
    let bestItem: any | undefined;
    let bestScore = 0;
    for (const item of candidates) {
      const score = shoppingItemKeywordMatchScore(metric.keyword, item, fallbackKeyword);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
    if (!bestItem || bestScore < 5) return metric;
    const shoppingProductPick = buildShoppingProductPick({
      keyword: metric.keyword,
      relation: 'category',
      reason: '실측 쇼핑 키워드와 상품 후보 매칭',
    }, bestItem, fallbackKeyword);
    if (!shoppingProductPick) return metric;
    return {
      ...metric,
      shoppingProductPick,
      evidence: uniqueKeywords([
        ...(Array.isArray(metric.evidence) ? metric.evidence : []),
        'shopping-product-pick-attached-from-live-item',
        shoppingText(bestItem.discoveryQuery || fallbackKeyword),
      ], 10),
    };
  });
}

function shoppingKeywordVariants(keyword: string): string[] {
  const clean = normalizeKeyword(keyword);
  if (!clean) return [];
  const variants: string[] = [];
  const slashMatch = clean.match(/([가-힣A-Za-z0-9]+)\/([가-힣A-Za-z0-9]+)/);
  if (slashMatch) {
    variants.push(clean.replace(slashMatch[0], slashMatch[1]));
    variants.push(clean.replace(slashMatch[0], slashMatch[2]));
    if (/머신/.test(slashMatch[1]) && /메이커/.test(slashMatch[2])) {
      variants.push(clean.replace(slashMatch[0], '커피머신'));
      variants.push(clean.replace(slashMatch[0], '커피메이커'));
    }
  } else {
    variants.push(clean);
  }
  const stripped = variants.flatMap((value) => [
    value,
    value.replace(/\s+[A-Z0-9]{2,}(?:-[A-Z0-9]+)+/gi, '').trim(),
  ]);
  return uniqueKeywords(stripped, 8);
}

function metricFromYoutubeKeyword(keyword: any, cross: any | undefined): MobileKeywordMetric {
  const score = finiteNumber(keyword?.totalScore)
    ?? finiteNumber(keyword?.trendScore)
    ?? finiteNumber(cross?.urgencyScore)
    ?? 50;
  const pcSearchVolume = finiteNumber(cross?.pcSearchVolume);
  const mobileSearchVolume = finiteNumber(cross?.mobileSearchVolume);
  const totalSearchVolume = finiteNumber(cross?.totalSearchVolume)
    ?? ((pcSearchVolume !== null || mobileSearchVolume !== null) ? (pcSearchVolume || 0) + (mobileSearchVolume || 0) : null);
  const documentCount = finiteNumber(cross?.documentCount);
  return {
    keyword: normalizeKeyword(keyword?.keyword || cross?.keyword),
    grade: normalizeGrade(keyword?.grade, score),
    score,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(cross?.ratio),
    cpc: null,
    category: 'youtube',
    source: 'pc-youtube-golden-keywords',
    intent: 'youtube-trend-to-blog',
    evidence: [
      'pc-youtube-golden-keywords',
      normalizeKeyword(keyword?.reason),
      normalizeKeyword(cross?.verdict),
      ...(Array.isArray(cross?.warnings) ? cross.warnings : []),
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null || documentCount !== null,
  };
}

function resultFromMetrics(
  keywords: MobileKeywordMetric[],
  startedAt: number,
  parityMode: MobileKeywordResult['summary']['parityMode'] = 'pc-engine',
): MobileKeywordResult {
  const decidedKeywords = attachKeywordAiJudges(attachPublishDecisions(keywords), {
    downgradeExcluded: false,
  });
  return {
    keywords: decidedKeywords,
    summary: {
      total: decidedKeywords.length,
      sss: decidedKeywords.filter((item) => item.grade === 'SSS').length,
      measured: decidedKeywords.filter((item) => item.isMeasured).length,
      aiJudged: decidedKeywords.filter((item) => item.aiJudge).length,
      excludedByAiJudge: decidedKeywords.filter((item) => item.aiJudge?.verdict === 'exclude').length,
      publishReady: decidedKeywords.filter((item) => item.aiJudge?.verdict === 'publish').length,
      elapsedMs: Date.now() - startedAt,
      fromCache: false,
      parityMode,
    },
  };
}

function withKeywordResultSummary(
  result: MobileKeywordResult,
  keywords: MobileKeywordMetric[],
): MobileKeywordResult {
  return {
    ...result,
    keywords,
    summary: {
      ...result.summary,
      total: keywords.length,
      sss: keywords.filter((item) => item.grade === 'SSS').length,
      measured: keywords.filter((item) => item.isMeasured).length,
      aiJudged: keywords.filter((item) => item.aiJudge).length,
      excludedByAiJudge: keywords.filter((item) => item.aiJudge?.verdict === 'exclude').length,
      publishReady: keywords.filter((item) => item.aiJudge?.verdict === 'publish').length,
    },
  };
}

const AGENT_QUALITY_PRODUCTS = new Set<MobileKeywordProduct>([
  'golden-discovery',
  'pro-traffic-hunter',
  'keyword-analysis',
  'mindmap-expansion',
  'kin-hidden-honey',
  'shopping-connect',
  'youtube-golden',
  'naver-mate-hunter',
]);

const AGENT_CROSS_DOMAIN_GROUPS: readonly RegExp[] = [
  /(근로장려금|자녀장려금|최저임금|주휴수당|청년인턴|지원금|수당|정책|복지|지급일|신청).*(감독|축구|월드컵|KBO|올스타전|선수|대표팀|홍명보|이강인|김민재|이재성)/u,
  /(감독|축구|월드컵|KBO|올스타전|선수|대표팀|홍명보|이강인|김민재|이재성).*(근로장려금|자녀장려금|최저임금|주휴수당|청년인턴|지원금|수당|정책|복지|지급일|신청)/u,
  /(렌터카|숙소|항공권|여행|맛집|카드사용처|문화누리카드).*(감독|축구|월드컵|KBO|선수|대표팀|홍명보)/u,
  /(감독|축구|월드컵|KBO|선수|대표팀|홍명보).*(렌터카|숙소|항공권|여행|맛집|카드사용처|문화누리카드)/u,
  /(청소기|로봇청소기|에어컨|노트북|아이폰|갤럭시|가습기|제습기|냉장고|세탁기).*(지급일|지원금|정책|근로장려금|주휴수당|최저임금|정례대화)/u,
  /(지급일|지원금|정책|근로장려금|주휴수당|최저임금|정례대화).*(청소기|로봇청소기|에어컨|노트북|아이폰|갤럭시|가습기|제습기|냉장고|세탁기)/u,
];

const AGENT_SHOPPING_TOPIC_RE = /(가격|최저가|구매|구매처|재고|할인|쿠폰|추천|순위|후기|비교|리뷰|스펙|청소기|로봇청소기|에어컨|노트북|아이폰|갤럭시|가습기|제습기|냉장고|세탁기|기저귀|카시트|영양제|유산균|화장품|선크림|캠핑)/u;
const AGENT_TRAVEL_BOOKING_RE = /(렌터카|렌트카|숙소|호텔|펜션|항공권|여행|예약|입장권|입장료|운영시간|주차|티켓|축제|문화누리카드\s*사용처)/u;
const AGENT_NEED_MODIFIER_RE = /(신청|대상|자격|조건|지급일|금액|조회|계산|계산기|일정|예매|예약|방법|후기|비교|사용처|잔액|기간|마감|발표|후보|전망|이유|논란|전말|선임|교체|중계|라인업|티켓|입장료|운영시간|주차|보험|취소|픽업|가격비교|서류|제외|주의사항)/u;
const AGENT_HIDDEN_MONETIZABLE_NEED_RE = /(잔액조회|온라인\s*사용처|오프라인\s*사용처|지역별\s*사용처|가맹점|본인충전금|제외대상|누락|이의신청|입금일|환급일|지급일|마감일|신청기간|대상자\s*확인|서류|준비물|오류|안됨|가능\s*여부|취소\s*수수료|완전자차|자차보험|보험\s*비교|공항\s*픽업|입장료|운영시간|주차|가격비교|최저가|주의사항|실수|체크리스트|차이|비교|후기|사용처\s*조회|다음\s*감독|감독\s*후보|선임\s*과정|협회\s*비리|전말|변수|경우의\s*수|반응\s*정리|후속\s*일정)/u;
const AGENT_BEGINNER_TOPIC_RE = /(문화누리카드|근로장려금|자녀장려금|주휴수당|최저임금|청년|지원금|환급|세금|정책|복지|보험|카드|대출|청약|렌터카|렌트카|숙소|호텔|항공권|여행|제주|가전|청소기|에어컨|제습기|노트북|유튜브|쇼츠|지식인|네이버|가맹점|사용처|감독|축구협회|대표팀|월드컵|KBO|야구)/u;
const AGENT_NOISE_CHAIN_RE = /(방법주의사항정리|가격후기추천|지급일금액대상|신청대상조건|금액조회신청|대상자격지급일|정례대화(지급일|금액|대상|신청|수당)|프로필|인물프로필|보도참고자료|보도자료|마감결과|고유가피해지원금신청지급마감결과)/u;

function metricTextForAgent(metric: MobileKeywordMetric): string {
  return [
    metric.keyword,
    metric.category,
    metric.intent,
    metric.source,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].map((item) => normalizeKeyword(item)).filter(Boolean).join(' ');
}

function isAgentBeginnerMonetizableNeed(metric: MobileKeywordMetric, product: MobileKeywordProduct): boolean {
  const keyword = normalizeKeyword(metric.keyword);
  if (!keyword || AGENT_NOISE_CHAIN_RE.test(compactKeyword(keyword))) return false;
  if (isUltimateLowValueLookupKeyword(keyword)) return false;
  const text = metricTextForAgent(metric);
  const hasNeed = AGENT_NEED_MODIFIER_RE.test(keyword) || AGENT_HIDDEN_MONETIZABLE_NEED_RE.test(keyword);
  const hiddenLongtail = AGENT_HIDDEN_MONETIZABLE_NEED_RE.test(keyword)
    || (hasNeed && keyword.replace(/\s+/g, '').length >= 7);
  const topic = AGENT_BEGINNER_TOPIC_RE.test(text)
    || AGENT_SHOPPING_TOPIC_RE.test(text)
    || AGENT_TRAVEL_BOOKING_RE.test(text);
  const shoppingAllowed = product === 'shopping-connect'
    || product === 'youtube-golden'
    || !AGENT_SHOPPING_TOPIC_RE.test(text)
    || AGENT_TRAVEL_BOOKING_RE.test(text);
  return hasNeed && hiddenLongtail && topic && shoppingAllowed;
}

function isAgentExactRequestedKeyword(
  metric: MobileKeywordMetric,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
): boolean {
  if (product !== 'keyword-analysis') return false;
  const keyword = normalizeKeyword((params as Partial<KeywordAnalysisMobileParams>).keyword);
  return !!keyword && compactKeyword(metric.keyword) === compactKeyword(keyword);
}

function agentRejectReasonForMetric(
  metric: MobileKeywordMetric,
  product: MobileKeywordProduct,
): string | null {
  const keyword = normalizeKeyword(metric.keyword);
  const compact = compactKeyword(keyword);
  if (!compact) return 'empty-keyword';
  if (metric.aiJudge?.verdict === 'exclude') return metric.aiJudge.rejectReason || 'ai-judge-excluded';
  if (metric.publishDecision?.verdict === 'exclude') return 'publish-decision-excluded';
  if (isUltimateLowValueLookupKeyword(keyword)) return 'low-value-lookup';
  if (/(보도참고자료|보도자료|브리핑|해명자료|설명자료|첨부파일|공고문|입장문|마감\s*결과|결과\s*\d{1,2}\.\d{1,2})/u.test(keyword)
    || /고유가피해지원금신청지급마감결과/u.test(compact)) {
    return 'article-title-not-keyword';
  }
  if (AGENT_NOISE_CHAIN_RE.test(compact)) return 'template-chain-noise';
  const text = metricTextForAgent(metric);
  if (AGENT_CROSS_DOMAIN_GROUPS.some((pattern) => pattern.test(text) || pattern.test(compact))) {
    return 'cross-domain-intent-collision';
  }
  const shoppingTopic = AGENT_SHOPPING_TOPIC_RE.test(text);
  const travelBooking = AGENT_TRAVEL_BOOKING_RE.test(text);
  if (shoppingTopic && !travelBooking && product !== 'shopping-connect' && product !== 'youtube-golden') {
    return 'shopping-topic-belongs-to-shopping-connect';
  }
  const strictHunterProduct = product === 'golden-discovery'
    || product === 'pro-traffic-hunter'
    || product === 'naver-mate-hunter'
    || product === 'kin-hidden-honey'
    || product === 'shopping-connect';
  if (strictHunterProduct && !isAgentBeginnerMonetizableNeed(metric, product)) {
    return 'missing-beginner-monetizable-hidden-need';
  }
  const total = finiteNumber(metric.totalSearchVolume);
  const docs = finiteNumber(metric.documentCount);
  const ratio = finiteNumber(metric.goldenRatio)
    ?? (total !== null && docs !== null && docs > 0 ? total / docs : null);
  if (total !== null && docs !== null && total > 0 && docs > total * 20 && (ratio === null || ratio < 1)) {
    return 'document-count-overwhelms-demand';
  }
  return null;
}

function agentQualityScore(metric: MobileKeywordMetric, product: MobileKeywordProduct): number {
  const total = finiteNumber(metric.totalSearchVolume) ?? 0;
  const docs = finiteNumber(metric.documentCount) ?? 0;
  const ratio = finiteNumber(metric.goldenRatio) ?? 0;
  const judgeScore = finiteNumber(metric.aiJudge?.score) ?? 0;
  const decisionScore = finiteNumber(metric.publishDecision?.score) ?? 0;
  const measuredBoost = isFullyMeasuredKeyword(metric) ? 500000 : metric.isMeasured ? 150000 : 0;
  const sssBoost = metric.grade === 'SSS' ? 200000 : metric.grade === 'SS' ? 90000 : metric.grade === 'S' ? 30000 : 0;
  const intentBoost = AGENT_NEED_MODIFIER_RE.test(metric.keyword) ? 35000 : 0;
  const hunterCharterBoost = isAgentBeginnerMonetizableNeed(metric, product) ? 140000 : -45000;
  const publishBoost = metric.aiJudge?.verdict === 'publish' ? 80000 : metric.aiJudge?.verdict === 'conditional' ? 20000 : 0;
  const productBoost = product === 'shopping-connect' && AGENT_SHOPPING_TOPIC_RE.test(metricTextForAgent(metric)) ? 25000 : 0;
  const redOceanPenalty = total > 0 && docs > total * 12 ? Math.min(160000, docs / 2) : 0;
  return measuredBoost
    + sssBoost
    + publishBoost
    + productBoost
    + intentBoost
    + hunterCharterBoost
    + judgeScore * 1200
    + decisionScore * 650
    + Math.min(500, ratio) * 700
    + Math.min(100000, total) / 2
    - Math.min(200000, docs) / 20
    - redOceanPenalty;
}

function targetCountFromAgentParams(params: MobileAgentAwareParams, current: number): number {
  const candidates = [
    (params as Partial<GoldenDiscoveryMobileParams>).targetCount,
    (params as Partial<ProTrafficMobileParams>).targetCount,
    (params as Partial<MindmapExpansionMobileParams>).targetCount,
    (params as Partial<KinHiddenHoneyMobileParams>).targetCount,
    (params as Partial<NaverMateMobileParams>).targetCount,
    (params as Partial<ShoppingConnectMobileParams>).targetCount,
    (params as Partial<YoutubeGoldenMobileParams>).maxResults,
    (params as Partial<KeywordAnalysisMobileParams>).maxRelatedCount,
  ];
  const explicit = candidates.map((value) => finiteNumber(value)).find((value): value is number => value !== null && value > 0);
  return explicit ? Math.max(current, Math.floor(explicit) + (params && 'keyword' in params ? 1 : 0)) : current;
}

type AgentInsightDomain =
  | 'policy'
  | 'travel'
  | 'shopping'
  | 'sports'
  | 'entertainment'
  | 'youtube'
  | 'kin'
  | 'local'
  | 'general'
  | 'unclear';

function agentInsightObjects(metric: MobileKeywordMetric): Record<string, unknown>[] {
  return [
    metric.agentInsight,
    (metric as any).aiInsight,
    (metric as any).aiInference,
    (metric as any).keywordInsight,
    (metric as any).intentInsight,
    metric.aiJudge,
    metric.publishDecision,
  ].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value));
}

function agentInsightString(metric: MobileKeywordMetric, keys: string[]): string {
  for (const object of agentInsightObjects(metric)) {
    for (const key of keys) {
      const value = object[key];
      const clean = normalizeKeyword(value);
      if (clean) return clean;
    }
  }
  return '';
}

function agentInsightStringList(metric: MobileKeywordMetric, keys: string[], limit: number): string[] {
  const values: string[] = [];
  for (const object of agentInsightObjects(metric)) {
    for (const key of keys) {
      const value = object[key];
      if (Array.isArray(value)) {
        values.push(...value.map((item) => normalizeKeyword(item)).filter(Boolean));
      } else {
        const clean = normalizeKeyword(value);
        if (clean && /[,|]/.test(clean)) {
          values.push(...clean.split(/[|,]/).map((item) => normalizeKeyword(item)).filter(Boolean));
        } else if (clean) {
          values.push(clean);
        }
      }
    }
  }
  return uniqueKeywords(values, limit);
}

function agentInsightSubject(metric: MobileKeywordMetric): string {
  const explicit = agentInsightString(metric, ['subject', 'entity', 'topic', 'coreKeyword', 'rootKeyword']);
  if (explicit) return explicit;
  const stripped = stripKnownIntent(metric.keyword);
  return normalizeKeyword(stripped) || normalizeKeyword(metric.keyword);
}

function agentInsightDomain(metric: MobileKeywordMetric, product: MobileKeywordProduct): AgentInsightDomain {
  const keyword = normalizeKeyword(metric.keyword);
  const text = metricTextForAgent(metric);
  const compact = compactKeyword(`${keyword} ${text}`);
  if (!keyword || AGENT_NOISE_CHAIN_RE.test(compact)) return 'unclear';
  if (/정례대화/.test(keyword) && /(지급일|신청|금액|대상|수당|계산)/.test(keyword)) return 'unclear';
  if (product === 'shopping-connect' || AGENT_SHOPPING_TOPIC_RE.test(text)) return 'shopping';
  if (product === 'youtube-golden' || /(유튜브|쇼츠|영상|채널|조회수)/u.test(text)) return 'youtube';
  if (product === 'kin-hidden-honey' || /(지식인|질문|답변|Q&A|qna|kin)/i.test(text)) return 'kin';
  if (AGENT_TRAVEL_BOOKING_RE.test(text) || /(제주|렌터카|렌트카|숙소|호텔|입장료|여행|축제|바다|하늘길|관광)/u.test(text)) return 'travel';
  if (/(감독|축구|월드컵|KBO|야구|대표팀|선수|라인업|경기|중계|협회)/u.test(text)) return 'sports';
  if (/(드라마|예능|영화|출연진|몇부작|결말|방송|연예|가수|배우|공연)/u.test(text)) return 'entertainment';
  if (/(지원금|장려금|수당|급여|정책|복지|신청|지급일|대상|자격|서류|환급|세금|문화누리카드|가맹점|사용처)/u.test(text)) return 'policy';
  if (/(병원|맛집|지역|주소|주차|예약|운영시간|위치|근처)/u.test(text)) return 'local';
  return 'general';
}

function agentInsightMeasuredContext(metric: MobileKeywordMetric): string {
  const total = finiteNumber(metric.totalSearchVolume);
  const pc = finiteNumber(metric.pcSearchVolume);
  const mobile = finiteNumber(metric.mobileSearchVolume);
  const docs = finiteNumber(metric.documentCount);
  const ratio = finiteNumber(metric.goldenRatio);
  const parts: string[] = [];
  if (total !== null && total > 0) parts.push(`월 검색량 ${total.toLocaleString('ko-KR')}`);
  if (pc !== null && mobile !== null && pc + mobile > 0) parts.push(`PC ${pc.toLocaleString('ko-KR')} / 모바일 ${mobile.toLocaleString('ko-KR')}`);
  if (docs !== null && docs > 0) parts.push(`문서수 ${docs.toLocaleString('ko-KR')}`);
  if (ratio !== null && ratio > 0) parts.push(`수요/문서 비율 ${Number(ratio.toFixed(2)).toLocaleString('ko-KR')}`);
  return parts.length ? `현재 실측은 ${parts.join(', ')}입니다.` : '아직 PC/모바일·문서수 실측이 모두 채워지지 않아 측정값을 먼저 확인해야 합니다.';
}

function agentInsightExpansionCandidates(
  metric: MobileKeywordMetric,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  domain: AgentInsightDomain,
  limit: number,
): string[] {
  const keyword = normalizeKeyword(metric.keyword);
  const subject = agentInsightSubject(metric);
  const contextKeywords = (params as { contextKeywords?: MobileKeywordContextCandidate[] }).contextKeywords;
  const provided = agentInsightStringList(metric, [
    'autocompleteKeywords',
    'autocomplete',
    'relatedKeywords',
    'expandedKeywords',
    'expansionKeywords',
    'mindmapKeywords',
    'followUpKeywords',
    'questionKeywords',
    'clusterKeywords',
    'branches',
    'suggestions',
  ], Math.max(limit * 2, 20));
  const context = contextExpansionCandidates(keyword, contextKeywords, Math.max(limit * 2, 20)).map((item) => item.keyword);
  const semantic = buildMindmapSemanticBridgeRoots(subject || keyword, contextKeywords, Math.max(limit, 16));
  const measured = [
    ...buildNaverMateMeasuredQueryRoots(subject || keyword, Math.max(limit, 16)),
    ...buildSafeMeasuredIntentRoots(subject || keyword, Math.max(limit, 16)),
    ...buildMindmapMeasuredQueryRoots(subject || keyword, Math.min(Math.max(limit, 8), 16)),
  ];
  const domainSeeds: string[] = [];
  if (domain === 'policy') {
    domainSeeds.push(
      appendMindmapBranchSuffix(subject, '대상'),
      appendMindmapBranchSuffix(subject, '신청방법'),
      appendMindmapBranchSuffix(subject, '지급일'),
      appendMindmapBranchSuffix(subject, '제외대상'),
      appendMindmapBranchSuffix(subject, '필요서류'),
      appendMindmapBranchSuffix(subject, '이의신청'),
    );
  } else if (domain === 'travel') {
    domainSeeds.push(
      appendMindmapBranchSuffix(subject, '입장료'),
      appendMindmapBranchSuffix(subject, '예약'),
      appendMindmapBranchSuffix(subject, '주차'),
      appendMindmapBranchSuffix(subject, '운영시간'),
      appendMindmapBranchSuffix(subject, '후기'),
      appendMindmapBranchSuffix(subject, '근처 맛집'),
    );
  } else if (domain === 'shopping') {
    domainSeeds.push(
      appendMindmapBranchSuffix(subject, '후기'),
      appendMindmapBranchSuffix(subject, '가격비교'),
      appendMindmapBranchSuffix(subject, '단점'),
      appendMindmapBranchSuffix(subject, '대체품'),
      appendMindmapBranchSuffix(subject, '구매 전 확인'),
      appendMindmapBranchSuffix(subject, '추천'),
    );
  } else if (domain === 'sports') {
    domainSeeds.push(
      appendMindmapBranchSuffix(subject, '다음 일정'),
      appendMindmapBranchSuffix(subject, '후보'),
      appendMindmapBranchSuffix(subject, '선임 과정'),
      appendMindmapBranchSuffix(subject, '논란 정리'),
      appendMindmapBranchSuffix(subject, '반응'),
      appendMindmapBranchSuffix(subject, '경우의 수'),
    );
  } else if (domain === 'kin') {
    domainSeeds.push(
      appendMindmapBranchSuffix(subject, '해결방법'),
      appendMindmapBranchSuffix(subject, '원인'),
      appendMindmapBranchSuffix(subject, '안됨'),
      appendMindmapBranchSuffix(subject, '차이'),
      appendMindmapBranchSuffix(subject, '비용'),
      appendMindmapBranchSuffix(subject, '주의사항'),
    );
  }
  return uniqueKeywords([
    ...provided,
    ...context,
    ...semantic,
    ...measured,
    ...domainSeeds,
  ], Math.max(limit * 3, 24))
    .filter((item) => {
      const clean = normalizeKeyword(item);
      if (!clean || compactKeyword(clean) === compactKeyword(keyword)) return false;
      if (hasDuplicatedKnownIntentChain(keyword, clean)) return false;
      if (clean.length > 46) return false;
      if (AGENT_NOISE_CHAIN_RE.test(compactKeyword(clean))) return false;
      return isLikelyMeasuredSearchQuery(clean) || clean.length <= 22;
    })
    .slice(0, limit);
}

function agentInsightSearchReason(
  metric: MobileKeywordMetric,
  domain: AgentInsightDomain,
  subject: string,
): string {
  const provided = agentInsightString(metric, [
    'searchVolumeReason',
    'searchReason',
    'whyTrending',
    'demandReason',
    'volumeReason',
    'meaning',
    'reason',
  ]);
  if (provided) return provided;
  const context = agentInsightMeasuredContext(metric);
  if (domain === 'unclear') {
    return `${subject}은 서로 다른 의도가 섞인 조합일 수 있어 소스 원문과 자동완성 응답을 먼저 재확인해야 합니다. ${context}`;
  }
  if (domain === 'policy') {
    return `${subject}은 대상·금액·지급일·신청 방법을 놓치면 손해가 생기는 확인형 수요라 검색이 붙습니다. ${context}`;
  }
  if (domain === 'travel') {
    return `${subject}은 방문 전 비용·예약·주차·운영시간·후기 같은 실패 회피 정보가 필요해지는 시점에 검색량이 올라갑니다. ${context}`;
  }
  if (domain === 'shopping') {
    return `${subject}은 구매 직전 가격·후기·단점·대체품을 비교하려는 전환형 수요가 생기는 키워드입니다. ${context}`;
  }
  if (domain === 'sports') {
    return `${subject}은 경기 결과 이후 다음 일정, 후보, 책임 소재, 반응을 확인하려는 후속 검색 수요가 붙는 키워드입니다. ${context}`;
  }
  if (domain === 'entertainment') {
    return `${subject}은 방송·출연·결말·공개 일정처럼 바로 확인하고 싶은 정보형 수요가 짧은 시간에 몰리는 키워드입니다. ${context}`;
  }
  if (domain === 'youtube') {
    return `${subject}은 급상승 영상의 원인과 관련 검색어를 네이버 수요로 다시 검증할 수 있는 키워드입니다. ${context}`;
  }
  if (domain === 'kin') {
    return `${subject}은 사용자가 지금 막 막힌 문제를 해결하려는 질문형 수요라 답변형 글로 전환하기 좋습니다. ${context}`;
  }
  if (domain === 'local') {
    return `${subject}은 위치·가격·예약·운영시간처럼 실제 행동 직전 확인이 필요한 지역형 수요에서 검색량이 생깁니다. ${context}`;
  }
  return `${subject}은 검색자가 지금 확인해야 할 기준이나 다음 행동을 찾는 정보형 수요가 있는 키워드입니다. ${context}`;
}

function agentInsightCombinationIntent(
  metric: MobileKeywordMetric,
  domain: AgentInsightDomain,
  subject: string,
  expansions: string[],
): string {
  const provided = agentInsightString(metric, [
    'combinationIntent',
    'usageIntent',
    'publishingAngle',
    'action',
    'nextAction',
    'writeRecommendation',
  ]);
  if (provided) return provided;
  const next = expansions.slice(0, 4).join(', ');
  if (domain === 'unclear') {
    return '바로 발행하지 말고 원 키워드가 어떤 사건·상품·정책을 가리키는지 먼저 분리한 뒤, 실측되는 확장어만 남기세요.';
  }
  if (domain === 'shopping') {
    return `${subject} 단독 소개보다 가격비교·후기·단점·대체품을 묶어 구매 판단표로 쓰세요${next ? `: ${next}` : ''}.`;
  }
  if (domain === 'travel') {
    return `${subject}의 입장료·예약·주차·운영시간을 한 화면에서 비교하고, 방문 전 체크리스트형 제목으로 확장하세요${next ? `: ${next}` : ''}.`;
  }
  if (domain === 'policy') {
    return `${subject}의 대상·지급일·신청방법·제외대상을 표로 먼저 정리하고 최신 공식 링크를 붙이면 체류형 글이 됩니다${next ? `: ${next}` : ''}.`;
  }
  if (domain === 'sports') {
    return `${subject}의 원인·다음 후보·반응·일정 변수를 분리해 후속 검색으로 이어지는 클러스터를 만드세요${next ? `: ${next}` : ''}.`;
  }
  return `${subject}에서 검색자가 다음으로 확인할 질문을 자동완성 후보와 함께 묶어 답변형 소제목으로 확장하세요${next ? `: ${next}` : ''}.`;
}

function buildMetricAgentInsight(
  metric: MobileKeywordMetric,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  agent?: MobileAgentAssistContext,
): MobileKeywordAgentInsight {
  const domain = agentInsightDomain(metric, product);
  const subject = agentInsightSubject(metric);
  const expansions = agentInsightExpansionCandidates(metric, params, product, domain, 12);
  const label = agentInsightString(metric, ['label', 'intentLabel', 'routeLabel'])
    || (domain === 'policy' ? '정책/신청형 수요'
      : domain === 'travel' ? '여행/방문 전 확인'
        : domain === 'shopping' ? '구매 전환형 수요'
          : domain === 'sports' ? '후속 이슈형 수요'
            : domain === 'kin' ? '질문 해결형 수요'
              : domain === 'unclear' ? '의도 재확인 필요'
                : '검색 의도 분석');
  const route = agentInsightString(metric, ['route', 'monetizationRoute'])
    || (domain === 'shopping' ? 'shopping-connect'
      : domain === 'kin' ? 'kin-answer'
        : domain === 'youtube' ? 'youtube-to-blog'
          : 'blog-seo');
  return {
    label,
    route,
    subject,
    searchVolumeReason: agentInsightSearchReason(metric, domain, subject),
    combinationIntent: agentInsightCombinationIntent(metric, domain, subject, expansions),
    autocompleteKeywords: expansions.slice(0, 8),
    relatedKeywords: uniqueKeywords([
      ...agentInsightStringList(metric, ['relatedKeywords', 'clusterKeywords', 'followUpKeywords'], 12),
      ...expansions.slice(0, 8),
    ], 12),
    expandedKeywords: expansions,
    sourceSummary: agentInsightString(metric, ['sourceSummary', 'source', 'evidenceSummary'])
      || `${metric.source || product} · ${metric.intent || 'keyword-intent'} · ${metric.isMeasured ? '실측 포함' : '측정 필요'}`,
    warning: domain === 'unclear' ? '문맥 충돌 가능성이 있어 발행 전 원 소스 확인이 필요합니다.' : undefined,
    generatedBy: 'server-semantic-agent',
  };
}

function attachAgentInferredInsights(
  keywords: MobileKeywordMetric[],
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  agent?: MobileAgentAssistContext,
): MobileKeywordMetric[] {
  if (!AGENT_QUALITY_PRODUCTS.has(product)) return keywords;
  return keywords.map((metric) => ({
    ...metric,
    agentInsight: {
      ...(metric.agentInsight || {}),
      ...buildMetricAgentInsight(metric, params, product, agent),
    },
  }));
}

type ExternalAgentInsightItem = Partial<MobileKeywordAgentInsight> & {
  index?: number;
  keyword?: string;
  originalKeyword?: string;
};

type ExternalAgentProvider = 'anthropic' | 'openai';

type ExternalAgentInsightResponse = {
  provider: ExternalAgentProvider;
  items: ExternalAgentInsightItem[];
};

type ExternalAgentInsightSelection = {
  provider: ExternalAgentProvider;
  apiKey: string;
  keyOwner: 'user-local' | 'server-approved';
};

class ExternalAgentInsightCallError extends Error {
  constructor(
    readonly provider: ExternalAgentProvider,
    message: string,
  ) {
    super(message);
    this.name = 'ExternalAgentInsightCallError';
  }
}

function resolveExternalAgentInsightSelection(
  agent: MobileAgentAssistContext | undefined,
  env: Partial<EnvConfig>,
): ExternalAgentInsightSelection | null {
  if (
    !agent
    || agent.enabled === false
    || agent.includeAiInference !== true
    || agent.forceExternalInference !== true
    || agent.externalAi !== true
    || process.env['LEWORD_AGENT_EXTERNAL_INFERENCE'] === '0'
  ) return null;
  const keyOwner = agent.externalAiKeyOwner;
  if (keyOwner !== 'user-local' && keyOwner !== 'server-approved') return null;
  const allowedProviders = new Set(
    (agent.externalAiProviders || [])
      .map((provider) => normalizeKeyword(provider).toLowerCase())
      .filter((provider): provider is ExternalAgentProvider => (
        provider === 'anthropic' || provider === 'openai'
      )),
  );
  if (allowedProviders.size === 0) return null;
  const preferred = normalizeKeyword(agent.externalAiProvider).toLowerCase();
  const providerCandidates: ExternalAgentProvider[] = [];
  if (preferred === 'anthropic' || preferred === 'openai') providerCandidates.push(preferred);
  providerCandidates.push('anthropic', 'openai');
  const providerOrder = providerCandidates.filter((provider, index, values) => (
    values.indexOf(provider) === index && allowedProviders.has(provider)
  ));
  for (const provider of providerOrder) {
    // Use only the credential scope that the API boundary explicitly marked.
    // envValue() falls back to process.env, which would silently spend a
    // server-owned key even when the user supplied only the other provider.
    const apiKey = normalizeKeyword(provider === 'anthropic' ? env.anthropicApiKey : env.openaiApiKey);
    if (provider === 'anthropic' ? apiKey.startsWith('sk-ant-') : apiKey.startsWith('sk-')) {
      return { provider, apiKey, keyOwner };
    }
  }
  return null;
}

function externalAgentInsightList(value: unknown, limit: number): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n|]/)
      : [];
  return uniqueKeywords(raw.map((item) => normalizeKeyword(item)).filter(Boolean), limit)
    .filter((item) => item.length <= 48
      && !/[<>]/u.test(item)
      && !/AEO|GEO|SEO|제목보다|한 화면에서/i.test(item));
}

function extractJsonObject(text: string): Record<string, unknown> {
  const clean = text.trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(clean.slice(first, last + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 240);
      } catch {
        detail = '';
      }
      throw new Error(`${response.status} ${response.statusText}${detail ? ` ${detail}` : ''}`);
    }
    return await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function buildExternalAgentInsightPrompt(
  result: MobileKeywordResult,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  agent: MobileAgentAssistContext,
): string {
  const contextKeywords = normalizeStringList(
    ((params as { contextKeywords?: MobileKeywordContextCandidate[] }).contextKeywords || [])
      .map((item) => item.keyword),
    30,
  );
  const rows = result.keywords.map((metric, index) => ({
    index,
    keyword: metric.keyword,
    grade: metric.grade,
    category: metric.category,
    source: metric.source,
    intent: metric.intent,
    pcSearchVolume: metric.pcSearchVolume,
    mobileSearchVolume: metric.mobileSearchVolume,
    totalSearchVolume: metric.totalSearchVolume,
    documentCount: metric.documentCount,
    goldenRatio: metric.goldenRatio,
    evidence: normalizeStringList(metric.evidence, 8),
    currentInsight: metric.agentInsight || null,
  }));
  return JSON.stringify({
    role: 'LEWORD keyword research agent',
    product,
    featureId: agent.featureId || product,
    seedKeyword: agent.seedKeyword || null,
    mission: agent.mission || '실측 키워드를 사람이 이해할 수 있는 수익형 검색 의도와 확장키워드로 해석합니다.',
    mustFind: agent.mustFind || [],
    rejectIf: agent.rejectIf || [],
    researchChecklist: agent.researchChecklist || [],
    contextKeywords,
    rows,
    requiredOutput: {
      items: [{
        index: 0,
        keyword: '원본 키워드',
        subject: '키워드가 실제로 가리키는 대상/사건/상품/장소',
        combinationIntent: '블로거가 어떤 각도로 글을 써야 하는지. 제목 접미사 나열 금지',
        autocompleteKeywords: ['AI 생성·미실측 확장어 5~8개. 실제 자동완성이라고 주장하지 않음'],
        relatedKeywords: ['AI 생성·미실측 연관어 4~8개'],
        expandedKeywords: ['AI 생성·미실측 후속 의문/비교/방법/주의사항 키워드 6~12개'],
        label: '의도 라벨',
        route: 'blog-seo | shopping-connect | kin-answer | youtube-to-blog',
        warning: '억지 조합/광고 잠식/대형 헤드어면 경고. 정상 후보면 빈 문자열',
      }],
    },
    hardRules: [
      '반드시 JSON 객체만 반환합니다.',
      '검색량과 문서수 숫자는 절대 새로 만들지 말고 원본 row 값만 전제로 해석합니다.',
      '제공된 row/evidence 밖의 최신 뉴스, 일정, 정책 변경, 출처를 사실처럼 주장하지 않습니다.',
      '생성한 연관어는 모두 미실측 제안이며 실제 자동완성이나 실검색량이 확인됐다고 표현하지 않습니다.',
      '접미사만 붙인 기계식 확장어 금지. 실제 검색자가 이어서 칠 법한 짧은 검색어만 제시합니다.',
      '키워드 의미가 불명확하면 그대로 미화하지 말고 warning에 이유를 씁니다.',
      '정책/여행 편향을 만들지 말고 row의 실제 주제별로 다르게 판단합니다.',
      '쇼핑 제품 키워드는 shopping-connect route로 보내고, 일반 황금보드에서는 제품 판매 글로 억지 연결하지 않습니다.',
    ],
  });
}

function externalAgentErrorDetail(error: unknown): string {
  return normalizeKeyword(error instanceof Error ? error.message : String(error || 'unknown error')).slice(0, 180);
}

async function callAnthropicAgentInsightModel(
  anthropicKey: string,
  prompt: string,
): Promise<ExternalAgentInsightResponse> {
  const model = normalizeKeyword(process.env['LEWORD_AGENT_CLAUDE_MODEL']) || 'claude-sonnet-4-6';
  const data = await fetchJsonWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: EXTERNAL_AGENT_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      system: '너는 한국 검색 의도와 네이버 자동완성 흐름을 읽는 LEWORD 키워드 리서치 에이전트다. 근거 없는 수치 생성과 기계식 접미사를 금지한다.',
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 18000);
  const text = Array.isArray(data.content)
    ? data.content.map((part) => typeof part === 'object' && part ? normalizeKeyword((part as Record<string, unknown>).text) : '').join('\n')
    : '';
  const parsed = extractJsonObject(text);
  const items = Array.isArray(parsed.items) ? parsed.items as ExternalAgentInsightItem[] : [];
  if (!items.length) throw new Error('response contained no valid insight items');
  return { provider: 'anthropic', items };
}

async function callOpenAiAgentInsightModel(
  openAiKey: string,
  prompt: string,
): Promise<ExternalAgentInsightResponse> {
  const model = normalizeKeyword(process.env['LEWORD_AGENT_OPENAI_MODEL']) || 'gpt-4o-mini';
  const data = await fetchJsonWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: EXTERNAL_AGENT_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '너는 한국 검색 의도와 네이버 자동완성 흐름을 읽는 LEWORD 키워드 리서치 에이전트다. 근거 없는 수치 생성과 기계식 접미사를 금지한다.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  }, 18000);
  const content = normalizeKeyword(
    (((data.choices as unknown[]) || [])[0] as Record<string, unknown> | undefined)?.message
      && ((((data.choices as unknown[]) || [])[0] as Record<string, unknown>).message as Record<string, unknown>).content,
  );
  const parsed = extractJsonObject(content);
  const items = Array.isArray(parsed.items) ? parsed.items as ExternalAgentInsightItem[] : [];
  if (!items.length) throw new Error('response contained no valid insight items');
  return { provider: 'openai', items };
}

async function callExternalAgentInsightModel(
  selection: ExternalAgentInsightSelection,
  prompt: string,
): Promise<ExternalAgentInsightResponse> {
  if (selection.provider === 'anthropic') {
    try {
      return await callAnthropicAgentInsightModel(selection.apiKey, prompt);
    } catch (anthropicError) {
      throw new ExternalAgentInsightCallError(
        'anthropic',
        `anthropic failed: ${externalAgentErrorDetail(anthropicError)}`,
      );
    }
  }
  try {
    return await callOpenAiAgentInsightModel(selection.apiKey, prompt);
  } catch (openAiError) {
    throw new ExternalAgentInsightCallError('openai', `openai failed: ${externalAgentErrorDetail(openAiError)}`);
  }
}

const EXTERNAL_AGENT_METRIC_CLAIM_RE = /(?:검색량|문서수|경쟁비|황금비|CPC|PC|모바일)[^\n]{0,20}\d|\d[\d,.]*\s*(?:건|회|명|퍼센트|%)/iu;

function safeExternalAgentProse(value: unknown, maxLength: number): string {
  const clean = normalizeKeyword(value).replace(/[<>]/gu, '');
  if (!clean || EXTERNAL_AGENT_METRIC_CLAIM_RE.test(clean)) return '';
  return clean.slice(0, maxLength);
}

function mergeExternalAgentInsightItem(
  metric: MobileKeywordMetric,
  item: ExternalAgentInsightItem,
  provider: string,
): MobileKeywordMetric {
  const current = metric.agentInsight || {};
  const merged: MobileKeywordAgentInsight = { ...current };
  const stringKeys: Array<[keyof MobileKeywordAgentInsight, number]> = [
    ['label', 80],
    ['subject', 120],
    ['combinationIntent', 600],
  ];
  for (const [key, maxLength] of stringKeys) {
    const value = safeExternalAgentProse(item[key], maxLength);
    if (value) (merged as Record<string, unknown>)[key] = value;
  }
  const route = normalizeKeyword(item.route).toLowerCase();
  if (['blog-seo', 'shopping-connect', 'kin-answer', 'youtube-to-blog'].includes(route)) {
    merged.route = route;
  }
  // searchVolumeReason/sourceSummary remain server-composed from the trusted
  // structured metric. Model prose may explain intent but can never introduce
  // an unverified numeric/source claim into a measured result.
  const autocompleteKeywords = externalAgentInsightList(item.autocompleteKeywords, 10);
  const relatedKeywords = externalAgentInsightList(item.relatedKeywords, 12);
  const expandedKeywords = externalAgentInsightList(item.expandedKeywords, 14);
  if (autocompleteKeywords.length) merged.autocompleteKeywords = autocompleteKeywords;
  if (relatedKeywords.length) merged.relatedKeywords = relatedKeywords;
  if (expandedKeywords.length) merged.expandedKeywords = expandedKeywords;
  if (!merged.relatedKeywords?.length && autocompleteKeywords.length) merged.relatedKeywords = autocompleteKeywords.slice(0, 8);
  if (!merged.expandedKeywords?.length) {
    merged.expandedKeywords = uniqueKeywords([
      ...autocompleteKeywords,
      ...relatedKeywords,
      ...(current.expandedKeywords || []),
    ], 14);
  }
  const generatedUnmeasuredKeywords = autocompleteKeywords.length > 0
    || relatedKeywords.length > 0
    || expandedKeywords.length > 0;
  const warning = safeExternalAgentProse(item.warning, 400);
  const warningParts = uniqueKeywords([
    ...(current.warning ? [current.warning] : []),
    ...(warning ? [warning] : []),
    ...(generatedUnmeasuredKeywords
      ? ['AI 생성 연관어는 미실측이며 SearchAd/네이버 broad 실측 전에는 결과 키워드나 등급으로 사용하지 않습니다.']
      : []),
  ], 3);
  merged.warning = warningParts.length ? warningParts.join(' ') : undefined;
  merged.generatedBy = `external-agent:${provider}`;
  return {
    ...metric,
    agentInsight: merged,
    evidence: normalizeStringList([...(metric.evidence || []), `external-agent:${provider}`], 18),
  };
}

async function withExternalAgentInsight(
  result: MobileKeywordResult,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  agent: MobileAgentAssistContext | undefined,
  env: Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  if (result.keywords.length === 0 || !agent) return result;
  const selection = resolveExternalAgentInsightSelection(agent, env);
  if (!selection) return result;
  const maxRows = clampInt(agent.maxAgentRows, EXTERNAL_AGENT_MAX_ROWS, 1, EXTERNAL_AGENT_MAX_ROWS);
  const sliced = withKeywordResultSummary(result, result.keywords.slice(0, maxRows));
  try {
    const prompt = buildExternalAgentInsightPrompt(sliced, params, product, agent);
    const response = await callExternalAgentInsightModel(selection, prompt);
    if (!response.items.length) return result;
    const byIndex = new Map<number, ExternalAgentInsightItem>();
    const allowedIndexByKeyword = new Map<string, number>();
    sliced.keywords.forEach((metric, index) => {
      const key = compactKeyword(metric.keyword);
      if (key && !allowedIndexByKeyword.has(key)) allowedIndexByKeyword.set(key, index);
    });
    for (const rawItem of response.items) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
      const item = rawItem as ExternalAgentInsightItem;
      const key = compactKeyword(normalizeKeyword(item.keyword || item.originalKeyword || ''));
      const rawIndex = Number.isInteger(item.index) ? Number(item.index) : null;
      const indexFromKeyword = key ? allowedIndexByKeyword.get(key) : undefined;
      if (key && indexFromKeyword === undefined) continue;
      if (rawIndex !== null && (rawIndex < 0 || rawIndex >= sliced.keywords.length)) continue;
      if (rawIndex !== null && indexFromKeyword !== undefined && rawIndex !== indexFromKeyword) continue;
      const targetIndex = indexFromKeyword ?? rawIndex;
      if (targetIndex === null || targetIndex === undefined || byIndex.has(targetIndex)) continue;
      byIndex.set(targetIndex, item);
      if (byIndex.size >= maxRows) break;
    }
    let mergedCount = 0;
    const keywords = result.keywords.map((metric, index) => {
      if (index >= sliced.keywords.length) return metric;
      const item = byIndex.get(index);
      if (!item) return metric;
      mergedCount += 1;
      return mergeExternalAgentInsightItem(metric, item, response.provider);
    });
    const summarized = withKeywordResultSummary(result, keywords);
    return {
      ...summarized,
      summary: {
        ...summarized.summary,
        agentInsightExternalProvider: response.provider,
        agentInsightExternalCount: mergedCount,
        agentInsightExternalAttemptedProviders: [selection.provider],
        agentInsightExternalCallCount: 1,
        agentInsightExternalKeyOwner: selection.keyOwner,
      },
    };
  } catch (error) {
    const provider = error instanceof ExternalAgentInsightCallError ? error.provider : selection.provider;
    return {
      ...result,
      summary: {
        ...result.summary,
        agentInsightExternalProvider: provider,
        agentInsightExternalCount: 0,
        agentInsightExternalAttemptedProviders: [selection.provider],
        agentInsightExternalCallCount: 1,
        agentInsightExternalKeyOwner: selection.keyOwner,
        agentInsightExternalError: normalizeKeyword((error as Error).message).slice(0, 180),
      },
    };
  }
}

function applyAgentQualityGate(
  result: MobileKeywordResult,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
): MobileKeywordResult {
  if (!AGENT_QUALITY_PRODUCTS.has(product) || result.keywords.length === 0) return result;
  const hasAgentAssist = params.agentAssist && params.agentAssist.enabled !== false;
  const alwaysGateProducts = product === 'pro-traffic-hunter'
    || product === 'shopping-connect'
    || product === 'naver-mate-hunter';
  if (!hasAgentAssist && !alwaysGateProducts) return result;

  const judged = attachKeywordAiJudges(attachPublishDecisions(result.keywords), {
    downgradeExcluded: false,
  });
  const seen = new Set<string>();
  const kept: MobileKeywordMetric[] = [];
  const relaxed: MobileKeywordMetric[] = [];
  let rejected = 0;

  for (const metric of judged) {
    const key = compactKeyword(metric.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const exact = isAgentExactRequestedKeyword(metric, params, product);
    const rejectReason = exact ? null : agentRejectReasonForMetric(metric, product);
    if (rejectReason) {
      rejected += 1;
      continue;
    }
    if (exact) {
      kept.push(metric);
      continue;
    }
    const total = finiteNumber(metric.totalSearchVolume) ?? 0;
    const docs = finiteNumber(metric.documentCount) ?? 0;
    const ratio = finiteNumber(metric.goldenRatio) ?? 0;
    const hasNeedModifier = AGENT_NEED_MODIFIER_RE.test(metric.keyword);
    const hasHunterNeed = isAgentBeginnerMonetizableNeed(metric, product);
    const measuredEnough = isFullyMeasuredKeyword(metric) && total >= 30 && docs > 0;
    const hasEdge = metric.grade === 'SSS'
      || (metric.grade === 'SS' && ratio >= 2)
      || (total >= 300 && ratio >= 1.5)
      || (hasNeedModifier && total >= 100 && docs <= 50000);
    if (measuredEnough && hasEdge && (hasHunterNeed || product === 'keyword-analysis' || product === 'mindmap-expansion' || product === 'youtube-golden')) {
      kept.push(metric);
    } else {
      relaxed.push(metric);
    }
  }

  const targetCount = targetCountFromAgentParams(params, result.keywords.length);
  const ordered = [...kept].sort((a, b) => agentQualityScore(b, product) - agentQualityScore(a, product));
  const minRows = product === 'keyword-analysis' ? 1 : Math.min(10, targetCount);
  const fallback = ordered.length >= minRows
    ? ordered
    : mergePrioritizedKeywordMetrics([
      ordered,
      relaxed
        .filter((metric) => metric.aiJudge?.verdict !== 'exclude')
        .sort((a, b) => agentQualityScore(b, product) - agentQualityScore(a, product)),
    ], targetCount);
  const summarized = withKeywordResultSummary(result, fallback.slice(0, targetCount));
  return {
    ...summarized,
    summary: {
      ...summarized.summary,
      agentFiltered: rejected,
      agentQualityProfile: 'measured-need-ratio-intent-gate-v2',
    },
  };
}

async function withAgentAssistSummary(
  result: MobileKeywordResult,
  params: MobileAgentAwareParams,
  product: MobileKeywordProduct,
  env: Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const qualityResult = applyAgentQualityGate(result, params, product);
  const agent = params.agentAssist && params.agentAssist.enabled !== false
    ? params.agentAssist
    : undefined;
  const insightKeywords = attachAgentInferredInsights(qualityResult.keywords, params, product, agent);
  const insightResult = await withExternalAgentInsight(
    withKeywordResultSummary(qualityResult, insightKeywords),
    params,
    product,
    agent,
    env,
  );
  if (!agent) return insightResult;
  const tasks = normalizeStringList(agent.tasks, 16);
  const provider = normalizeKeyword(agent.provider) || 'server-auto';
  const readinessOnlyProvider = /^(?:codex|claude(?:-code)?|claude_code)$/iu.test(provider);
  const tag = 'agent-assist:deterministic';
  return {
    ...insightResult,
    keywords: insightResult.keywords.map((item) => ({
      ...item,
      evidence: normalizeStringList([...(item.evidence || []), tag], 18),
    })),
    summary: {
      ...insightResult.summary,
      agentAssist: {
        enabled: true,
        product,
        featureId: normalizeKeyword(agent.featureId) || product,
        provider,
        mode: readinessOnlyProvider
          ? 'readiness-status-only'
          : normalizeKeyword(agent.mode) || 'server-default-worker',
        tasks,
      },
    },
  };
}

function metricGradeRank(grade: unknown): number {
  const normalized = String(grade || '').toUpperCase();
  if (normalized === 'SSS') return 5;
  if (normalized === 'SS') return 4;
  if (normalized === 'S') return 3;
  if (normalized === 'A') return 2;
  if (normalized === 'B') return 1;
  return 0;
}

function measuredDecisionScore(metric: MobileKeywordMetric): number {
  const judgeScore = finiteNumber(metric.aiJudge?.score) ?? 0;
  const ratio = finiteNumber(metric.goldenRatio) ?? 0;
  const total = finiteNumber(metric.totalSearchVolume) ?? 0;
  const docs = finiteNumber(metric.documentCount) ?? 0;
  const publishBoost = metric.aiJudge?.verdict === 'publish' ? 100000 : 0;
  return publishBoost
    + judgeScore * 1000
    + metricGradeRank(metric.grade) * 500
    + Math.min(250, ratio) * 10
    + Math.min(50000, total) / 100
    - Math.min(50000, docs) / 10000;
}

function prioritizeMeasuredDecisionMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
  options: {
    publishOnly?: boolean;
    requirePcMobileSplit?: boolean;
    minTotalSearchVolume?: number;
    maxDocumentCount?: number;
    minGoldenRatio?: number;
  } = {},
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  return attachPublishDecisions(attachKeywordAiJudges(metrics, { downgradeExcluded: false }))
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (!isFullyMeasuredKeyword(metric)) return false;
      if (metric.aiJudge?.verdict === 'exclude') return false;
      if (metric.publishDecision?.verdict === 'exclude') return false;
      if (options.publishOnly && metric.aiJudge?.verdict !== 'publish') return false;
      if (options.requirePcMobileSplit) {
        const pc = finiteNumber(metric.pcSearchVolume);
        const mobile = finiteNumber(metric.mobileSearchVolume);
        if (pc === null || mobile === null || pc + mobile <= 0) return false;
      }
      const total = finiteNumber(metric.totalSearchVolume) ?? 0;
      const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
      const ratio = finiteNumber(metric.goldenRatio) ?? 0;
      if (total < (options.minTotalSearchVolume ?? 0)) return false;
      if (docs > (options.maxDocumentCount ?? Number.POSITIVE_INFINITY)) return false;
      if (ratio < (options.minGoldenRatio ?? 0)) return false;
      return true;
    })
    .sort((a, b) => measuredDecisionScore(b) - measuredDecisionScore(a))
    .slice(0, targetCount);
}

function prioritizeShoppingProductPickMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  return attachPublishDecisions(attachKeywordAiJudges(metrics, { downgradeExcluded: false }))
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (!metric.shoppingProductPick) return false;
      if (!isFullyMeasuredKeyword(metric)) return false;
      if (metric.aiJudge?.verdict === 'exclude') return false;
      if (metric.publishDecision?.verdict === 'exclude') return false;
      const pc = finiteNumber(metric.pcSearchVolume);
      const mobile = finiteNumber(metric.mobileSearchVolume);
      if (pc === null || mobile === null || pc + mobile <= 0) return false;
      const total = finiteNumber(metric.totalSearchVolume) ?? 0;
      const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
      if (total < 10 || docs > 150000) return false;
      return true;
    })
    .sort((a, b) => {
      const pickScore = (finiteNumber(b.shoppingProductPick?.conversionScore) ?? 0)
        - (finiteNumber(a.shoppingProductPick?.conversionScore) ?? 0);
      if (pickScore !== 0) return pickScore;
      return measuredDecisionScore(b) - measuredDecisionScore(a);
    })
    .slice(0, targetCount);
}

function mergePrioritizedKeywordMetrics(
  groups: MobileKeywordMetric[][],
  targetCount: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  const out: MobileKeywordMetric[] = [];
  for (const group of groups) {
    for (const metric of group) {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(metric);
      if (out.length >= targetCount) return out;
    }
  }
  return out;
}

function proTrafficFallbackLane(categoryId: string): MobileSourceSignalLane {
  return compactKeyword(categoryId).includes('policy') ? 'policy' : 'all';
}

function metricFromSourceSignal(
  signal: MobileSignalItem,
  index: number,
  source: string,
  intent: string,
): MobileKeywordMetric {
  const priorityScore = finiteNumber(signal.priority) ?? 0;
  const score = Math.max(45, Math.min(92, 72 + priorityScore * 3 - index * 0.7));
  const keyword = normalizeKeyword(sourceSignalKeyword(signal));
  return {
    keyword,
    grade: normalizeGrade(undefined, score),
    score,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    cpc: null,
    category: normalizeKeyword(signal.categoryId || signal.kind) || 'live-source',
    source,
    intent,
    evidence: [
      source,
      'server-source-signals',
      normalizeKeyword(signal.source),
      normalizeKeyword(signal.title),
      normalizeKeyword(signal.description),
    ].filter(Boolean),
    isMeasured: false,
  };
}

function sourceSignalKeyword(signal: MobileSignalItem): string {
  const raw = normalizeKeyword(signal.keyword || signal.title);
  const withoutBracket = raw
    .replace(/\[[^\]]{2,60}\]/g, ' ')
    .replace(/[“”"']/g, ' ')
    .replace(/\s*에\s*빠진다\s*$/g, '')
    .replace(/\s*빠진다\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstClause = (withoutBracket.split(/[,.!?。|｜·]/)[0] || withoutBracket).trim();
  const stopWords = new Set(['단독', '영상', '속보', '공식', '종합', '인터뷰', '포토', '오늘', '최신']);
  const tokens = firstClause
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, ''))
    .filter((token) => token.length >= 2 && !stopWords.has(token));
  const candidate = tokens.slice(0, 5).join(' ').trim();
  const resolved = candidate.length >= 2 ? candidate : raw.slice(0, 42).trim();
  return resolved.length > 42 ? resolved.slice(0, 42).trim() : resolved;
}

function sourceSignalKeywordCandidates(signal: MobileSignalItem): string[] {
  const base = sourceSignalKeyword(signal);
  if (!base) return [];
  const issueIntents = ['몇부작', '출연진', '다시보기', '방송시간', '공식입장', '일정', '정리'];
  const policyIntents = ['신청', '대상', '조건', '기간', '서류', '지급일', '방법'];
  const realtimeIntents = ['정리', '일정', '방법', '대상', '후기', '가격', '예매'];
  const intents = signal.kind === 'policy'
    ? policyIntents
    : signal.kind === 'issue' || signal.categoryId === 'celebrity'
      ? issueIntents
      : realtimeIntents;
  const seen = new Set<string>();
  return [base, ...intents.map((intentKeyword) => `${base} ${intentKeyword}`)]
    .filter((keyword) => {
      const key = compactKeyword(keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function keywordTokens(keyword: string): string[] {
  return normalizeKeyword(keyword)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[^\dA-Za-z\uAC00-\uD7A3\s]/gu, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

const SAFE_HANGUL_SEARCH_RE = /[A-Za-z0-9\uAC00-\uD7A3]/u;

const SAFE_MEASURED_INTENT_SUFFIXES = [
  '\uBC29\uBC95',
  '\uC870\uD68C',
  '\uACC4\uC0B0',
  '\uC2E0\uCCAD',
  '\uC790\uACA9',
  '\uC870\uAC74',
  '\uAE30\uAC04',
  '\uC11C\uB958',
  '\uBE44\uC6A9',
  '\uAC00\uACA9',
  '\uD6C4\uAE30',
  '\uBE44\uAD50',
  '\uCD94\uCC9C',
  '\uC8FC\uC758\uC0AC\uD56D',
  '\uB0A9\uBD80',
  '\uD658\uAE09',
  '\uD655\uC778',
  '\uB300\uC0C1',
  '\uBCC0\uACBD',
] as const;

const SAFE_NUMERIC_KOREAN_QUERY_ALIASES: Array<[RegExp, string]> = [
  [/\uC77C\s*\uB300/gu, '1\uB300'],
  [/\uC774\s*\uB300/gu, '2\uB300'],
  [/\uC0BC\s*\uB300/gu, '3\uB300'],
  [/\uC0AC\s*\uB300/gu, '4\uB300'],
  [/\uC624\s*\uB300/gu, '5\uB300'],
  [/\uC721\s*\uB300/gu, '6\uB300'],
  [/\uCE60\s*\uB300/gu, '7\uB300'],
  [/\uD314\s*\uB300/gu, '8\uB300'],
  [/\uAD6C\s*\uB300/gu, '9\uB300'],
  [/\uC2ED\s*\uB300/gu, '10\uB300'],
  [/1\s*\uB300/gu, '\uC77C\uB300'],
  [/2\s*\uB300/gu, '\uC774\uB300'],
  [/3\s*\uB300/gu, '\uC0BC\uB300'],
  [/4\s*\uB300/gu, '\uC0AC\uB300'],
  [/5\s*\uB300/gu, '\uC624\uB300'],
  [/6\s*\uB300/gu, '\uC721\uB300'],
  [/7\s*\uB300/gu, '\uCE60\uB300'],
  [/8\s*\uB300/gu, '\uD314\uB300'],
  [/9\s*\uB300/gu, '\uAD6C\uB300'],
  [/10\s*\uB300/gu, '\uC2ED\uB300'],
] as const;

const SAFE_SPACING_INTENT_SUFFIXES = [
  '\uACC4\uC0B0\uAE30',
  '\uACC4\uC0B0',
  '\uC870\uD68C',
  '\uC2E0\uCCAD',
  '\uD655\uC778',
  '\uAC00\uACA9',
  '\uBE44\uAD50',
  '\uCD94\uCC9C',
  '\uBC29\uBC95',
] as const;

const MINDMAP_ARTICLE_TITLE_QUERY_RE = /(?:\uCD1D\uC815\uB9AC|\uD55C\uB208\uC5D0|\uC644\uBCBD\s*(?:\uAC00\uC774\uB4DC|\uD65C\uC6A9\uBC95)|\uC774\uAC83\uB9CC\s*\uC54C\uBA74|\uD655\uC778\uD560\s*\d+\uAC00\uC9C0|\d+\uAC00\uC9C0|\uC4F0\uAE30\s*\uC804|\uAE30\uBCF8\s*\uAD6C\uC131\s*\uC774\uD574|\uB3C4\uC6C0(?:\uC740)?\s*\uD544\uC218|\uD544\uC218(?:\uC785\uB2C8\uB2E4)?|\uC0B4\uD3B4\uBD10\uC694|\uC54C\uC544\uBCF4\uAE30)$/u;

const INSURANCE_CALCULATOR_INTENT_SUFFIXES = [
  '\uACC4\uC0B0\uAE30',
  '\uACC4\uC0B0',
  '\uBCF4\uD5D8\uB8CC \uACC4\uC0B0\uAE30',
  '\uBCF4\uD5D8\uB8CC \uACC4\uC0B0',
  '\uC694\uC728',
  '\uC694\uC728\uD45C',
  '\uAC00\uC785\uD655\uC778',
  '\uAC00\uC785\uB0B4\uC5ED \uD655\uC778',
  '\uB0A9\uBD80',
  '\uB0A9\uBD80\uD655\uC778',
  '\uC644\uB0A9\uC99D\uBA85\uC11C',
  '\uAC00\uC785\uC790\uBA85\uBD80',
  '\uACC4\uC0B0\uBC29\uBC95',
  '\uBAA8\uC758\uACC4\uC0B0',
  '\uC6D4\uAE09\uACC4\uC0B0',
  '\uC2E4\uC218\uB839\uC561',
  '\uACF5\uC81C\uC728',
  '\uD655\uC778\uC11C',
  '\uC99D\uBA85\uC11C',
] as const;

function buildInsuranceCalculatorMeasuredRoots(keyword: string, limit = 24): string[] {
  const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
  const compact = compactKeyword(normalized);
  if (!normalized || !/(?:\uC0AC\uB300|4\uB300)\uBCF4\uD5D8/u.test(compact)) return [];
  if (!compact.includes('\uACC4\uC0B0') && !compact.includes('\uBCF4\uD5D8')) return [];
  const heads = [
    '4\uB300\uBCF4\uD5D8',
    '4\uB300 \uBCF4\uD5D8',
    '\uC0AC\uB300\uBCF4\uD5D8',
    '\uC0AC\uB300 \uBCF4\uD5D8',
  ];
  const adjacentMeasuredRoots = [
    '\uAC74\uAC15\uBCF4\uD5D8\uB8CC \uACC4\uC0B0\uAE30',
    '\uAD6D\uBBFC\uC5F0\uAE08 \uACC4\uC0B0\uAE30',
    '\uACE0\uC6A9\uBCF4\uD5D8 \uACC4\uC0B0\uAE30',
    '\uC0B0\uC7AC\uBCF4\uD5D8 \uACC4\uC0B0\uAE30',
    '\uC6D4\uAE09 \uC2E4\uC218\uB839\uC561 \uACC4\uC0B0\uAE30',
    '\uAE09\uC5EC \uACC4\uC0B0\uAE30',
    '\uC5F0\uBD09 \uACC4\uC0B0\uAE30',
    '\uD1F4\uC9C1\uAE08 \uACC4\uC0B0\uAE30',
    '4\uB300\uBCF4\uD5D8 \uAC00\uC785\uB0B4\uC5ED \uD655\uC778\uC11C',
    '4\uB300\uBCF4\uD5D8 \uB0A9\uBD80\uD655\uC778\uC11C',
    '4\uB300\uBCF4\uD5D8 \uC0AC\uC5C5\uC7A5 \uAC00\uC785\uC790\uBA85\uBD80',
    '\uAC74\uAC15\uBCF4\uD5D8 \uC790\uACA9\uB4DD\uC2E4\uD655\uC778\uC11C',
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const clean = normalizeKeyword(value).replace(/\s+/g, ' ').trim();
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean.length < 2 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };
  push(normalized);
  buildKoreanNumericAliasRoots(normalized, 8).forEach(push);
  buildSpacingIntentAliasRoots(normalized, 8).forEach(push);
  adjacentMeasuredRoots.forEach(push);
  for (const head of heads) {
    push(head);
    const feeHead = `${head.replace(/\s+/g, '')}\uB8CC`;
    push(feeHead);
    push(`${feeHead} \uACC4\uC0B0`);
    push(`${feeHead} \uACC4\uC0B0\uAE30`);
    for (const suffix of INSURANCE_CALCULATOR_INTENT_SUFFIXES) {
      push(`${head} ${suffix}`);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

function buildMindmapMeasuredQueryRoots(keyword: string, limit = 32): string[] {
  const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
  const root = stripKnownIntent(normalized);
  const seeds = uniqueKeywords([normalized, root], 2);
  return uniqueKeywords(seeds.flatMap((seed) => [
    seed,
    ...buildInsuranceCalculatorMeasuredRoots(seed, limit),
    ...buildKoreanNumericAliasRoots(seed, 8),
    ...buildSpacingIntentAliasRoots(seed, 8),
  ]), limit);
}

function buildSpacingIntentAliasRoots(keyword: string, limit = 12): string[] {
  const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const compact = normalized.replace(/\s+/g, '');
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const clean = normalizeKeyword(value).replace(/\s+/g, ' ').trim();
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean === normalized || clean.length < 2 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };
  for (const suffix of SAFE_SPACING_INTENT_SUFFIXES) {
    if (!compact.endsWith(suffix)) continue;
    const prefix = compact.slice(0, -suffix.length);
    if (prefix.length < 2) continue;
    push(`${prefix} ${suffix}`);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function buildKoreanNumericAliasRoots(keyword: string, limit = 12): string[] {
  const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const clean = normalizeKeyword(value).replace(/\s+/g, ' ').trim();
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean === normalized || clean.length < 2 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };
  for (const [pattern, replacement] of SAFE_NUMERIC_KOREAN_QUERY_ALIASES) {
    const alias = normalized.replace(pattern, replacement);
    push(alias);
    buildSpacingIntentAliasRoots(alias, limit).forEach(push);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function buildSafeMeasuredIntentRoots(keyword: string, limit = 24): string[] {
  const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const tokens = keywordTokens(normalized);
  const measuredQueryRoots = buildMindmapMeasuredQueryRoots(normalized, 12);
  const numericAliases = buildKoreanNumericAliasRoots(normalized, 6);
  const spacingAliases = buildSpacingIntentAliasRoots(normalized, 6);
  const bases = uniqueKeywords([
    normalized,
    ...measuredQueryRoots,
    ...numericAliases,
    ...spacingAliases,
    tokens.slice(0, 4).join(' '),
    tokens.slice(0, 3).join(' '),
    tokens.slice(0, 2).join(' '),
  ], 12);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const clean = normalizeKeyword(value).replace(/\s+/g, ' ').trim();
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean.length < 2 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };
  bases.forEach(push);
  for (const base of bases.slice(0, 4)) {
    for (const suffix of SAFE_MEASURED_INTENT_SUFFIXES) {
      push(keywordAlreadyHasIntentSuffix(base, suffix) ? base : `${base} ${suffix}`);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

function intentRootDomain(keyword: string): 'sports' | 'policy' | 'commerce' | 'entertainment' | 'finance' | 'generic' {
  const text = normalizeKeyword(keyword);
  if (/(KBO|FIFA|월드컵|축구|야구|농구|배구|올스타|경기|선수|피파랭킹|순위|중계)/i.test(text)) return 'sports';
  if (/(지원금|장려금|바우처|급여|수당|복지|정책|신청|대상|자격|정부|청년|소상공인|부모급여)/.test(text)) return 'policy';
  if (/(가격|추천|후기|리뷰|할인|쿠폰|제품|예약|리조트|호텔|캠핑|에어컨|노트북|게임기|쇼핑|구매)/.test(text)) return 'commerce';
  if (/(드라마|예능|방송|영화|배우|가수|콘서트|공연|출연진|몇부작|다시보기|공식영상|티저|컴백)/.test(text)) return 'entertainment';
  if (/(주가|실적|전망|배당|목표가|환율|금리|공모주|청약|상장|코인)/.test(text)) return 'finance';
  return 'generic';
}

const INTENT_ROOT_SUFFIXES: Record<ReturnType<typeof intentRootDomain>, string[]> = {
  sports: ['일정', '중계', '라인업', '순위', '결과', '하이라이트', '예매'],
  policy: ['신청', '자격', '대상', '지급일', '조회', '서류', '기간', '조건'],
  commerce: ['가격', '후기', '추천', '비교', '할인', '예약', '구매처'],
  entertainment: ['출연진', '다시보기', '방송시간', '공식영상', '예매', '일정', '반응'],
  finance: ['주가', '전망', '실적', '배당', '목표가', '청약', '상장일'],
  generic: ['정리', '이유', '방법', '일정', '조회', '후기'],
};

function buildIntentQueryRoots(keyword: string, limit = 24): string[] {
  const normalized = normalizeKeyword(keyword);
  const tokens = keywordTokens(normalized);
  const domain = intentRootDomain(normalized);
  const suffixes = INTENT_ROOT_SUFFIXES[domain];
  const bases: string[] = [];
  const addBase = (value: string) => {
    const clean = normalizeKeyword(value);
    if (!clean || clean.length < 2 || clean.length > 32) return;
    bases.push(clean);
  };

  addBase(normalized);
  addBase(tokens.slice(0, 4).join(' '));
  addBase(tokens.slice(0, 3).join(' '));
  addBase(tokens.slice(0, 2).join(' '));
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      addBase(tokens.slice(index, index + size).join(' '));
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const clean = normalizeKeyword(value).replace(/\s+/g, ' ').trim();
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean.length < 2 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };

  bases.forEach(push);
  for (const base of bases.slice(0, 5)) {
    for (const suffix of suffixes) {
      const candidate = keywordAlreadyHasIntentSuffix(base, suffix) ? base : `${base} ${suffix}`;
      push(candidate);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

function expandNaverMateQueryRoots(roots: string[], targetCount: number): string[] {
  return uniqueKeywords(
    roots.flatMap(root => [
      ...buildNaverMateMeasuredQueryRoots(root, 24),
      ...buildIntentQueryRoots(root, 8),
      ...buildSafeMeasuredIntentRoots(root, 8),
    ]),
    Math.min(80, Math.max(32, targetCount * 2)),
  );
}

const NAVER_MATE_NEED_SUFFIXES = [
  '\uC2E0\uCCAD',
  '\uB300\uC0C1',
  '\uC870\uAC74',
  '\uC11C\uB958',
  '\uC9C0\uAE09\uC77C',
  '\uC870\uD68C',
  '\uBC29\uBC95',
  '\uAE30\uAC04',
  '\uB9C8\uAC10',
  '\uC815\uB9AC',
  '\uAC00\uACA9',
  '\uCD94\uCC9C',
  '\uBE44\uAD50',
  '\uD6C4\uAE30',
  '\uC608\uC57D',
  '\uC608\uB9E4',
  '\uC77C\uC815',
  '\uACB0\uACFC',
  '\uC21C\uC704',
  '\uC2DC\uAC04',
  '\uC900\uBE44\uBB3C',
];

const NAVER_MATE_NEED_SUFFIX_SET = new Set(NAVER_MATE_NEED_SUFFIXES.map((suffix) => compactKeyword(suffix)));

const NAVER_MATE_ROOT_STOPWORDS = new Set([
  '\uC18D\uBCF4',
  '\uB2E8\uB3C5',
  '\uACF5\uC2DD',
  '\uC885\uD569',
  '\uCD5C\uC2E0',
  '\uC624\uB298',
  '\uB0B4\uC77C',
  '\uC774\uBC88\uC8FC',
  '\uB274\uC2A4',
  '\uBCF4\uB3C4',
  '\uC601\uC0C1',
  '\uC0AC\uC9C4',
  '\uC774\uC288',
  '\uAD00\uB828',
  '\uBC18\uC751',
].map((word) => compactKeyword(word)));

const NAVER_MATE_SENTENCE_LIKE_RE = new RegExp([
  '\\uC54C\\uB824\\uC8FC\\uC138\\uC694',
  '\\uD574\\uC8FC\\uC138\\uC694',
  '\\uD569\\uB2C8\\uB2E4',
  '\\uB429\\uB2C8\\uB2E4',
  '\\uC788\\uB098\\uC694',
  '\\uBB34\\uC5C7',
  '\\uC5B4\\uB5BB\\uAC8C',
  '\\uC65C',
  '^comment\\b',
].join('|'), 'iu');

const NAVER_MATE_UTILITY_SIGNAL_RE = new RegExp([
  '\\uC2E0\\uCCAD',
  '\\uB300\\uC0C1',
  '\\uC870\\uAC74',
  '\\uC11C\\uB958',
  '\\uC9C0\\uAE09\\uC77C',
  '\\uC870\\uD68C',
  '\\uBC29\\uBC95',
  '\\uAE30\\uAC04',
  '\\uB9C8\\uAC10',
  '\\uD658\\uAE09',
  '\\uC9C0\\uC6D0\\uAE08',
  '\\uBCF4\\uC870\\uAE08',
  '\\uC7A5\\uB824\\uAE08',
  '\\uBCF5\\uC9C0',
  '\\uD61C\\uD0DD',
  '\\uBCF4\\uD5D8',
  '\\uACC4\\uC0B0\\uAE30',
  '\\uC694\\uC728',
  '\\uACF5\\uC81C',
  '\\uC138\\uAE08',
  '\\uB0A9\\uBD80',
  '\\uC99D\\uBA85\\uC11C',
  '\\uBC1C\\uAE09',
  '\\uC790\\uACA9',
  '\\uC815\\uCC45',
  '\\uC81C\\uB3C4',
  '\\uCCAD\\uB144',
  '\\uC721\\uC544',
  '\\uCD9C\\uC0B0',
  '\\uD734\\uAC00',
  '\\uC0AC\\uC5C5\\uC790',
  '\\uAE09\\uC5EC',
  '\\uCE74\\uB4DC',
  '\\uD560\\uC778',
  '\\uB300\\uCD9C',
  '\\uC5F0\\uB9D0\\uC815\\uC0B0',
  '\\uC18C\\uB4DD\\uACF5\\uC81C',
  '\\uC758\\uB8CC\\uBE44',
  '\\uAD50\\uC721\\uBE44',
].join('|'), 'iu');

const NAVER_MATE_VOLATILE_NEWS_RE = new RegExp([
  '\\uAC10\\uB3C5',
  '\\uC120\\uC218',
  '\\uACBD\\uAE30',
  '\\uC6D4\\uB4DC\\uCEF5',
  'KBO',
  '\\uC62C\\uC2A4\\uD0C0',
  '\\uD648\\uB7F0',
  '\\uCD95\\uAD6C',
  '\\uC57C\\uAD6C',
  '\\uB4DC\\uB77C\\uB9C8',
  '\\uBC30\\uC6B0',
  '\\uAC00\\uC218',
  '\\uCF58\\uC11C\\uD2B8',
  '\\uD504\\uB85C\\uD544',
  '\\uB098\\uC774',
  '\\uC778\\uC2A4\\uD0C0',
  '\\uC5F4\\uC560',
  '\\uC0AC\\uB9DD',
  '\\uBD80\\uACE0',
  '\\uB17C\\uB780',
  '\\uC0AC\\uACFC',
  '\\uD574\\uBA85',
  '\\uBC1C\\uC5B8',
  '\\uCC38\\uC11D',
  '\\uAE30\\uC790\\uD68C\\uACAC',
  '\\uACF5\\uC2DD\\uC785\\uC7A5',
  '\\uADFC\\uD669',
].join('|'), 'iu');

function stripNaverMateKnownSuffix(keyword: string): string {
  let out = normalizeKeyword(keyword);
  for (const suffix of NAVER_MATE_NEED_SUFFIXES) {
    const suffixRe = new RegExp(`\\s*${suffix}\\s*$`, 'iu');
    out = out.replace(suffixRe, '').trim();
  }
  return out || normalizeKeyword(keyword);
}

function isNaverMateRootToken(token: string): boolean {
  const clean = token.replace(/[^\dA-Za-z\uAC00-\uD7A3]/gu, '').trim();
  if (clean.length < 2 || clean.length > 16) return false;
  if (/^\d+$/.test(clean)) return false;
  const key = compactKeyword(clean);
  if (!key || NAVER_MATE_ROOT_STOPWORDS.has(key)) return false;
  return SAFE_HANGUL_SEARCH_RE.test(clean);
}

function naverMateConciseBases(root: string, limit: number): string[] {
  const cleaned = stripNaverMateKnownSuffix(root)
    .replace(/\[[^\]]{2,80}\]/g, ' ')
    .replace(/[(){}<>:"'`.,!?;|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = keywordTokens(cleaned).filter(isNaverMateRootToken);
  const bases: string[] = [];
  const add = (value: string) => {
    const clean = normalizeKeyword(value);
    const tokenCount = keywordTokens(clean).length;
    if (!clean || clean.length < 2 || clean.length > 28 || tokenCount > 4) return;
    bases.push(clean);
  };

  add(cleaned);
  add(tokens.slice(0, 4).join(' '));
  add(tokens.slice(0, 3).join(' '));
  add(tokens.slice(0, 2).join(' '));
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      add(tokens.slice(index, index + size).join(' '));
    }
  }
  return uniqueKeywords(bases, limit);
}

function buildNaverMateMeasuredQueryRoots(root: string, limit = 32): string[] {
  const bases = naverMateConciseBases(root, Math.max(8, Math.ceil(limit / 2)));
  const out: string[] = [];
  const push = (value: string) => {
    const clean = normalizeKeyword(value);
    if (!isSearchPhraseCandidate(clean)) return;
    out.push(clean);
  };

  for (const base of bases) {
    push(base);
    if (out.length >= limit) return uniqueKeywords(out, limit);
  }
  for (const base of bases) {
    const baseKey = compactKeyword(base);
    for (const suffix of NAVER_MATE_NEED_SUFFIXES) {
      const suffixKey = compactKeyword(suffix);
      const candidate = baseKey.endsWith(suffixKey) || NAVER_MATE_NEED_SUFFIX_SET.has(baseKey)
        ? base
        : `${base} ${suffix}`;
      push(candidate);
      if (out.length >= limit) return uniqueKeywords(out, limit);
    }
  }
  return uniqueKeywords(out, limit);
}

function isNaverMateConciseMeasuredCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!isSearchPhraseCandidate(clean)) return false;
  if (clean.length > 34) return false;
  if (keywordTokens(clean).length > 5) return false;
  if (NAVER_MATE_SENTENCE_LIKE_RE.test(clean)) return false;
  if (NAVER_MATE_VOLATILE_NEWS_RE.test(clean) && !NAVER_MATE_UTILITY_SIGNAL_RE.test(clean)) return false;
  return true;
}

function isNaverMateUtilityRootCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!isNaverMateConciseMeasuredCandidate(clean)) return false;
  return NAVER_MATE_UTILITY_SIGNAL_RE.test(clean);
}

function naverMateCandidateSeedKey(candidate: { keyword: string; evidence: string[] }): string {
  const seed = candidate.evidence.find((item) => /^seed:/i.test(item || ''));
  return compactKeyword(seed ? seed.replace(/^seed:/i, '') : candidate.keyword);
}

const NAVER_MATE_SOURCE_NOISE_TOKENS = new Set([
  '\uC900',
  '\uC5D0\uB3C4',
  '\uAC00\uB2A5\uC131',
  '\uC788\uB294',
  '\uC5C6\uB294',
  '\uB204\uAD6C',
  '\uC5B8\uC81C',
  '\uC624\uB298',
  '\uCD5C\uC2E0',
  '\uB300\uD55C',
  '\uC704\uD55C',
  '\uC774\uB77C\uACE0',
  '\uC785\uB2C8\uB2E4',
  '\uD569\uB2C8\uB2E4',
  '\uB418\uC5C8\uC5B4\uC694',
  '\uC54C\uB824\uC8FC\uC138\uC694',
].map((word) => compactKeyword(word)));

function naverMateSignalTextValues(signal: MobileSignalItem): string[] {
  return uniqueKeywords([
    signal.keyword,
    signal.title,
    signal.description,
    sourceSignalKeyword(signal),
  ].map((value) => normalizeKeyword(value)).filter(Boolean), 8);
}

function naverMateSignalTokenWindows(value: string): string[] {
  const tokens = keywordTokens(stripNaverMateKnownSuffix(value))
    .filter((token) => isNaverMateRootToken(token))
    .filter((token) => !NAVER_MATE_SOURCE_NOISE_TOKENS.has(compactKeyword(token)));
  const out: string[] = [];
  const push = (candidate: string) => {
    const clean = normalizeKeyword(candidate);
    if (!clean || clean.length < 2 || clean.length > 28) return;
    out.push(clean);
  };
  push(tokens.slice(0, 4).join(' '));
  push(tokens.slice(0, 3).join(' '));
  push(tokens.slice(0, 2).join(' '));
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      push(tokens.slice(index, index + size).join(' '));
    }
  }
  return uniqueKeywords(out, 18);
}

function buildNaverMateSourceSignalQueryRoots(signal: MobileSignalItem, limit = 12): string[] {
  if (!isNaverMateSourceSignalWorthExpanding(signal)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const clean = normalizeKeyword(value);
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || !isNaverMateConciseMeasuredCandidate(clean)) return;
    seen.add(key);
    out.push(clean);
  };

  for (const value of naverMateSignalTextValues(signal)) {
    for (const base of [
      ...naverMateConciseBases(value, 10),
      ...naverMateSignalTokenWindows(value),
    ]) {
      for (const candidate of buildNaverMateMeasuredQueryRoots(base, 6)) {
        push(candidate);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function isNaverMateSourceSignalWorthExpanding(signal: MobileSignalItem): boolean {
  const text = normalizeKeyword([
    signal.keyword,
    signal.title,
    signal.description,
    signal.source,
    signal.categoryId,
    signal.kind,
  ].filter(Boolean).join(' '));
  if (!text) return false;
  if (!NAVER_MATE_UTILITY_SIGNAL_RE.test(text)) return false;
  const directKeyword = normalizeKeyword(sourceSignalKeyword(signal));
  if (NAVER_MATE_VOLATILE_NEWS_RE.test(text) && !NAVER_MATE_UTILITY_SIGNAL_RE.test(directKeyword)) {
    return false;
  }
  return true;
}

function roundRobinNaverMateSourceSignals(
  snapshot: Awaited<ReturnType<typeof buildMobileSourceSignalSnapshot>>,
  limit: number,
): MobileSignalItem[] {
  const lanes = [
    snapshot.policy || [],
    snapshot.realtime || [],
    snapshot.issues || [],
  ].map((lane) => lane.filter(isNaverMateSourceSignalWorthExpanding)).filter((lane) => lane.length > 0);
  if (!lanes.length) {
    return [];
  }
  const out: MobileSignalItem[] = [];
  const seen = new Set<string>();
  const maxLaneLength = Math.max(...lanes.map((lane) => lane.length), 0);
  for (let index = 0; index < maxLaneLength; index += 1) {
    for (const lane of lanes) {
      const signal = lane[index];
      if (!signal) continue;
      const key = compactKeyword(signal.keyword || signal.title || signal.id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(signal);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function balancedSourceSignalRoots(
  snapshot: Awaited<ReturnType<typeof buildMobileSourceSignalSnapshot>>,
  limit: number,
): string[] {
  const lanes = [
    snapshot.policy || [],
    snapshot.realtime || [],
    snapshot.issues || [],
  ].map((lane) => lane.filter(isNaverMateSourceSignalWorthExpanding)).filter((lane) => lane.length > 0);
  if (!lanes.length) {
    return [];
  }
  const out: string[] = [];
  const maxLaneLength = Math.max(...lanes.map((lane) => lane.length), 0);
  for (let index = 0; index < maxLaneLength; index += 1) {
    for (const lane of lanes) {
      const signal = lane[index];
      if (!signal) continue;
      for (const root of buildNaverMateSourceSignalQueryRoots(signal, 3)) {
        out.push(root);
        if (out.length >= limit) return uniqueKeywords(out, limit);
      }
    }
  }
  return uniqueKeywords(out, limit);
}

function buildYouTubeSearchIntentRoots(keyword: string, category?: string, limit = 16): string[] {
  const normalized = normalizeKeyword(keyword);
  const baseRoots = buildIntentQueryRoots(normalized, 10);
  const domain = intentRootDomain(`${normalized} ${category || ''}`);
  const youtubeSuffixes = domain === 'sports'
    ? ['하이라이트', '중계', '라인업', '결과', '일정']
    : domain === 'entertainment'
      ? ['공식영상', '다시보기', '출연진', '방송시간', '반응']
      : domain === 'commerce'
        ? ['후기', '가격', '추천', '비교', '할인']
        : ['정리', '방법', '이유', '반응', '후기'];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string) => {
    const clean = normalizeKeyword(value);
    const key = compactKeyword(clean);
    if (!key || seen.has(key) || clean.length < 3 || clean.length > 42) return;
    seen.add(key);
    out.push(clean);
  };
  baseRoots.slice(0, 6).forEach(push);
  for (const root of baseRoots.slice(0, 4)) {
    for (const suffix of youtubeSuffixes) {
      push(keywordAlreadyHasIntentSuffix(root, suffix) ? root : `${root} ${suffix}`);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

function isSearchPhraseCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || clean.length < 2 || clean.length > 42) return false;
  if (/[\[\]{}<>「」『』“”"…]|(?:\.\.\.)/.test(clean)) return false;
  if (/[.!?]{1,}$/.test(clean)) return false;
  if (/(습니다|합니다|했습니다|됩니다|입니다|아닙니다|있습니다|없습니다|착수했습니다|공표했습니다)$/.test(clean)) return false;
  const tokens = keywordTokens(clean);
  if (tokens.length > 6) return false;
  if (tokens.length >= 5 && !/(신청|자격|지급일|조회|방법|후기|가격|추천|비교|일정|중계|라인업|순위|결과|출연진|다시보기|공식영상|예매|주가|전망)$/.test(clean)) {
    return false;
  }
  return SAFE_HANGUL_SEARCH_RE.test(clean);
}

function isNaverMateIntentRootCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!isSearchPhraseCandidate(clean)) return false;
  return /(신청|자격|대상|지급일|조회|서류|기간|조건|가격|후기|추천|비교|할인|예약|구매처|일정|중계|라인업|순위|결과|하이라이트|예매|출연진|다시보기|방송시간|공식영상|반응|주가|전망|실적|배당|목표가|청약|상장일|정리|이유|방법)$/.test(clean)
    || keywordTokens(clean).length <= 3;
}

async function buildSourceSignalMetrics(
  lane: MobileSourceSignalLane,
  limit: number,
  context: MobileJobExecutorContext,
  source: string,
  intent: string,
  measureKeywordMetrics?: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  context.progress(74, `backfilling ${source} from live server source signals`);
  const snapshot = await buildMobileSourceSignalSnapshot({
    lane,
    limit: Math.min(30, Math.max(6, limit)),
  });
  if (snapshot.fallbackUsed) {
    context.progress(76, `${source} live source fallback was skipped because source snapshot used static fallback`);
    return [];
  }
  const items = [
    ...snapshot.realtime,
    ...snapshot.policy,
    ...snapshot.issues,
  ];
  const seen = new Set<string>();
  const metrics = items
    .flatMap((item, itemIndex) => sourceSignalKeywordCandidates(item)
      .map((keyword, keywordIndex) => metricFromSourceSignal({
        ...item,
        keyword,
      }, itemIndex + keywordIndex, source, intent)))
    .filter((item) => {
      const key = compactKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  if (!metrics.length || !measureKeywordMetrics) return metrics;
  return measureKeywordMetrics(metrics, context);
}

async function buildNaverMateLiveSourceFallbackMetrics(
  limit: number,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
  progressPercent = 86,
): Promise<MobileKeywordMetric[]> {
  context.progress(progressPercent, 'measuring Naver Mate live source intent roots');
  const snapshot = await buildMobileSourceSignalSnapshot({
    lane: 'all',
    limit: Math.min(120, Math.max(45, limit)),
  });
  if (snapshot.fallbackUsed) {
    context.progress(Math.min(99, progressPercent + 1), 'Naver Mate live source fallback skipped because source snapshot used static fallback');
    return [];
  }

  const signals = roundRobinNaverMateSourceSignals(snapshot, Math.min(90, Math.max(30, limit)));
  const seen = new Set<string>();
  const candidates: Array<{ keyword: string; signal: MobileSignalItem }> = [];
  const rows = signals.map((signal) => ({
    signal,
    keywords: buildNaverMateSourceSignalQueryRoots(signal, 8),
  })).filter((row) => row.keywords.length > 0);
  const maxKeywordRows = Math.max(...rows.map((row) => row.keywords.length), 0);
  for (let keywordIndex = 0; keywordIndex < maxKeywordRows; keywordIndex += 1) {
    for (const row of rows) {
      const keyword = row.keywords[keywordIndex];
      if (!keyword) continue;
      const key = compactKeyword(keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ keyword, signal: row.signal });
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit) break;
  }
  context.progress(Math.min(99, progressPercent + 1), `Naver Mate live source candidates: ${candidates.length}`);

  const metrics = candidates.map(({ keyword, signal }, index) => metricFromExpansion(
    keyword,
    Math.max(45, Math.min(90, 84 + (finiteNumber(signal.priority) ?? 0) * 0.8 - index * 0.12)),
    'pc-naver-mate-live-source-fallback',
    'naver-mate',
    normalizeKeyword(signal.categoryId || signal.kind) || 'naver',
    [
      'pc-naver-mate-live-source-fallback',
      'server-source-signals',
      normalizeKeyword(signal.source),
      normalizeKeyword(signal.keyword),
      normalizeKeyword(signal.title),
    ].filter(Boolean),
  ));
  if (!metrics.length) return [];
  return measureKeywordMetrics(metrics, context);
}

async function buildMeasuredIntentFallback(
  seed: string,
  limit: number,
  source: string,
  intent: string,
  category: string,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  const base = stripKnownIntent(seed) || normalizeKeyword(seed);
  if (isAutoDiscoveryPlaceholderKeyword(base)) return [];
  const isShoppingFallback = /shopping/i.test(source) || category === 'shopping';
  const directIntents = isShoppingFallback
    ? [
        '추천',
        '순위',
        '가격',
        '비교',
        '가성비',
        '구매처',
        '후기',
        '할인',
        '특가',
        '렌탈',
        '설치',
        '배송',
      ]
    : [
        '추천',
        '후기',
        '가격',
        '비교',
        '순위',
        '사용법',
        '주의사항',
        '전기세',
        '용량',
        '청소',
        '렌탈',
        '할인',
        '구매처',
        '가성비',
        '소음',
      ];
  const seen = new Set<string>();
  const keywords = [
    ...directIntents.map((intentKeyword) => keywordAlreadyHasIntentSuffix(base, intentKeyword) ? base : `${base} ${intentKeyword}`),
    ...buildCleanIntentCandidates(seed, Math.max(6, limit * 2)),
  ].filter((keyword) => {
    if (!isMeasuredFallbackCandidateUseful(keyword)) return false;
    const key = compactKeyword(keyword);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const candidates = keywords
    .slice(0, limit)
    .map((keyword, index) => metricFromExpansion(
      keyword,
      Math.max(45, 78 - index * 1.2),
      source,
      intent,
      category,
      [source, 'searchad-openapi-measured-fallback', `seed: ${seed}`],
    ));
  if (!candidates.length) return [];
  context.progress(72, `measuring ${candidates.length} ${source} fallback candidates`);
  return measureKeywordMetrics(candidates, context);
}

const NAVER_MATE_MEASURED_SIGNAL_RE = /(pc-naver|naver-autocomplete|autocomplete|auto-complete|related-keyword|relkwd|related-keywords|second-hop|pc-naver-mate-live-source-fallback|pc-naver-mate-intent-root-measured|server-measured-naver-mate-prewarm|naver-expansion-measured-need)/i;
const NAVER_MATE_LOW_VALUE_COMPACT_RE = /(?:\uD504\uB85C\uD544|\uB098\uC774|\uC778\uC2A4\uD0C0|\uD559\uB825|\uACE0\uD5A5|\uD0A4|\uD608\uC561\uD615|\uBA87\uBD80\uC791|\uCD9C\uC5F0\uC9C4|\uC7AC\uBC29\uC1A1|\uB2E4\uC2DC\uBCF4\uAE30|\uBC29\uC1A1\uC2DC\uAC04|\uACF5\uC2DD\uC601\uC0C1|\uD558\uC774\uB77C\uC774\uD2B8|\uC608\uACE0\uD3B8)$/u;

function isNaverMateMeasuredSignalMetric(metric: MobileKeywordMetric): boolean {
  const text = [
    metric.keyword,
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  return NAVER_MATE_MEASURED_SIGNAL_RE.test(text);
}

function isNaverMateDisplayQualityMetric(metric: MobileKeywordMetric): boolean {
  const key = compactKeyword(metric.keyword);
  if (!key) return false;
  if (isUltimateLowValueLookupKeyword(metric.keyword)) return false;
  if (NAVER_MATE_LOW_VALUE_COMPACT_RE.test(key)) return false;
  if (!isFullyMeasuredKeyword(metric)) return false;
  if (metric.isSearchVolumeEstimated === true || metric.isDocumentCountEstimated === true) return false;
  const pc = finiteNumber(metric.pcSearchVolume);
  const mobile = finiteNumber(metric.mobileSearchVolume);
  const total = finiteNumber(metric.totalSearchVolume) ?? 0;
  const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
  const ratio = finiteNumber(metric.goldenRatio) ?? 0;
  if (pc === null || mobile === null || pc + mobile <= 0) return false;
  if (total < 50) return false;
  if (docs <= 0 || docs > 8000) return false;
  if (ratio < 3) return false;
  if (total >= 50000 && ratio < 5) return false;
  return metric.grade === 'SSS';
}

function recoverNaverMateMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  const eligible = attachPublishDecisions(attachKeywordAiJudges(metrics, { downgradeExcluded: false }))
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (!isFullyMeasuredKeyword(metric)) return false;
      if (!isSearchPhraseCandidate(metric.keyword)) return false;
      if (!isNaverMateMeasuredSignalMetric(metric)) return false;
      if (!isNaverMateDisplayQualityMetric(metric)) return false;
      if (metric.aiJudge?.verdict === 'exclude') return false;
      if (metric.publishDecision?.verdict === 'exclude') return false;
      const pc = finiteNumber(metric.pcSearchVolume);
      const mobile = finiteNumber(metric.mobileSearchVolume);
      const total = finiteNumber(metric.totalSearchVolume) ?? 0;
      if (pc === null || mobile === null || pc + mobile <= 0 || total < 30) return false;
      return true;
    });
  const strict = eligible
    .filter((metric) => (finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY) <= 8000)
    .sort((a, b) => measuredDecisionScore(b) - measuredDecisionScore(a));
  const strictKeys = new Set(strict.map((metric) => compactKeyword(metric.keyword)).filter(Boolean));
  const measuredBroadFill = eligible
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || strictKeys.has(key)) return false;
      const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
      const total = finiteNumber(metric.totalSearchVolume) ?? 0;
      const ratio = finiteNumber(metric.goldenRatio) ?? 0;
      return docs <= 8000 && total >= 50 && ratio >= 3 && metric.grade === 'SSS';
    })
    .sort((a, b) => measuredDecisionScore(b) - measuredDecisionScore(a));
  return mergePrioritizedKeywordMetrics([strict, measuredBroadFill], targetCount);
}

function naverMateUtilityScore(metric: MobileKeywordMetric): number {
  const ratio = finiteNumber(metric.goldenRatio) ?? 0;
  const total = finiteNumber(metric.totalSearchVolume) ?? 0;
  const docs = finiteNumber(metric.documentCount) ?? 0;
  const sourceBoost = /live-source-fallback|prewarm|intent-root/i.test(`${metric.source} ${metric.evidence.join(' ')}`)
    ? 750
    : 0;
  return sourceBoost
    + metricGradeRank(metric.grade) * 1000
    + Math.min(100, ratio) * 40
    + Math.min(300000, total) / 500
    - Math.min(300000, docs) / 5000;
}

function prioritizeNaverMateUtilityMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
  maxDocumentCount: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  return metrics
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (!isFullyMeasuredKeyword(metric)) return false;
      if (!isSearchPhraseCandidate(metric.keyword)) return false;
      if (!isNaverMateMeasuredSignalMetric(metric)) return false;
      if (!isNaverMateDisplayQualityMetric(metric)) return false;
      const pc = finiteNumber(metric.pcSearchVolume);
      const mobile = finiteNumber(metric.mobileSearchVolume);
      const total = finiteNumber(metric.totalSearchVolume) ?? 0;
      const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
      if (pc === null || mobile === null || pc + mobile <= 0) return false;
      if (total < 50) return false;
      if (docs > Math.min(8000, maxDocumentCount)) return false;
      if ((finiteNumber(metric.goldenRatio) ?? 0) < 3) return false;
      return true;
    })
    .sort((a, b) => naverMateUtilityScore(b) - naverMateUtilityScore(a))
    .slice(0, targetCount);
}

function prioritizeNaverMateMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
  maxDocumentCount = 8000,
): MobileKeywordMetric[] {
  const strict = prioritizeMeasuredDecisionMetrics(metrics, targetCount, {
    requirePcMobileSplit: true,
    minTotalSearchVolume: 50,
    maxDocumentCount,
  }).filter(isNaverMateDisplayQualityMetric);
  const utility = prioritizeNaverMateUtilityMeasuredMetrics(metrics, targetCount, maxDocumentCount);
  const recovered = recoverNaverMateMeasuredMetrics(metrics, targetCount);
  return mergePrioritizedKeywordMetrics([strict, utility, recovered], targetCount);
}

function keywordAlreadyHasIntentSuffix(keyword: string, intent: string): boolean {
  const clean = normalizeKeyword(keyword).replace(/\s+/g, '');
  const suffix = normalizeKeyword(intent).replace(/\s+/g, '');
  return Boolean(clean && suffix && clean.endsWith(suffix));
}

const FALLBACK_INTENT_FRAGMENT_RE = /(추천|후기|가격|비교|순위|사용법|주의사항|전기세|전기요금|용량|청소|렌탈|할인|구매처|가성비|소음|설치|신청|조건|총정리|리뷰|최신|오늘|이번주|체크리스트|필터\s*교체)/gu;
const FALLBACK_LOW_SIGNAL_CHAIN_RE = /(?:^|\s)(20\d{2})\s+\1(?:\s|$)|(?:최신|오늘|이번주|추천|후기|리뷰|비교|가격|설치|용량)\s+\1/u;

function hasRepeatedFallbackToken(keyword: string): boolean {
  const tokens = normalizeKeyword(keyword)
    .split(/\s+/)
    .map((token) => token.replace(/[^\dA-Za-z가-힣]/g, '').trim())
    .filter((token) => token.length >= 2);
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function measuredFallbackIntentFragmentCount(keyword: string): number {
  const hits = normalizeKeyword(keyword).match(FALLBACK_INTENT_FRAGMENT_RE) || [];
  return new Set(hits.map((hit) => hit.replace(/\s+/g, ''))).size;
}

function isMeasuredFallbackCandidateUseful(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || FALLBACK_LOW_SIGNAL_CHAIN_RE.test(clean)) return false;
  if (hasRepeatedFallbackToken(clean)) return false;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const fragmentCount = measuredFallbackIntentFragmentCount(clean);
  if (fragmentCount >= 4) return false;
  if (tokenCount >= 6 && fragmentCount >= 3) return false;
  return true;
}

function isAutoDiscoveryPlaceholderKeyword(keyword: string): boolean {
  return /^(?:쇼핑\s*)?자동\s*발굴(?:\s|$)/.test(normalizeKeyword(keyword));
}

function isNaverMateAutoDiscoverySeed(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  const key = compactKeyword(clean);
  return !clean
    || isAutoDiscoveryPlaceholderKeyword(clean)
    || key === compactKeyword('\uC790\uB3D9 \uBC1C\uAD74')
    || key === compactKeyword('\uC790\uB3D9\uBC1C\uAD74')
    || key === compactKeyword('오늘 실시간 이슈')
    || key === compactKeyword('오늘 이슈')
    || key === compactKeyword('실시간 이슈');
}

function isKinAnswerDemandKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || clean.length < 3) return false;
  return /(방법|가능|되나요|인가요|어떻게|왜|무엇|차이|조건|자격|대상|신청|조회|지급일|원인|증상|해결|비용|가격|후기|주의사항|정리|궁금|질문|비교|할까|해야|받는법|하는법)/.test(clean);
}

function isKinAnswerDemandMetric(metric: MobileKeywordMetric): boolean {
  const marker = [
    metric.keyword,
    metric.source,
    metric.intent,
    metric.category,
    ...(Array.isArray(metric.evidence) ? metric.evidence : []),
  ].join(' ');
  return /(kin|지식인|question|qna|qa)/i.test(marker)
    || isKinAnswerDemandKeyword(metric.keyword);
}

function uniqueKeywords(values: string[], limit = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const keyword = normalizeKeyword(value);
    const key = compactKeyword(keyword);
    if (!keyword || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= limit) break;
  }
  return out;
}

async function buildMeasuredIntentFallbackFromSeeds(
  seeds: string[],
  limit: number,
  source: string,
  intent: string,
  category: string,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  const isShoppingFallback = /shopping/i.test(source) || category === 'shopping';
  const cleanSeeds = uniqueKeywords(
    seeds
      .map(seed => normalizeKeyword(seed))
      .filter(seed => seed && !isAutoDiscoveryPlaceholderKeyword(seed)),
    isShoppingFallback
      ? Math.min(60, Math.max(30, limit * 4))
      : Math.min(24, Math.max(1, limit * 2)),
  );
  const collected: MobileKeywordMetric[] = [];
  const activeSeedLimit = isShoppingFallback
    ? Math.min(cleanSeeds.length, Math.max(12, Math.ceil(limit * 0.8)))
    : Math.min(cleanSeeds.length, Math.max(6, Math.ceil(limit / 2)));
  const perSeedLimit = isShoppingFallback
    ? Math.max(4, Math.ceil(limit / Math.max(1, activeSeedLimit)) + 3)
    : Math.max(2, Math.ceil(limit / Math.max(1, activeSeedLimit)) + 1);
  const targetMeasuredCount = isShoppingFallback
    ? Math.min(120, Math.max(limit * 3, limit))
    : limit;
  for (const seed of cleanSeeds.slice(0, activeSeedLimit)) {
    const measured = await buildMeasuredIntentFallback(
      seed,
      perSeedLimit,
      source,
      intent,
      category,
      context,
      measureKeywordMetrics,
    );
    collected.push(...measured);
    if (strictFullyMeasuredMetrics(collected, targetMeasuredCount).length >= targetMeasuredCount) break;
  }
  return strictFullyMeasuredMetrics(collected, targetMeasuredCount);
}

function isQuotaLimitError(err: unknown): boolean {
  const message = String((err as any)?.message || err || '').toLowerCase();
  return message.includes('quota') || message.includes('limit exceeded') || message.includes('쿼리 한도') || message.includes('429');
}

function normalizeGoldenDiscoveryResult(
  result: MobileKeywordResult,
  targetCount: number,
): MobileKeywordResult {
  const ranked = rankGoldenDiscoveryResults(
    result.keywords,
    targetCount,
    false,
    {
      honorRequestedLimit: true,
      diversifySimilarIntents: true,
      maxSimilarPerCluster: targetCount > 30 ? 6 : 2,
      strictVisibleSssOnly: true,
      requireActionableIntent: true,
      qualityBackfillToTarget: true,
    },
  );
  return {
    ...result,
    keywords: ranked,
    summary: {
      ...result.summary,
      total: ranked.length,
      sss: countSss(ranked),
      measured: ranked.filter((item) => item.isMeasured).length,
    },
  };
}

function mergeCoverageMetrics(
  coverage: MobileKeywordMetric[],
  ranked: MobileKeywordMetric[],
  limit: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  const out: MobileKeywordMetric[] = [];
  for (const item of [...coverage, ...ranked]) {
    const key = compactKeyword(item.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const KNOWN_INTENT_SUFFIXES = [
    '신청방법', '신청 방법', '신청자격', '자격', '대상', '혜택', '서류', '기간', '마감', '조회', '확인',
    '지급일', '지급 일', '금액', '지원금액', '필요서류', '온라인 신청', '정부24 신청', '결과 조회',
    '선정 기준', '소득 기준', '중복 지원', '제외 대상', '제외대상', '대상자', '신청기간', '신청 기간',
    '마감일', '이의신청', '사용처', '가맹점', '잔액', '잔액조회', '온라인', '오프라인',
    '피해 확인', '피해 조회', '보상', '대처', '예방법', '해결', '방법', '후기', '가격', '추천',
    '비교', '순위', '사용법', '주의사항', '전기세', '전기요금', '용량', '청소', '렌탈', '할인',
    '구매처', '가성비', '소음', '설치', '조건', '총정리', '리뷰', '최신', '오늘', '이번주',
    '체크리스트', '필터 교체',
  ];

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownIntent(seed: string): string {
  let out = normalizeKeyword(seed);
  const intents = [...KNOWN_INTENT_SUFFIXES]
    .sort((a, b) => compactKeyword(b).length - compactKeyword(a).length);
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    for (const intent of intents) {
      const pattern = new RegExp(`\\s*${escapeRegExpLiteral(intent).replace(/\s+/g, '\\s*')}$`, 'iu');
      out = out.replace(pattern, '').trim();
    }
    if (out === before) break;
  }
  return out || normalizeKeyword(seed);
}

function hasDuplicatedKnownIntentChain(seedKeyword: string, candidateKeyword: string): boolean {
  const seed = normalizeKeyword(seedKeyword);
  const candidate = normalizeKeyword(candidateKeyword);
  const root = stripKnownIntent(seed);
  const seedKey = compactKeyword(seed);
  const rootKey = compactKeyword(root);
  const candidateKey = compactKeyword(candidate);
  if (!seedKey || !rootKey || !candidateKey || candidateKey === seedKey || candidateKey === rootKey) return false;
  if (seedKey !== rootKey && candidateKey.startsWith(seedKey)) return true;
  if (!candidateKey.startsWith(rootKey)) return false;
  let tailKey = candidateKey.slice(rootKey.length);
  if (!tailKey) return false;
  let hits = 0;
  const intentKeys = Array.from(new Set(KNOWN_INTENT_SUFFIXES.map(compactKeyword).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  for (const intentKey of intentKeys) {
    if (intentKey && tailKey.includes(intentKey)) {
      hits += 1;
      tailKey = tailKey.replace(intentKey, '');
    }
    if (hits >= 2) return true;
  }
  return false;
}

function inferCleanIntentDomain(seed: string): 'policy' | 'incident' | 'entertainment' | 'commerce' | 'generic' {
  const compacted = compactKeyword(seed);
  if (/지원금|보조금|급여|수당|환급|바우처|정책|정부24|복지|청년|소상공인|근로장려금|실업급여/.test(compacted)) {
    return 'policy';
  }
  if (/정보유출|개인정보|해킹|피싱|유출|침해|보안|사고|먹통|장애|환불|피해/.test(compacted)) {
    return 'incident';
  }
  if (/아이돌|컴백|콘서트|드라마|예능|배우|가수|스타|연예인|공연|열애|앨범|팬미팅/.test(compacted)) {
    return 'entertainment';
  }
  if (/가격|추천|후기|비교|구매|할인|쿠폰|제품|신발|영양제|화장품|의류/.test(compacted)) {
    return 'commerce';
  }
  return 'generic';
}

const CLEAN_INTENTS: Record<ReturnType<typeof inferCleanIntentDomain>, string[]> = {
  policy: [
    '신청방법', '신청자격', '대상자', '지원금액', '지급일', '신청기간', '마감일',
    '필요서류', '온라인 신청', '정부24 신청', '결과 조회', '선정 기준', '소득 기준',
    '중복 지원', '제외 대상', '지자체 신청', '문의처', '변경사항', '최신 공고',
    '2026 기준', '자주 묻는 질문', '주의사항', '신청 실패 이유', '대체 지원금',
  ],
  incident: [
    '피해 확인', '피해 조회', '대상자 확인', '보상 기준', '환불 방법', '공지 확인',
    '개인정보 확인', '비밀번호 변경', '계정 보호', '2차 피해 예방', '스미싱 주의',
    '고객센터', '대처 방법', '신고 방법', '본인 확인', '타임라인', '최신 공지',
    '보안 점검', '명의도용 확인', '카드 정지', '이용자 보상', 'FAQ', '주의사항',
  ],
  entertainment: [
    '컴백 일정', '신곡 공개', '앨범 예약', '티저 공개', '뮤직비디오', '일정',
    '콘서트 일정', '예매 방법', '티켓팅 일정', '방송 시간', '출연진', '다시보기',
    '공식입장', '소속사 입장', '공항패션', '무대 영상', '세트리스트', '굿즈',
    '프로필', '나이', '인스타', '근황', '반응 정리', '일정 정리',
  ],
  commerce: [
    '추천', '후기', '가격', '비교', '순위', '할인', '쿠폰', '장단점', '사용법',
    '사이즈', '성분', '효능', '부작용', '관리법', '구매처', '최저가', '대체품',
    '가성비', '주의사항', '실사용 후기', '선택 기준',
  ],
  generic: [
    '방법', '확인', '조회', '자격', '대상', '혜택', '주의사항', '정리', '최신',
    '문제', '해결', '원인', '기간', '일정', '서류', '신청', '비교', 'FAQ',
    '체크리스트', '여부', '대처', '가이드', '핵심 정리', '질문',
  ],
};

function buildCleanIntentCandidates(seed: string, limit: number): string[] {
  const base = stripKnownIntent(seed);
  const domain = inferCleanIntentDomain(seed);
  const intents = [
    ...CLEAN_INTENTS[domain],
    ...CLEAN_INTENTS.generic,
  ];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const intent of intents) {
    const keyword = `${base} ${intent}`.replace(/\s+/g, ' ').trim();
    const key = compactKeyword(keyword);
    if (!key || seen.has(key)) continue;
    if (/[?]{2,}/.test(keyword)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= limit) break;
  }

  return out;
}

function asGoldenParams(params: unknown): GoldenDiscoveryMobileParams {
  const payload = (params || {}) as Partial<GoldenDiscoveryMobileParams>;
  const mode = payload.mode === 'bulk' ? 'bulk' : 'precision';
  const floor = mode === 'bulk' ? 60 : 30;
  const targetCount = clampInt(payload.targetCount, floor, floor, 250);
  return {
    ...copyAgentAwareParams(payload),
    categoryId: normalizeKeyword(payload.categoryId) || 'all',
    mode,
    seedKeyword: payload.seedKeyword ? normalizeKeyword(payload.seedKeyword) : undefined,
    targetCount,
    requireSssFloor: payload.requireSssFloor !== false,
  };
}

function asProTrafficParams(params: unknown): ProTrafficMobileParams {
  const payload = (params || {}) as Partial<ProTrafficMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    categoryId: normalizeKeyword(payload.categoryId) || 'all',
    targetCount: clampInt(payload.targetCount, 30, 1, 250),
    seedKeyword: payload.seedKeyword ? normalizeKeyword(payload.seedKeyword) : undefined,
    autoDiscovery: payload.autoDiscovery === true,
    includeSeasonal: payload.includeSeasonal !== false,
    includeEvergreen: payload.includeEvergreen !== false,
    includeFreshIssue: payload.includeFreshIssue !== false,
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function asHomeBoardParams(params: unknown): HomeBoardMobileParams {
  const payload = (params || {}) as Partial<HomeBoardMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    categoryId: normalizeKeyword(payload.categoryId) || 'general',
    seedKeyword: payload.seedKeyword ? normalizeKeyword(payload.seedKeyword) : undefined,
    targetCount: clampInt(payload.targetCount, HOME_HUNTER_MIN_SPLUS_RESULTS, HOME_HUNTER_MIN_SPLUS_RESULTS, 250),
    requireSplusFloor: payload.requireSplusFloor !== false,
  };
}

function asKinHiddenHoneyParams(params: unknown): KinHiddenHoneyMobileParams {
  const payload = (params || {}) as Partial<KinHiddenHoneyMobileParams>;
  const tab = payload.tabType === 'latest' || payload.tabType === 'trending' || payload.tabType === 'hidden'
    ? payload.tabType
    : 'popular';
  return {
    ...copyAgentAwareParams(payload),
    tabType: tab,
    targetCount: clampInt(payload.targetCount, 15, 1, 100),
    isPremiumRequest: payload.isPremiumRequest === true || tab === 'trending' || tab === 'hidden',
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function asShoppingConnectParams(params: unknown): ShoppingConnectMobileParams {
  const payload = (params || {}) as Partial<ShoppingConnectMobileParams>;
  const sort = payload.sort === 'date' || payload.sort === 'asc' || payload.sort === 'dsc'
    ? payload.sort
    : 'sim';
  return {
    ...copyAgentAwareParams(payload),
    keyword: normalizeKeyword(payload.keyword),
    targetCount: clampInt(payload.targetCount, 30, 30, 80),
    sort,
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function asYoutubeGoldenParams(params: unknown): YoutubeGoldenMobileParams {
  const payload = (params || {}) as Partial<YoutubeGoldenMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    maxResults: clampInt(payload.maxResults, 50, 10, 100),
    categoryId: payload.categoryId ? normalizeKeyword(payload.categoryId) : undefined,
    crossReferenceNaver: payload.crossReferenceNaver !== false,
  };
}

function asNaverMateParams(params: unknown): NaverMateMobileParams {
  const payload = (params || {}) as Partial<NaverMateMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    seedKeyword: normalizeKeyword(payload.seedKeyword),
    targetCount: clampInt(payload.targetCount, 50, 1, 120),
    includeAutocomplete: payload.includeAutocomplete !== false,
    includeRelated: payload.includeRelated !== false,
    includeVolumeMetrics: payload.includeVolumeMetrics !== false,
    autoDiscovery: payload.autoDiscovery === true,
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function asKeywordAnalysisParams(params: unknown): KeywordAnalysisMobileParams {
  const payload = (params || {}) as Partial<KeywordAnalysisMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    keyword: normalizeKeyword(payload.keyword),
    categoryId: payload.categoryId ? normalizeKeyword(payload.categoryId) : undefined,
    maxRelatedCount: clampInt(payload.maxRelatedCount, 10, 1, 250),
    includeMindmapPreview: payload.includeMindmapPreview !== false,
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function defaultSeedForHomeCategory(categoryId: string): string {
  const category = compactKeyword(categoryId);
  if (/policy|support|subsidy|지원|정책|복지/.test(category)) return '소상공인 지원금';
  if (/celebrity|entertainment|star|연예|스타|문화/.test(category)) return '아이돌 컴백 일정';
  if (/finance|재테크|투자/.test(category)) return '청년도약계좌';
  if (/living|interior|생활|인테리어/.test(category)) return '장마철 빨래 냄새';
  if (/health|건강/.test(category)) return '여름 면역력 관리';
  if (/travel|여행/.test(category)) return '6월 가족 여행';
  if (/it|digital|디지털/.test(category)) return '스마트폰 보안 설정';
  return '이번 주 생활 지원 정보';
}

function asMindmapParams(params: unknown): MindmapExpansionMobileParams {
  const payload = (params || {}) as Partial<MindmapExpansionMobileParams>;
  return {
    ...copyAgentAwareParams(payload),
    seedKeyword: normalizeKeyword(payload.seedKeyword),
    depth: clampInt(payload.depth, 1, 1, 3),
    targetCount: clampInt(payload.targetCount, 50, 1, 250),
    includeVolumeMetrics: payload.includeVolumeMetrics !== false,
    contextKeywords: normalizeContextKeywords(payload.contextKeywords),
  };
}

function defaultEnvConfig(): Partial<EnvConfig> {
  return EnvironmentManager.getInstance().getConfig();
}

type JobApiCredentialKey =
  | 'naverClientId'
  | 'naverClientSecret'
  | 'naverSearchAdAccessLicense'
  | 'naverSearchAdSecretKey'
  | 'naverSearchAdCustomerId'
  | 'youtubeApiKey'
  | 'anthropicApiKey'
  | 'manusApiKey'
  | 'openaiApiKey';

const JOB_API_CREDENTIAL_KEYS: JobApiCredentialKey[] = [
  'naverClientId',
  'naverClientSecret',
  'naverSearchAdAccessLicense',
  'naverSearchAdSecretKey',
  'naverSearchAdCustomerId',
  'youtubeApiKey',
  'anthropicApiKey',
  'manusApiKey',
  'openaiApiKey',
];

function extractJobApiCredentials(params: unknown): Partial<EnvConfig> {
  const rawParams = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const rawCredentials = rawParams.apiCredentials && typeof rawParams.apiCredentials === 'object'
    ? rawParams.apiCredentials as Record<string, unknown>
    : {};
  const out: Partial<EnvConfig> = {};
  for (const key of JOB_API_CREDENTIAL_KEYS) {
    const value = normalizeKeyword(rawCredentials[key]);
    if (value) out[key] = value;
  }
  return out;
}

function mergeJobApiCredentials(base: Partial<EnvConfig>, params: unknown): Partial<EnvConfig> {
  const credentials = extractJobApiCredentials(params);
  return Object.keys(credentials).length ? { ...base, ...credentials } : base;
}

function envValue(env: Partial<EnvConfig>, key: keyof EnvConfig, ...envNames: string[]): string {
  const configured = normalizeKeyword(env[key] || '');
  if (configured) return configured;
  for (const name of envNames) {
    const value = normalizeKeyword(process.env[name]);
    if (value) return value;
  }
  return '';
}

type LiveExpansionCandidate = {
  keyword: string;
  sources: string[];
  source: string;
  freq: number;
  monthlyVolume?: number;
};

function normalizeContextKeywords(
  input: unknown,
): MobileKeywordContextCandidate[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: MobileKeywordContextCandidate[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const row = item && typeof item === 'object'
      ? item as MobileKeywordContextCandidate
      : { keyword: String(item || '') };
    const keyword = normalizeKeyword(row.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      keyword,
      pcSearchVolume: finiteNumber(row.pcSearchVolume),
      mobileSearchVolume: finiteNumber(row.mobileSearchVolume),
      totalSearchVolume: finiteNumber(row.totalSearchVolume),
      documentCount: finiteNumber(row.documentCount),
      goldenRatio: finiteNumber(row.goldenRatio),
      source: normalizeKeyword(row.source || ''),
      evidence: Array.isArray(row.evidence)
        ? row.evidence.map((value) => normalizeKeyword(value)).filter(Boolean).slice(0, 8)
        : [],
      isMeasured: row.isMeasured === true,
    });
    if (out.length >= 120) break;
  }
  return out.length ? out : undefined;
}

function contextExpansionCandidates(
  seed: string,
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  limit: number,
): LiveExpansionCandidate[] {
  const seedKey = compactKeyword(seed);
  const out: LiveExpansionCandidate[] = [];
  const seen = new Set<string>();
  for (const row of contextKeywords || []) {
    const keyword = normalizeKeyword(row.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key || key === seedKey || seen.has(key)) continue;
    seen.add(key);
    const pc = finiteNumber(row.pcSearchVolume);
    const mobile = finiteNumber(row.mobileSearchVolume);
    const total = finiteNumber(row.totalSearchVolume)
      ?? ((pc !== null || mobile !== null) ? (pc || 0) + (mobile || 0) : null);
    const sources = [
      'web-analysis-context',
      normalizeKeyword(row.source || ''),
      ...(Array.isArray(row.evidence) ? row.evidence : []),
    ].filter(Boolean);
    out.push({
      keyword,
      sources: Array.from(new Set(sources)),
      source: 'web-analysis-context',
      freq: row.isMeasured ? 4 : 2,
      monthlyVolume: total !== null && total > 0 ? total : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function contextSeedKeywords(
  seedKeyword: string | undefined,
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (keyword: string) => {
    const normalized = normalizeKeyword(keyword);
    const key = compactKeyword(normalized);
    if (!normalized || !key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };
  if (seedKeyword) push(seedKeyword);
  contextExpansionCandidates(seedKeyword || '', contextKeywords, Math.max(limit, 1))
    .sort((a, b) => (b.freq - a.freq) || ((b.monthlyVolume || 0) - (a.monthlyVolume || 0)))
    .forEach((item) => push(item.keyword));
  return out.slice(0, Math.max(limit, 1));
}

type MindmapSemanticDomain =
  | 'coach-transition'
  | 'sports-coach'
  | 'public-issue'
  | 'policy-benefit'
  | 'product-shopping'
  | 'entertainment'
  | 'event-schedule';

function mindmapSemanticCorpus(seedKeyword: string, contextKeywords?: MobileKeywordContextCandidate[]): string {
  return [
    seedKeyword || '',
    ...(contextKeywords || []).slice(0, 80).flatMap((item) => [
      item.keyword || '',
      item.source || '',
      ...(Array.isArray(item.evidence) ? item.evidence : []),
    ]),
  ].join(' ');
}

function inferMindmapSubject(seedKeyword: string): { subject: string; entity: string } {
  const original = normalizeKeyword(seedKeyword);
  const seed = stripKnownIntent(original);
  const roleMatch = seed.match(/([\uAC00-\uD7A3]{2,8})\s*(감독|대표|회장|의원|장관|후보|선수|배우|가수|작가|교수|총장|시장|지사)/u);
  if (roleMatch?.[1] && roleMatch?.[2]) {
    return {
      subject: `${roleMatch[1]} ${roleMatch[2]}`,
      entity: roleMatch[1],
    };
  }
  const orgMatch = seed.match(/([\uAC00-\uD7A3A-Za-z0-9]{2,20}(?:협회|위원회|공단|공사|정부|교육청|구청|시청|도청|대학교|병원|기업|그룹|구단|연맹))/u);
  if (orgMatch?.[1]) return { subject: orgMatch[1], entity: orgMatch[1] };
  return {
    subject: seed || original,
    entity: seed.replace(/\s*(사퇴|논란|의혹|사건|전말|후보|일정|조회|신청|후기|추천).*$/u, '').trim() || seed || original,
  };
}

function inferMindmapSemanticDomains(seedKeyword: string, contextKeywords?: MobileKeywordContextCandidate[]): MindmapSemanticDomain[] {
  const corpus = mindmapSemanticCorpus(seedKeyword, contextKeywords);
  const compact = compactKeyword(corpus);
  const domains: MindmapSemanticDomain[] = [];
  const add = (domain: MindmapSemanticDomain) => {
    if (!domains.includes(domain)) domains.push(domain);
  };
  const hasCoachTransition = /(?:감독|사령탑)/u.test(corpus)
    && /(?:사퇴|선임|후임|경질|교체|후보|논란|책임|전술|명단)/u.test(corpus);
  if (hasCoachTransition) add('coach-transition');
  if (hasCoachTransition
    && /(?:축구|국가대표|대표팀|대한축구협회|축구협회|KFA|월드컵|A매치|선수기용)/i.test(corpus)) {
    add('sports-coach');
  }
  if (/(?:사퇴|논란|의혹|비리|수사|고소|폭로|해명|입장문|책임론|징계|해임|전말|타임라인|선임|경질)/u.test(corpus)) {
    add('public-issue');
  }
  if (/(?:지원금|장려금|급여|수당|환급|복지|정책|신청|지급일|대상|자격|조건|서류|청년|근로|육아|기초연금|바우처)/u.test(corpus)) {
    add('policy-benefit');
  }
  if (/(?:가격|후기|추천|비교|구매|할인|제품|상품|쇼핑|쿠팡|네이버쇼핑|영양제|화장품|가전|노트북|휴대폰|아이폰|갤럭시|에어컨|공기청정기)/u.test(corpus)) {
    add('product-shopping');
  }
  if (/(?:드라마|영화|예능|넷플릭스|디즈니|티빙|출연진|몇부작|결말|원작|시즌|방송|가수|아이돌|배우|웹툰|공연|콘서트)/u.test(corpus)) {
    add('entertainment');
  }
  if (/(?:일정|발표|접수|예약|예매|시험|등급컷|모의고사|수능|합격|발표일|회차|당첨|추첨|대진표|경기시간|중계)/u.test(corpus)
    || /(?:등급컷|모의고사|회차|당첨번호|경기일정|중계일정)/u.test(compact)) {
    add('event-schedule');
  }
  return domains;
}

function buildMindmapEvidenceIssueBranches(
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  limit: number,
): string[] {
  const rows = (contextKeywords || []).slice(0, 80).flatMap((item) => [
    item.keyword || '',
    ...(Array.isArray(item.evidence) ? item.evidence : []),
  ]).map(normalizeKeyword).filter(Boolean);
  const out: string[] = [];
  const push = (value: string) => {
    const keyword = normalizeKeyword(value);
    if (keyword) out.push(keyword);
  };
  for (const row of rows) {
    const compact = compactKeyword(row);
    if (!/(축구|대표팀|국가대표|감독|선수|교체|투입|선발|결장|출전|항의|요청|전술)/u.test(row)) continue;
    const names = Array.from(row.matchAll(/[\uAC00-\uD7A3]{2,4}/gu))
      .map((match) => match[0])
      .filter((name) => !/^(?:축구|대표|국가|감독|선수|교체|투입|선발|결장|출전|항의|요청|전술|논란|협회|대한|과정|후보|다음|후임|사퇴|이유|장면)$/.test(name));
    const uniqueNames = uniqueKeywords(names, 4);
    if (uniqueNames.length >= 2 && /(투입|요청|선발|기용)/u.test(row)) {
      push(`${uniqueNames[0]} ${uniqueNames[1]} 투입 요청`);
      push(`${uniqueNames[0]} ${uniqueNames[1]} 선발 논란`);
    }
    for (const name of uniqueNames) {
      if (/(교체|항의|소리|분노)/u.test(row) || compact.includes(`${compactKeyword(name)}교체`)) push(`${name} 교체 항의`);
      if (/(결장|불참|부상|출전)/u.test(row)) push(`${name} 결장 이유`);
      if (/(전술|포지션|기용)/u.test(row)) push(`${name} 기용 논란`);
    }
    if (out.length >= limit) break;
  }
  return uniqueKeywords(out, limit);
}

function appendMindmapBranchSuffix(baseKeyword: string, suffix: string): string {
  const base = stripKnownIntent(baseKeyword);
  const cleanSuffix = normalizeKeyword(suffix);
  if (!base || !cleanSuffix) return base || cleanSuffix;
  const baseKey = compactKeyword(base);
  const suffixKey = compactKeyword(cleanSuffix);
  if (!suffixKey || baseKey.endsWith(suffixKey)) return base;
  return `${base} ${cleanSuffix}`;
}

function buildMindmapSemanticBridgeRoots(
  seedKeyword: string,
  contextKeywords?: MobileKeywordContextCandidate[],
  limit = 32,
): string[] {
  const rawSeed = normalizeKeyword(seedKeyword);
  const seed = stripKnownIntent(rawSeed);
  if (!seed) return [];
  const { subject, entity } = inferMindmapSubject(seed);
  const domains = inferMindmapSemanticDomains(seed, contextKeywords);
  if (domains.length === 0) return [];
  const values = [
    ...(domains.includes('coach-transition') ? [
      `${subject} 다음 감독 후보`,
      `${subject} 후임 감독 후보`,
      `${subject} 선임 과정`,
      `${subject} 선임 논란`,
      `${entity} 사퇴 이유`,
      `${entity} 사퇴 입장문`,
      `${subject} 전술 논란`,
      `${subject} 선수 기용 논란`,
    ] : []),
    ...(domains.includes('sports-coach') ? [
      `대한축구협회 ${subject} 선임`,
      '대한축구협회 감독 선임 과정',
      '대한축구협회 비리 전말',
      '축구대표팀 선수 기용 논란',
      '대한축구협회 책임론',
      '국가대표 감독 후보',
      '축구대표팀 후임 감독 후보',
    ] : []),
    ...buildMindmapEvidenceIssueBranches(contextKeywords, 12),
    ...(domains.includes('public-issue') ? [
      `${entity} 전말`,
      `${entity} 타임라인`,
      `${entity} 핵심 쟁점`,
      `${entity} 책임론`,
      `${entity} 해명`,
      `${entity} 입장문`,
      `${entity} 후속 조치`,
    ] : []),
    ...(domains.includes('policy-benefit') ? [
      appendMindmapBranchSuffix(seed, '대상'),
      appendMindmapBranchSuffix(seed, '신청방법'),
      appendMindmapBranchSuffix(seed, '지급일'),
      appendMindmapBranchSuffix(seed, '자격조건'),
      appendMindmapBranchSuffix(seed, '필요서류'),
      appendMindmapBranchSuffix(seed, '조회'),
      appendMindmapBranchSuffix(seed, '제외대상'),
      appendMindmapBranchSuffix(seed, '지역별'),
    ] : []),
    ...(domains.includes('product-shopping') ? [
      appendMindmapBranchSuffix(seed, '후기'),
      appendMindmapBranchSuffix(seed, '가격'),
      appendMindmapBranchSuffix(seed, '비교'),
      appendMindmapBranchSuffix(seed, '단점'),
      appendMindmapBranchSuffix(seed, '부작용'),
      appendMindmapBranchSuffix(seed, '내돈내산'),
      appendMindmapBranchSuffix(seed, '대체품'),
      appendMindmapBranchSuffix(seed, '사용법'),
    ] : []),
    ...(domains.includes('entertainment') ? [
      appendMindmapBranchSuffix(seed, '출연진'),
      appendMindmapBranchSuffix(seed, '몇부작'),
      appendMindmapBranchSuffix(seed, '결말'),
      appendMindmapBranchSuffix(seed, '원작'),
      appendMindmapBranchSuffix(seed, '촬영지'),
      appendMindmapBranchSuffix(seed, '등장인물'),
      appendMindmapBranchSuffix(seed, '시즌2'),
    ] : []),
    ...(domains.includes('event-schedule') ? [
      appendMindmapBranchSuffix(seed, '일정'),
      appendMindmapBranchSuffix(seed, '발표'),
      appendMindmapBranchSuffix(seed, '확인방법'),
      appendMindmapBranchSuffix(seed, '준비물'),
      appendMindmapBranchSuffix(seed, '신청'),
      appendMindmapBranchSuffix(seed, '결과'),
    ] : []),
  ];
  return uniqueKeywords(values.filter(Boolean), limit)
    .filter((keyword) => compactKeyword(keyword) !== compactKeyword(seed))
    .filter((keyword) => compactKeyword(keyword) !== compactKeyword(rawSeed))
    .filter((keyword) => !hasDuplicatedKnownIntentChain(rawSeed, keyword));
}

function buildMindmapSemanticBridgeCandidates(
  seedKeyword: string,
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  limit: number,
): LiveExpansionCandidate[] {
  return buildMindmapSemanticBridgeRoots(seedKeyword, contextKeywords, limit).map((keyword, index) => ({
    keyword,
    source: 'mindmap-semantic-bridge',
    sources: ['mindmap-semantic-bridge'],
    freq: Math.max(8, 18 - index),
  }));
}

function proTrafficContextSeedKeywords(
  params: ProTrafficMobileParams,
  limit: number,
): string[] {
  return contextSeedKeywords(params.seedKeyword, params.contextKeywords, limit);
}

function defaultProTrafficDiscoveryRoots(categoryId: string): string[] {
  const category = compactKeyword(categoryId);
  if (/policy|support|subsidy/.test(category)) {
    return [
      '청년미래적금 신청 대상',
      '근로장려금 지급일 조회',
      '자녀장려금 지급일 조회',
      '소상공인 환급금 조회',
      '기초연금 수급자격',
      '첫만남이용권 신청',
      '에너지바우처 신청 대상',
      '국민연금 반환일시금 대상',
    ];
  }
  if (/shopping/.test(category)) {
    return [
      '여름 선크림 추천 후기',
      '공기청정기 필터 교체',
      '제습기 전기세 비교',
      '무선청소기 가격비교',
      '캠핑 선풍기 추천',
      '장마 제습제 추천',
    ];
  }
  if (/electronics|digital|it/.test(category)) {
    return [
      'AI 영상툴 가격비교',
      '아이폰 배터리 교체 비용',
      '갤럭시 업데이트 오류',
      '공기청정기 필터 교체',
      '무선청소기 가격비교',
      '노트북 배터리 교체 비용',
    ];
  }
  if (/travel/.test(category)) {
    return [
      '송지호 바다하늘길 입장료',
      '제주 렌터카 가격비교',
      '여름휴가 숙소 예약',
      '지역 축제 주차 위치',
      '워터파크 할인 예약',
      '공항 주차 예약',
    ];
  }
  if (/home|living|life/.test(category)) {
    return [
      '에어컨 청소 비용',
      '제습기 전기세 비교',
      '공기청정기 필터 교체',
      '장마 준비물 체크리스트',
      '도어락 배터리 교체',
      '세탁기 통세척 방법',
    ];
  }
  return [
    '청년미래적금 신청 대상',
    '제주 렌터카 가격비교',
    'AI 영상툴 가격비교',
    '여름 선크림 추천 후기',
    '장마 준비물 체크리스트',
    '도수치료 보험 적용 비용',
  ];
}

function isLikelyMeasuredSearchQuery(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || clean.length < 3 || clean.length > 34) return false;
  if (/[?!…]|(?:합니다|드립니다|인가요|할까요|해주세요)/.test(clean)) return false;
  if (/(총정리\s*){2,}|(?:신청|조회|지급일|대상|서류|조건).*(?:신청|조회|지급일|대상|서류|조건).*(?:신청|조회|지급일|대상|서류|조건)/.test(clean)) return false;
  if (/(청년·일반 국민|아동·장애인|조건 최신|조건 공고|공식발표|정책브리핑|접수 공고)/.test(clean)) return false;
  return true;
}

function isStrictAutoDiscoverySearchQuery(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!isLikelyMeasuredSearchQuery(clean)) return false;
  if (/(실사용\s*){2,}|(?:가격|할인)\s*할인\s*정보|구매처\s*실사용\s*후기|추천\s*실사용\s*후기|가격\s*할인\s*정보|할인\s*정보\s*후기/.test(clean)) return false;
  if (/(?:가격|후기|추천|비교|구매처|할인|스펙|출시일).*(?:가격|후기|추천|비교|구매처|할인|스펙|출시일).*(?:가격|후기|추천|비교|구매처|할인|스펙|출시일)/.test(clean)) return false;
  return true;
}

async function buildProTrafficLiveMeasuredMetrics(
  params: ProTrafficMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  const env = defaultEnvConfig();
  const roots = contextSeedKeywords(
    params.seedKeyword,
    params.contextKeywords,
    Math.min(24, Math.max(10, Math.ceil(params.targetCount / 2))),
  );
  for (const root of defaultProTrafficDiscoveryRoots(params.categoryId)) {
    if (!roots.some((item) => compactKeyword(item) === compactKeyword(root))) roots.push(root);
  }
  const selectedRoots = roots
    .filter(params.autoDiscovery === true ? isStrictAutoDiscoverySearchQuery : isLikelyMeasuredSearchQuery)
    .slice(0, params.autoDiscovery === true
      ? Math.min(18, Math.max(8, Math.ceil(params.targetCount / 4)))
      : Math.min(22, Math.max(10, Math.ceil(params.targetCount / 3))));
  if (selectedRoots.length === 0) return [];

  context.progress(18, `collecting ${selectedRoots.length} live autocomplete roots`);
  const candidateRows = await Promise.all(selectedRoots.map((root) =>
    collectLiveExpansionCandidates(
      root,
      Math.min(70, Math.max(24, Math.ceil(params.targetCount * 0.9))),
      env,
      context,
      params.contextKeywords,
    ).catch(() => [] as LiveExpansionCandidate[]),
  ));
  ensureNotAborted(context);

  const seen = new Set<string>();
  const candidates: LiveExpansionCandidate[] = [];
  for (const root of selectedRoots) {
    const key = compactKeyword(root);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      keyword: root,
      source: 'live-root-query',
      sources: ['live-root-query'],
      freq: 6,
    });
  }
  for (const row of candidateRows.flat()) {
    const keyword = normalizeKeyword(row.keyword);
    const key = compactKeyword(keyword);
    if (!key || seen.has(key)) continue;
    if (params.autoDiscovery === true ? !isStrictAutoDiscoverySearchQuery(keyword) : !isLikelyMeasuredSearchQuery(keyword)) continue;
    seen.add(key);
    candidates.push(row);
  }
  candidates.sort((a, b) => (b.freq - a.freq) || ((b.monthlyVolume || 0) - (a.monthlyVolume || 0)));
  const limit = params.autoDiscovery === true
    ? Math.min(220, Math.max(params.targetCount * 5, 120))
    : Math.min(260, Math.max(params.targetCount * 5, 120));
  const metrics = candidates.slice(0, limit).map((item, index) => metricFromExpansion(
    item.keyword,
    Math.max(50, 92 - index * 0.15),
    'live-autocomplete-pro-traffic',
    'live-measured-autocomplete',
    params.categoryId,
    ['live-autocomplete-pro-traffic', ...item.sources].slice(0, 8),
  ));
  if (metrics.length === 0) return [];
  context.progress(36, `measuring ${metrics.length} live autocomplete candidates`);
  return measureKeywordMetrics(metrics, context);
}

async function buildMeasuredContextKeywordMetrics(
  seedKeyword: string | undefined,
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  limit: number,
  source: string,
  intent: string,
  category: string,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  const seeds = contextSeedKeywords(seedKeyword, contextKeywords, limit);
  if (!seeds.length) return [];
  context.progress(70, `measuring ${seeds.length} ${source} web context candidates`);
  const metrics = seeds.map((keyword, index) => metricFromExpansion(
    keyword,
    Math.max(50, 84 - index * 0.65),
    source,
    intent,
    category,
    [source, 'web-analysis-context', seedKeyword ? `seed: ${seedKeyword}` : 'seed: auto'],
  ));
  return measureKeywordMetrics(metrics, context);
}

async function collectLiveExpansionCandidates(
  seed: string,
  limit: number,
  env: Partial<EnvConfig>,
  context: MobileJobExecutorContext,
  contextKeywords?: MobileKeywordContextCandidate[],
  options: { includeSemanticBridge?: boolean } = {},
): Promise<LiveExpansionCandidate[]> {
  const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
  const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
  const contextCandidates = contextExpansionCandidates(seed, contextKeywords, Math.max(limit, 1));
  const issueBridgeCandidates = options.includeSemanticBridge
    ? buildMindmapSemanticBridgeCandidates(seed, contextKeywords, Math.min(32, Math.max(12, limit)))
    : [];

  const config = { clientId, clientSecret };
  const byKey = new Map<string, LiveExpansionCandidate>();
  const add = (keyword: string, source: string, monthlyVolume?: number, freq = 1, sources?: string[]) => {
    const normalized = normalizeKeyword(keyword);
    const key = compactKeyword(normalized);
    if (!normalized || normalized.length < 2 || normalized.length > 42 || !key) return;
    const current = byKey.get(key);
    if (current) {
      current.freq += freq;
      if (!current.sources.includes(source)) current.sources.push(source);
      for (const extra of sources || []) {
        if (extra && !current.sources.includes(extra)) current.sources.push(extra);
      }
      if (typeof monthlyVolume === 'number') current.monthlyVolume = Math.max(current.monthlyVolume || 0, monthlyVolume);
      return;
    }
    byKey.set(key, {
      keyword: normalized,
      sources: Array.from(new Set([source, ...(sources || [])].filter(Boolean))),
      source,
      freq,
      monthlyVolume,
    });
  };

  for (const item of contextCandidates) {
    add(item.keyword, item.source, item.monthlyVolume, item.freq, item.sources);
  }
  for (const item of issueBridgeCandidates) {
    add(item.keyword, item.source, item.monthlyVolume, item.freq, item.sources);
  }

  if (!clientId || !clientSecret) return Array.from(byKey.values()).slice(0, Math.max(limit, 1));

  const liveRoots = uniqueKeywords([
    seed,
    ...(options.includeSemanticBridge ? buildMindmapSemanticBridgeRoots(seed, contextKeywords, 8) : []),
  ], 9);
  const liveRows = await Promise.allSettled(liveRoots.map(async (root) => {
    const [autocomplete, related] = await Promise.all([
      import('../utils/naver-autocomplete')
        .then(mod => mod.getNaverAutocompleteKeywords(root, config))
        .catch(() => [] as string[]),
      import('../utils/naver-datalab-api')
        .then(mod => mod.getNaverRelatedKeywords(root, config, { limit: root === seed ? Math.min(80, Math.max(20, limit)) : 30 }))
        .catch(() => [] as Array<{ keyword?: string; searchVolume?: number; monthlyVolume?: number }>),
    ]);
    return { root, autocomplete, related };
  }));
  ensureNotAborted(context);

  for (const rowResult of liveRows) {
    if (rowResult.status !== 'fulfilled') continue;
    const sourcePrefix = rowResult.value.root === seed ? '' : 'mindmap-semantic-';
    for (const keyword of rowResult.value.autocomplete || []) {
      add(keyword, `${sourcePrefix}autocomplete`, undefined, rowResult.value.root === seed ? 1 : 3, [`root:${rowResult.value.root}`]);
    }
    for (const item of rowResult.value.related || []) {
      const row = item as any;
      add(
        String(row?.keyword || ''),
        `${sourcePrefix}naver-relkwd`,
        typeof row?.searchVolume === 'number'
          ? row.searchVolume
          : (typeof row?.monthlyVolume === 'number' ? row.monthlyVolume : undefined),
        rowResult.value.root === seed ? 1 : 3,
        [`root:${rowResult.value.root}`],
      );
    }
  }

  const current = Array.from(byKey.values());
  if (current.length < Math.min(limit, 30)) {
    const secondHopSeeds = current
      .sort((a, b) => (b.freq - a.freq) || ((b.monthlyVolume || 0) - (a.monthlyVolume || 0)))
      .slice(0, Math.min(8, current.length));
    const secondHop = await Promise.allSettled(secondHopSeeds.map((item) =>
      import('../utils/naver-autocomplete')
        .then(mod => mod.getNaverAutocompleteKeywords(item.keyword, config))
        .catch(() => [] as string[])
        .then((keywords) => ({ seed: item.keyword, keywords })),
    ));
    ensureNotAborted(context);
    for (const row of secondHop) {
      if (row.status !== 'fulfilled') continue;
      for (const keyword of row.value.keywords.slice(0, 40)) {
        add(keyword, 'autocomplete-second-hop', undefined, 1, ['autocomplete-second-hop', `seed:${row.value.seed}`]);
      }
    }
  }

  return Array.from(byKey.values()).slice(0, Math.max(limit, 1));
}

function addEvidence(evidence: string[], value: string): string[] {
  return evidence.includes(value) ? evidence : [...evidence, value];
}

async function fetchNaverDocumentCount(
  keyword: string,
  env: Partial<EnvConfig>,
  signal: AbortSignal,
  forceFresh = false,
): Promise<{
  documentCount: number;
  source: 'naver-api';
  confidence: 'high';
  isEstimated: false;
  queryMode: 'broad';
  queryKey: string;
  measuredAt: string;
} | null> {
  const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
  const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  const broadQuery = normalizeNaverBlogBroadQuery(keyword);
  if (!broadQuery) return null;

  // Product-wide SSoT: unquoted Naver Blog OpenAPI total only.
  // Cafe totals are a different corpus and must never be added to the displayed
  // blog document count or the golden ratio.
  const documentCount = await getNaverBlogDocumentCount(broadQuery, {
    config: { clientId, clientSecret },
    signal,
    timeoutMs: 8000,
    forceFresh,
  });
  if (signal.aborted) throw new Error('cancelled');
  if (documentCount === null) return null;
  const cachedMeasurement = peekCachedNaverBlogDocumentCountMeasurement(broadQuery);
  if (!cachedMeasurement || cachedMeasurement.total !== documentCount) return null;
  return {
    documentCount,
    source: 'naver-api',
    confidence: 'high',
    isEstimated: false,
    queryMode: 'broad',
    queryKey: documentCountBroadQueryKey(broadQuery),
    measuredAt: cachedMeasurement.measuredAt,
  };
}

async function fetchNaverDocumentCountMap(
  keywords: string[],
  env: Partial<EnvConfig>,
  context: MobileJobExecutorContext,
  forceFreshQueryKey: string | null = null,
): Promise<Map<string, Awaited<ReturnType<typeof fetchNaverDocumentCount>>>> {
  const out = new Map<string, Awaited<ReturnType<typeof fetchNaverDocumentCount>>>();
  const pending = [...keywords];
  const workerCount = Math.min(2, Math.max(1, pending.length));

  const worker = async () => {
    while (pending.length > 0) {
      ensureNotAborted(context);
      const keyword = pending.shift();
      if (!keyword) continue;
      const queryKey = documentCountBroadQueryKey(keyword);
      const documentCount = await fetchNaverDocumentCount(
        keyword,
        env,
        context.signal,
        Boolean(forceFreshQueryKey && queryKey === forceFreshQueryKey),
      );
      out.set(queryKey, documentCount);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return out;
}

async function fetchSearchAdVolumeMap(
  keywords: string[],
  env: Partial<EnvConfig>,
  context: MobileJobExecutorContext,
): Promise<Map<string, KeywordSearchVolume>> {
  const accessLicense = envValue(env, 'naverSearchAdAccessLicense', 'NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCHAD_ACCESS_LICENSE');
  const secretKey = envValue(env, 'naverSearchAdSecretKey', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCHAD_SECRET_KEY');
  const customerId = envValue(env, 'naverSearchAdCustomerId', 'NAVER_SEARCH_AD_CUSTOMER_ID', 'NAVER_SEARCHAD_CUSTOMER_ID');
  const out = new Map<string, KeywordSearchVolume>();
  if (!accessLicense || !secretKey || !customerId) return out;

  ensureNotAborted(context);
  const volumes = await getNaverSearchAdKeywordVolume({
    accessLicense,
    secretKey,
    customerId,
  }, keywords, { recursive: false });
  ensureNotAborted(context);

  for (const volume of volumes) {
    const key = compactKeyword(volume.keyword);
    if (key) out.set(key, volume);
  }
  return out;
}

export function mergeMeasuredMetric(
  metric: MobileKeywordMetric,
  volume: KeywordSearchVolume | undefined,
  documentMeasurement: Awaited<ReturnType<typeof fetchNaverDocumentCount>> | undefined,
): MobileKeywordMetric {
  const hasExplicitVolumeResult = volume !== undefined;
  const volumePcSearchVolume = finiteNumber(volume?.pcSearchVolume);
  const volumeMobileSearchVolume = finiteNumber(volume?.mobileSearchVolume);
  const volumePcSearchVolumeLt10 = volume?.pcSearchVolumeLt10 === true;
  const volumeMobileSearchVolumeLt10 = volume?.mobileSearchVolumeLt10 === true;
  const volumeHasLessThanTenRange = volumePcSearchVolumeLt10 || volumeMobileSearchVolumeLt10;
  const volumeBindingMetadata = searchAdKeywordBindingMetadata(volume);
  const hasBoundVolumeSplit = !volumeHasLessThanTenRange
    && volumePcSearchVolume !== null
    && volumeMobileSearchVolume !== null
    && volumeBindingMetadata !== null;
  const hasBoundVolumeRange = volumeHasLessThanTenRange
    && volumeBindingMetadata !== null
    && (volumePcSearchVolumeLt10 || volumePcSearchVolume !== null)
    && (volumeMobileSearchVolumeLt10 || volumeMobileSearchVolume !== null);
  const hasAcceptedVolumeMeasurement = hasBoundVolumeSplit || hasBoundVolumeRange;
  const invalidatedVolumeTuple = hasExplicitVolumeResult && !hasAcceptedVolumeMeasurement;
  const metricPcSearchVolumeLt10 = metric.pcSearchVolumeLt10 === true;
  const metricMobileSearchVolumeLt10 = metric.mobileSearchVolumeLt10 === true;
  const metricHasLessThanTenRange = metricPcSearchVolumeLt10 || metricMobileSearchVolumeLt10;
  const metricPcSearchVolume = finiteNumber(metric.pcSearchVolume);
  const metricMobileSearchVolume = finiteNumber(metric.mobileSearchVolume);
  const metricTotalSearchVolume = finiteNumber(metric.totalSearchVolume);
  const metricBindingMetadata = searchAdKeywordBindingMetadata(metric);
  const metricHasConsistentSplit = !metricHasLessThanTenRange
    && metricPcSearchVolume !== null
    && metricMobileSearchVolume !== null
    && metricTotalSearchVolume !== null
    && metricPcSearchVolume + metricMobileSearchVolume === metricTotalSearchVolume;
  const pcSearchVolume = hasBoundVolumeRange
    ? (volumePcSearchVolumeLt10 ? null : volumePcSearchVolume)
    : hasBoundVolumeSplit
      ? volumePcSearchVolume
      : invalidatedVolumeTuple
        ? null
        : metricPcSearchVolumeLt10
          ? null
          : metric.pcSearchVolume;
  const mobileSearchVolume = hasBoundVolumeRange
    ? (volumeMobileSearchVolumeLt10 ? null : volumeMobileSearchVolume)
    : hasBoundVolumeSplit
      ? volumeMobileSearchVolume
      : invalidatedVolumeTuple
        ? null
        : metricMobileSearchVolumeLt10
          ? null
          : metric.mobileSearchVolume;
  const splitTotal = hasBoundVolumeSplit
    ? volumePcSearchVolume + volumeMobileSearchVolume
    : null;
  const totalSearchVolume = hasBoundVolumeSplit
    ? splitTotal
    : hasBoundVolumeRange || invalidatedVolumeTuple || metricHasLessThanTenRange
      ? null
      : metric.totalSearchVolume;
  const pcSearchVolumeLt10 = hasAcceptedVolumeMeasurement
    ? volumePcSearchVolumeLt10
    : invalidatedVolumeTuple
      ? false
      : metricPcSearchVolumeLt10;
  const mobileSearchVolumeLt10 = hasAcceptedVolumeMeasurement
    ? volumeMobileSearchVolumeLt10
    : invalidatedVolumeTuple
      ? false
      : metricMobileSearchVolumeLt10;
  const searchVolumeIsPartial = hasExplicitVolumeResult
    ? hasBoundVolumeRange || (hasBoundVolumeSplit && volume?.svEstimated === true)
    : metricHasLessThanTenRange || metric.isSearchVolumeEstimated === true;
  const newDocumentCandidate: MobileKeywordMetric | null = documentMeasurement
    ? {
      ...metric,
      documentCount: documentMeasurement.documentCount,
      documentCountSource: documentMeasurement.source,
      documentCountConfidence: documentMeasurement.confidence,
      documentCountQueryMode: documentMeasurement.queryMode,
      documentCountQueryKey: documentMeasurement.queryKey,
      documentCountMeasuredAt: documentMeasurement.measuredAt,
      isDocumentCountEstimated: documentMeasurement.isEstimated,
    }
    : null;
  const hasFreshBoundDocumentMeasurement = newDocumentCandidate !== null
    && hasFreshCanonicalDocumentCountMeasurement(newDocumentCandidate);
  const canRetainExistingDocumentMeasurement = documentMeasurement === undefined
    && hasFreshCanonicalDocumentCountMeasurement(metric);
  const resolvedDocumentCount = hasFreshBoundDocumentMeasurement
    ? finiteNumber(documentMeasurement?.documentCount)
    : canRetainExistingDocumentMeasurement
      ? finiteNumber(metric.documentCount)
      : null;
  const cpc = (hasAcceptedVolumeMeasurement ? finiteNumber(volume?.monthlyAveCpc) : null) ?? metric.cpc;
  const goldenRatio = searchVolumeIsPartial || invalidatedVolumeTuple
    ? null
    : ratioFromMetrics(totalSearchVolume, resolvedDocumentCount);
  const searchVolumeSource = hasAcceptedVolumeMeasurement
    ? 'searchad'
    : invalidatedVolumeTuple
      ? undefined
      : metric.searchVolumeSource;
  const searchVolumeConfidence = hasAcceptedVolumeMeasurement
    ? searchVolumeIsPartial ? 'low' : 'high'
    : invalidatedVolumeTuple
      ? undefined
      : metricHasLessThanTenRange ? 'low' : metric.searchVolumeConfidence;
  const isSearchVolumeEstimated = hasAcceptedVolumeMeasurement
    ? searchVolumeIsPartial
    : invalidatedVolumeTuple
      ? undefined
      : metricHasLessThanTenRange || metric.isSearchVolumeEstimated === true;
  const retainedBindingMetadata = hasAcceptedVolumeMeasurement
    ? volumeBindingMetadata
    : invalidatedVolumeTuple
      ? null
      : metricHasConsistentSplit || metricHasLessThanTenRange
        ? metricBindingMetadata
        : null;
  const documentCountSource = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.source
    : canRetainExistingDocumentMeasurement
      ? metric.documentCountSource
      : undefined;
  const documentCountConfidence = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.confidence
    : canRetainExistingDocumentMeasurement
      ? metric.documentCountConfidence
      : undefined;
  const documentCountQueryMode = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.queryMode
    : canRetainExistingDocumentMeasurement
      ? metric.documentCountQueryMode
      : undefined;
  const documentCountQueryKey = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.queryKey
    : canRetainExistingDocumentMeasurement
      ? metric.documentCountQueryKey
      : undefined;
  const documentCountMeasuredAt = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.measuredAt
    : canRetainExistingDocumentMeasurement
      ? metric.documentCountMeasuredAt
      : undefined;
  const isDocumentCountEstimated = hasFreshBoundDocumentMeasurement
    ? documentMeasurement?.isEstimated
    : canRetainExistingDocumentMeasurement
      ? metric.isDocumentCountEstimated === true
      : undefined;
  const invalidatedDocumentTuple = !hasFreshBoundDocumentMeasurement
    && !canRetainExistingDocumentMeasurement
    && (
      finiteNumber(metric.documentCount) !== null
      || documentMeasurement !== undefined
    );
  const derivedInputsChanged = hasExplicitVolumeResult
    || documentMeasurement !== undefined
    || invalidatedDocumentTuple;

  let evidence = metric.evidence;
  if (hasAcceptedVolumeMeasurement) {
    evidence = addEvidence(evidence, 'pc-searchad-volume');
    if (searchVolumeIsPartial) {
      evidence = addEvidence(evidence, 'pc-searchad-volume-estimated');
    }
    if (pcSearchVolumeLt10 || mobileSearchVolumeLt10) {
      evidence = addEvidence(evidence, 'pc-searchad-lt10-range');
    }
  }
  if (invalidatedVolumeTuple) {
    evidence = addEvidence(evidence, 'search-volume-binding-invalidated');
  }
  if (hasFreshBoundDocumentMeasurement && resolvedDocumentCount !== null && resolvedDocumentCount !== metric.documentCount) {
    evidence = addEvidence(evidence, 'pc-naver-blog-document-count');
    evidence = addEvidence(evidence, 'pc-naver-openapi-document-count');
  }
  if (invalidatedDocumentTuple) {
    evidence = addEvidence(evidence, 'document-count-query-binding-invalidated');
  }

  const trustedCandidate: MobileKeywordMetric = {
    ...metric,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount: resolvedDocumentCount,
    goldenRatio,
    cpc,
    grade: resolvedDocumentCount !== null && goldenRatio !== null
      ? measuredGrade(metric.grade, totalSearchVolume, resolvedDocumentCount, goldenRatio)
      : 'C',
    score: derivedInputsChanged ? null : metric.score,
    aiJudge: derivedInputsChanged ? undefined : metric.aiJudge,
    publishDecision: derivedInputsChanged ? undefined : metric.publishDecision,
    rejectReason: derivedInputsChanged ? undefined : metric.rejectReason,
    agentInsight: derivedInputsChanged ? undefined : metric.agentInsight,
    measurementStatus: searchVolumeIsPartial
      ? 'partial'
      : invalidatedVolumeTuple
        ? 'unmeasured'
        : derivedInputsChanged ? undefined : metric.measurementStatus,
    evidence,
    isMeasured: !searchVolumeIsPartial
      && !invalidatedVolumeTuple
      && totalSearchVolume !== null
      && resolvedDocumentCount !== null,
    searchVolumeSource,
    searchVolumeConfidence,
    searchVolumeBindingVersion: retainedBindingMetadata?.searchVolumeBindingVersion,
    searchVolumeMeasuredAt: retainedBindingMetadata?.searchVolumeMeasuredAt,
    isSearchVolumeEstimated,
    pcSearchVolumeLt10,
    mobileSearchVolumeLt10,
    documentCountSource,
    documentCountConfidence,
    documentCountQueryMode,
    documentCountQueryKey,
    documentCountMeasuredAt,
    isDocumentCountEstimated,
  };
  const isMeasured = trustedCandidate.isMeasured
    && hasTrustedSearchVolumeMeasurement(trustedCandidate)
    && hasFreshCanonicalDocumentCountMeasurement(trustedCandidate);
  if (!isMeasured) {
    evidence = addEvidence(evidence, 'metric-measurement-partial-or-unavailable');
  }

  return {
    ...trustedCandidate,
    evidence,
    isMeasured,
  };
}

function shouldMeasureDocumentCount(
  metric: MobileKeywordMetric,
  volume: KeywordSearchVolume | undefined,
): boolean {
  if (metric.intent === 'requested-keyword' || metric.source === 'pc-keyword-analysis-exact') {
    return true;
  }
  if (metric.documentCount !== null && metric.documentCount !== undefined) {
    return !hasFreshCanonicalDocumentCountMeasurement(metric);
  }
  const totalFromVolume = finiteNumber(volume?.totalSearchVolume);
  const pc = finiteNumber(volume?.pcSearchVolume);
  const mobile = finiteNumber(volume?.mobileSearchVolume);
  const splitTotal = pc !== null || mobile !== null ? (pc || 0) + (mobile || 0) : null;
  const total = totalFromVolume ?? splitTotal ?? finiteNumber(metric.totalSearchVolume);
  const measuredProductCandidate = /pc-shopping|pc-kin|pc-pro-traffic|pc-naver-mate|pc-naver-autocomplete|pc-naver-related|pc-youtube|pc-mindmap|mindmap/i.test(String(metric.source || ''));
  if (measuredProductCandidate && total !== null && total > 0) {
    return true;
  }
  return total !== null && total >= 300;
}

function normalizeMindmapSearchPhrase(keyword: string): string {
  return normalizeKeyword(keyword)
    .replace(/#/g, ' ')
    .replace(/[<>{}[\]\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMindmapSearchPhraseCandidate(keyword: string): boolean {
  const clean = normalizeMindmapSearchPhrase(keyword);
  if (!clean || clean.length < 2 || clean.length > 42) return false;
  if (/^[\d\s.,_-]+$/.test(clean)) return false;
  if (/[?]{2,}/.test(clean)) return false;
  if (/[:;!?]/.test(clean)) return false;
  if (MINDMAP_ARTICLE_TITLE_QUERY_RE.test(clean)) return false;
  if (!isMindmapExpansionKeywordCandidate(clean)) return false;
  const tokens = keywordTokens(clean);
  if (tokens.length > 5) return false;
  return SAFE_HANGUL_SEARCH_RE.test(clean);
}

async function buildMeasuredMindmapSeedMetrics(
  seedKeyword: string,
  contextKeywords: MobileKeywordContextCandidate[] | undefined,
  targetCount: number,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordMetric[]> {
  const seedList = contextSeedKeywords(
    seedKeyword,
    contextKeywords,
    Math.min(8, Math.max(2, targetCount)),
  );
  const normalizedSeed = normalizeKeyword(seedKeyword).replace(/\s+/g, ' ').trim();
  const normalizedRoot = stripKnownIntent(normalizedSeed);
  const seedKey = compactKeyword(normalizedSeed);
  const primaryRoots = [
    normalizedSeed,
    normalizedRoot,
    ...buildMindmapSemanticBridgeRoots(normalizedRoot, contextKeywords, 24),
    ...buildMindmapMeasuredQueryRoots(normalizedRoot, 32),
    ...buildSafeMeasuredIntentRoots(normalizedRoot, 24),
    ...buildIntentQueryRoots(normalizedRoot, 8),
  ];
  const contextRoots = seedList
    .filter((seed) => compactKeyword(seed) !== seedKey)
    .flatMap((seed) => [
      seed,
      stripKnownIntent(seed),
      ...buildMindmapSemanticBridgeRoots(stripKnownIntent(seed), contextKeywords, 8),
      ...buildMindmapMeasuredQueryRoots(stripKnownIntent(seed), 8),
      ...buildSafeMeasuredIntentRoots(stripKnownIntent(seed), 10),
      ...buildIntentQueryRoots(stripKnownIntent(seed), 4),
    ]);
  const roots = uniqueKeywords(
    [
      ...primaryRoots,
      ...contextRoots,
    ],
    Math.min(90, Math.max(24, targetCount * 4)),
  ).map(normalizeMindmapSearchPhrase).filter(isMindmapSearchPhraseCandidate);
  const seen = new Set<string>();
  const candidates = roots
    .filter((keyword) => {
      const key = compactKeyword(keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.min(48, Math.max(12, targetCount * 2)))
    .map((keyword, index) => {
      const source = compactKeyword(keyword) === seedKey
        ? 'pc-mindmap-exact-measured-seed'
        : 'pc-mindmap-measured-intent-expansion';
      return metricFromExpansion(
        keyword,
        Math.max(48, 84 - index * 0.6),
        source,
        'mindmap-expansion',
        'auto',
        [source, `seed: ${seedKeyword}`],
      );
    });
  if (!candidates.length) return [];
  context.progress(72, `measuring ${candidates.length} pc-mindmap measured intent candidates`);
  const measured = await measureKeywordMetrics(candidates, context);
  return prioritizeMindmapMeasuredMetrics(measured, targetCount);
}

function isFullyMeasuredKeyword(metric: MobileKeywordMetric): boolean {
  return metric.isMeasured === true
    && metric.totalSearchVolume !== null
    && metric.totalSearchVolume > 0
    && metric.documentCount !== null
    && metric.documentCount > 0
    && hasTrustedSearchVolumeMeasurement(metric)
    && hasFreshCanonicalDocumentCountMeasurement(metric);
}

function strictFullyMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
): MobileKeywordMetric[] {
  return metrics.filter(isFullyMeasuredKeyword).slice(0, targetCount);
}

const LOW_SIGNAL_MINDMAP_KEYWORD_RE = /^(?:\uD65C\uC6A9\s*\uBC29\uBC95|\uC0AC\uC6A9\s*\uBC29\uBC95|\uC815\uB9AC|\uBC29\uBC95|\uC870\uD68C|\uC2E0\uCCAD|\uD655\uC778)$/u;

function isUsefulMindmapMeasuredMetric(metric: MobileKeywordMetric): boolean {
  if (!isFullyMeasuredKeyword(metric)) return false;
  if (LOW_SIGNAL_MINDMAP_KEYWORD_RE.test(normalizeMindmapSearchPhrase(metric.keyword))) return false;
  if (metric.grade === 'C') return false;
  const total = finiteNumber(metric.totalSearchVolume) ?? 0;
  const docs = finiteNumber(metric.documentCount) ?? Number.POSITIVE_INFINITY;
  const ratio = finiteNumber(metric.goldenRatio) ?? 0;
  if (metricGradeRank(metric.grade) <= 0) return false;
  if (total < 30) return false;
  if (docs > 500000 && ratio < 1) return false;
  return true;
}

function prioritizeMindmapMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
): MobileKeywordMetric[] {
  const seen = new Set<string>();
  const exactMeasuredSeeds = metrics.filter((metric) =>
    metric.source === 'pc-mindmap-exact-measured-seed'
    && isFullyMeasuredKeyword(metric)
  );
  const usefulExpansions = metrics.filter((metric) =>
    metric.source !== 'pc-mindmap-exact-measured-seed'
    && isUsefulMindmapMeasuredMetric(metric)
  );
  return [...exactMeasuredSeeds, ...usefulExpansions]
    .filter((metric) => {
      const key = compactKeyword(metric.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, targetCount);
}

function prioritizeFullyMeasuredMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
): MobileKeywordMetric[] {
  const measured: MobileKeywordMetric[] = [];
  const partial: MobileKeywordMetric[] = [];
  for (const metric of metrics) {
    if (isFullyMeasuredKeyword(metric)) {
      measured.push(metric);
    } else {
      partial.push(metric);
    }
  }
  return [...measured, ...partial].slice(0, targetCount);
}

function isWeakProTrafficPublishIntent(metric: MobileKeywordMetric): boolean {
  const compacted = compactKeyword(metric.keyword);
  if (!compacted) return true;
  if (isUltimateLowValueLookupKeyword(metric.keyword)) return true;

  return /(프로필|인스타|나이|학력|고향|키|혈액형|근황|몇부작|출연진|재방송|다시보기|방송시간|공식영상|하이라이트|예고편)$/.test(compacted);
}

function prioritizeProTrafficPublishableMetrics(
  metrics: MobileKeywordMetric[],
  targetCount: number,
  options: { strictUltimate?: boolean } = {},
): MobileKeywordMetric[] {
  const publishable = metrics.filter((metric) => !isWeakProTrafficPublishIntent(metric));
  if (!options.strictUltimate) {
    return prioritizeFullyMeasuredMetrics(publishable, targetCount);
  }

  const judged = attachKeywordAiJudges(publishable, { downgradeExcluded: false });
  const strict = judged.filter((metric) => isUltimateGoldenKeywordCandidate(metric, {
    requirePcMobileSplit: true,
    requireMeasurementProvenance: true,
    minAiScore: 98,
    minTotalSearchVolume: 300,
    maxDocumentCount: 8000,
    minGoldenRatio: 5,
  }) && metric.grade === 'SSS');
  return prioritizeFullyMeasuredMetrics(strict, targetCount);
}

function isSyntheticKeywordAnalysisSource(metric: MobileKeywordMetric): boolean {
  const source = `${metric.source} ${metric.evidence.join(' ')}`;
  return /server-intent-template|server-zero-live-fallback|intent-fallback|pc-intent-expansion/i.test(source);
}

function filterKeywordAnalysisMetrics(
  seed: string,
  metrics: MobileKeywordMetric[],
): MobileKeywordMetric[] {
  const seedKey = compactKeyword(seed);
  const seen = new Set<string>();
  const out: MobileKeywordMetric[] = [];
  for (const metric of metrics) {
    const key = compactKeyword(metric.keyword);
    if (!key || seen.has(key)) continue;
    const exact = key === seedKey;
    if (!exact) {
      if (isSyntheticKeywordAnalysisSource(metric)) continue;
      if (!isFullyMeasuredKeyword(metric)) continue;
    }
    seen.add(key);
    out.push(metric);
  }
  return out;
}

function createDefaultKeywordMetricsAdapter(
  getEnvConfig: () => Partial<EnvConfig>,
  forceFreshRequestedSeed = false,
): MobileKeywordMetricsAdapter {
  return async (metrics, context) => {
    const env = getEnvConfig();
    const keywords = metrics.map((item) => normalizeKeyword(item.keyword)).filter(Boolean);
    if (keywords.length === 0) return metrics;

    const hasSearchAdConfig = !!(
      envValue(env, 'naverSearchAdAccessLicense', 'NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCHAD_ACCESS_LICENSE')
      && envValue(env, 'naverSearchAdSecretKey', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCHAD_SECRET_KEY')
      && envValue(env, 'naverSearchAdCustomerId', 'NAVER_SEARCH_AD_CUSTOMER_ID', 'NAVER_SEARCHAD_CUSTOMER_ID')
    );
    const hasOpenApiConfig = !!(
      envValue(env, 'naverClientId', 'NAVER_CLIENT_ID')
      && envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET')
    );
    if (!hasSearchAdConfig && !hasOpenApiConfig) {
      return metrics.map((item) => ({
        ...item,
        evidence: addEvidence(item.evidence, 'metric-measurement-config-missing'),
      }));
    }

    context.progress(84, `measuring ${keywords.length} keyword metrics with PC SearchAd/OpenAPI`);
    ensureNotAborted(context);

    const volumeMap = hasSearchAdConfig
      ? await fetchSearchAdVolumeMap(keywords, env, context)
      : new Map<string, KeywordSearchVolume>();
    ensureNotAborted(context);
    const documentKeywords = hasOpenApiConfig
      ? metrics
        .map((metric) => normalizeKeyword(metric.keyword))
        .filter((keyword, index) => {
          const key = compactKeyword(keyword);
          return Boolean(key && shouldMeasureDocumentCount(metrics[index], volumeMap.get(key)));
        })
      : [];
    const documentCountMap = documentKeywords.length > 0
      ? await fetchNaverDocumentCountMap(
        documentKeywords,
        env,
        context,
        forceFreshRequestedSeed
          ? selectForceFreshDocumentCountQueryKey(metrics)
          : null,
      )
      : new Map<string, Awaited<ReturnType<typeof fetchNaverDocumentCount>>>();
    ensureNotAborted(context);

    return metrics.map((metric) => {
      const key = compactKeyword(metric.keyword);
      const documentKey = documentCountBroadQueryKey(metric.keyword);
      return mergeMeasuredMetric(
        metric,
        volumeMap.get(key),
        documentCountMap.has(documentKey) ? documentCountMap.get(documentKey) : undefined,
      );
    });
  };
}

const USER_NAVER_MEASUREMENT_CREDENTIAL_KEYS: JobApiCredentialKey[] = [
  'naverClientId',
  'naverClientSecret',
  'naverSearchAdAccessLicense',
  'naverSearchAdSecretKey',
  'naverSearchAdCustomerId',
];

export function hasUserNaverCredentialOverride(params: unknown): boolean {
  const credentials = extractJobApiCredentials(params);
  return USER_NAVER_MEASUREMENT_CREDENTIAL_KEYS.some((key) => Boolean(credentials[key]));
}

function hasVolumeMeasurementSignal(metric: MobileKeywordMetric): boolean {
  return finiteNumber(metric.totalSearchVolume) !== null
    || finiteNumber(metric.pcSearchVolume) !== null
    || finiteNumber(metric.mobileSearchVolume) !== null
    || metric.pcSearchVolumeLt10 === true
    || metric.mobileSearchVolumeLt10 === true;
}

function hasDocumentMeasurementSignal(metric: MobileKeywordMetric): boolean {
  return finiteNumber(metric.documentCount) !== null;
}

/**
 * 사용자 API 키가 죽어 있으면(401 등) 해당 차원 실측이 전멸한다 — 예: 죽은
 * OpenAPI 키는 검색량은 정상인데 문서수만 전 행 null 로 만든다.  서버 키는
 * 살아있는데도 반쪽/빈 결과를 돌려주는 것을 막기 위해, 검색량·문서수 중 한
 * 차원이라도 전멸하면 서버 키로 1회 재실측한다.  두 차원 모두 1건 이상
 * 실측되면 사용자 쿼터를 존중해 재실측하지 않는다.
 */
export function createUserKeyRescueMetricsAdapter(
  mergedAdapter: MobileKeywordMetricsAdapter,
  baseAdapter: MobileKeywordMetricsAdapter,
  userNaverCredentialOverride: boolean,
): MobileKeywordMetricsAdapter {
  if (!userNaverCredentialOverride) return mergedAdapter;
  return async (metrics, context) => {
    const measured = await mergedAdapter(metrics, context);
    if (measured.length === 0) return measured;
    const volumeBlackout = !measured.some(hasVolumeMeasurementSignal);
    const documentBlackout = !measured.some(hasDocumentMeasurementSignal);
    if (!volumeBlackout && !documentBlackout) return measured;
    console.warn(`[PC-EXECUTOR] 사용자 API 키 실측 차원 전멸(volume=${volumeBlackout}, document=${documentBlackout}) — 서버 키로 구조 실측을 수행합니다.`);
    const rescued = await baseAdapter(metrics, context);
    return rescued.map((item) => ({
      ...item,
      evidence: addEvidence(item.evidence, 'server-key-rescue-after-user-key-zero-measurement'),
    }));
  };
}

function requireNaverOpenApiConfig(
  env: Partial<EnvConfig>,
  product: MobileKeywordProduct,
): { clientId: string; clientSecret: string } {
  const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
  const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new MobilePcEngineConfigError(
      product,
      'Naver Open API keys are required on the PC/server worker.',
    );
  }
  return { clientId, clientSecret };
}

function mapMdpProgress(
  progress: MDPDiscoverProgress,
  targetCount: number,
  maxCheckedSignals: number,
): { percent: number; message: string } {
  const checkedRatio = maxCheckedSignals > 0
    ? Math.min(1, (progress.checked || 0) / maxCheckedSignals)
    : 0;
  const yieldRatio = targetCount > 0
    ? Math.min(1, (progress.yielded || 0) / targetCount)
    : 0;
  const percent = Math.max(8, Math.min(92, Math.round(8 + checkedRatio * 52 + yieldRatio * 32)));
  const current = progress.currentSeed ? ` - ${progress.currentSeed}` : '';
  const message = `MDP ${progress.phase}: ${progress.yielded || 0}/${targetCount} found, ${progress.checked || 0} checked${current}`;
  return { percent, message };
}

async function runGoldenDiscoveryWithPcMdp(
  params: GoldenDiscoveryMobileParams,
  context: MobileJobExecutorContext,
  getEnvConfig: () => Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const env = getEnvConfig();
  const config = requireNaverOpenApiConfig(env, 'golden-discovery');
  const plan = buildCategoryFirstGoldenSeedPlan({
    category: params.categoryId,
    keyword: params.seedKeyword,
    maxSeeds: params.mode === 'bulk' ? 420 : 220,
  });
  const seed = params.seedKeyword || plan.seeds[0] || params.categoryId || '지원금';
  const maxCheckedSignals = params.mode === 'bulk'
    ? Math.max(420, params.targetCount * 6)
    : Math.max(180, params.targetCount * 4);
  const maxProcessedSeeds = params.mode === 'bulk'
    ? Math.max(16, Math.min(80, Math.ceil(params.targetCount / 2)))
    : Math.max(8, Math.min(36, Math.ceil(params.targetCount / 2)));
  const engineYieldLimit = params.mode === 'bulk'
    ? Math.min(250, Math.max(params.targetCount, Math.ceil(params.targetCount * 2)))
    : Math.min(180, Math.max(params.targetCount, params.targetCount * 3));

  context.progress(8, `starting PC MDP golden discovery for ${params.categoryId}`);
  ensureNotAborted(context);

  const engine = new MDPEngine(config);
  const abort = () => engine.abort();
  context.signal.addEventListener('abort', abort, { once: true });

  try {
    const results: MDPResult[] = [];
    for await (const result of engine.discover(seed, {
      limit: engineYieldLimit,
      minVolume: 10,
      seedKeywords: plan.seeds.slice(0, params.mode === 'bulk' ? 180 : 90),
      categoryIds: plan.categoryIds,
      categoryStrict: false,
      maxCheckedSignals,
      maxProcessedSeeds,
      fastPreview: false,
      includeMeasuredFallback: true,
      onProgress: (progress) => {
        const mapped = mapMdpProgress(progress, params.targetCount, maxCheckedSignals);
        context.progress(mapped.percent, mapped.message);
      },
    })) {
      ensureNotAborted(context);
      results.push(result);
      context.progress(
        Math.min(94, Math.round(30 + (Math.min(results.length, params.targetCount) / params.targetCount) * 60)),
        `PC MDP yielded ${results.length}/${params.targetCount}`,
      );
    }

    let metrics = results
      .map((item) => metricFromMdpResult(item, params.categoryId))
      .filter((item) => item.keyword);
    const rankedBeforeDirect = rankGoldenDiscoveryResults(
      metrics,
      params.targetCount,
      false,
      {
        honorRequestedLimit: true,
        diversifySimilarIntents: true,
        maxSimilarPerCluster: params.targetCount > 30 ? 6 : 2,
        strictVisibleSssOnly: true,
        requireActionableIntent: true,
        qualityBackfillToTarget: true,
      },
    );
    const sssBeforeDirect = countSss(rankedBeforeDirect);
    if (sssBeforeDirect < params.targetCount || rankedBeforeDirect.length < params.targetCount) {
      const isBulkGolden = params.mode === 'bulk';
      const directNeed = Math.max(1, params.targetCount - sssBeforeDirect);
      const visibleNeed = Math.max(1, params.targetCount - rankedBeforeDirect.length);
      context.progress(
        94,
        `PC direct measured supplement: ${sssBeforeDirect}/${params.targetCount} SSS, visible need ${visibleNeed}`,
      );
      ensureNotAborted(context);

      const directResults = await discoverDirectGoldenKeywords(config, {
        category: params.categoryId,
        keyword: params.seedKeyword,
        limit: Math.max(params.targetCount, isBulkGolden ? visibleNeed + 20 : directNeed + 10),
        maxSeeds: params.mode === 'bulk' ? 1000 : 700,
        maxCandidates: params.mode === 'bulk'
          ? Math.max(2400, Math.min(7200, Math.max(visibleNeed, directNeed) * 160))
          : Math.max(1200, Math.min(2200, directNeed * 160)),
        includeCrossCategory: true,
        requireCategoryMatch: false,
        includeSearchAdSuggestions: true,
        includeProTrafficSupplement: isBulkGolden,
        suggestionSeedLimit: params.mode === 'bulk' ? 24 : 16,
        suggestionsPerSeed: params.mode === 'bulk' ? 30 : 24,
        maxSimilarPerCluster: params.mode === 'bulk' ? 6 : 2,
        onProgress: (progress) => {
          context.progress(
            94,
            `PC direct measured supplement ${progress.phase}: ${progress.yielded || 0}/${directNeed}`,
          );
        },
      });
      ensureNotAborted(context);

      const seen = new Set(metrics.map((item) => compactKeyword(item.keyword)).filter(Boolean));
      const directMetrics = directResults
        .filter((item) => String(item.grade || '').toUpperCase() === 'SSS'
          || (isBulkGolden && isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true })))
        .map((item) => metricFromDirectGoldenResult(item, params.categoryId))
        .filter((item) => {
          const key = compactKeyword(item.keyword);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      metrics = [...metrics, ...directMetrics];
    }
    return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
  } finally {
    context.signal.removeEventListener('abort', abort);
  }
}

async function runProTrafficWithPcHunter(
  params: ProTrafficMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics?: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  context.progress(8, `starting PC PRO traffic hunter for ${params.categoryId}`);
  ensureNotAborted(context);
  const seedKeywords = proTrafficContextSeedKeywords(
    params,
    Math.min(180, Math.max(params.targetCount * 3, 60)),
  );
  if (seedKeywords.length > 0) {
    context.progress(14, `injecting ${seedKeywords.length} web context seeds into PC PRO hunter`);
  }
  const liveMeasuredMetrics = measureKeywordMetrics
    ? await buildProTrafficLiveMeasuredMetrics(params, context, measureKeywordMetrics)
    : [];
  const liveStrictMetrics = prioritizeProTrafficPublishableMetrics(
    liveMeasuredMetrics,
    params.targetCount,
    { strictUltimate: true },
  );
  if (!params.seedKeyword && (params as any).autoDiscovery === true) {
    context.progress(84, `live measured prewarm filled ${liveStrictMetrics.length} strict PRO candidates`);
    if (liveStrictMetrics.length >= params.targetCount) {
      return resultFromMetrics(liveStrictMetrics, startedAt, 'pc-engine-plus');
    }
    context.progress(
      85,
      `live strict pool below target; continuing PC PRO hunter for ${params.targetCount - liveStrictMetrics.length} more candidates`,
    );
  }
  const hunterCount = params.seedKeyword
    ? params.targetCount
    : Math.min(250, Math.max(params.targetCount * 5, 160));

  const result: ProTrafficHuntResult = await huntProTrafficKeywords({
    mode: 'category',
    category: params.categoryId,
    seedKeywords,
    targetRookie: true,
    includeSeasonKeywords: params.includeSeasonal,
    explosionMode: params.includeFreshIssue,
    useDeepMining: true,
    discoveryFirst: hunterCount >= 50,
    fastDiscovery: hunterCount >= 100,
    count: hunterCount,
    forceRefresh: true,
  });
  ensureNotAborted(context);

  context.progress(88, `PC PRO hunter returned ${result.keywords.length}; selecting ${params.targetCount} measured-first candidates`);
  const rawMetrics = result.keywords
    .map((item) => metricFromProResult(item, params.categoryId))
    .filter((item) => item.keyword);
  const combinedRawMetrics = [...liveMeasuredMetrics, ...rawMetrics];
  const metrics = prioritizeProTrafficPublishableMetrics(
    combinedRawMetrics,
    Math.min(combinedRawMetrics.length, Math.max(params.targetCount * 3, params.targetCount + 60)),
  );
  const measuredMetrics = measureKeywordMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;
  let finalMetrics = prioritizeProTrafficPublishableMetrics(
    [...liveMeasuredMetrics, ...measuredMetrics],
    params.targetCount,
    { strictUltimate: true },
  );
  if (!params.seedKeyword && (params as any).autoDiscovery === true && finalMetrics.length < params.targetCount && measureKeywordMetrics) {
    context.progress(
      90,
      `strict PRO pool has ${finalMetrics.length}/${params.targetCount}; measuring live source signal top-up`,
    );
    const sourceSignalMetrics = await buildSourceSignalMetrics(
      proTrafficFallbackLane(params.categoryId),
      Math.max(params.targetCount * 3, 80),
      context,
      'pc-pro-traffic-source-signal-topup',
      'measured-live-need-topup',
      measureKeywordMetrics,
    );
    finalMetrics = prioritizeProTrafficPublishableMetrics(
      [...liveMeasuredMetrics, ...measuredMetrics, ...sourceSignalMetrics],
      params.targetCount,
      { strictUltimate: true },
    );
  }
  if (!params.seedKeyword && (params as any).autoDiscovery === true && finalMetrics.length < params.targetCount && measureKeywordMetrics) {
    context.progress(
      92,
      `measured PRO pool has ${finalMetrics.length}/${params.targetCount}; measuring root intent top-up`,
    );
    const rootTopUp = await buildMeasuredIntentFallbackFromSeeds(
      uniqueKeywords([...seedKeywords, ...defaultProTrafficDiscoveryRoots(params.categoryId)], 24),
      Math.max(params.targetCount - finalMetrics.length, Math.min(90, Math.max(params.targetCount, 60))),
      'pc-pro-traffic-root-intent-topup',
      'measured-pro-traffic-need',
      params.categoryId,
      context,
      measureKeywordMetrics,
    );
    finalMetrics = prioritizeProTrafficPublishableMetrics(
      [...liveMeasuredMetrics, ...measuredMetrics, ...rootTopUp],
      params.targetCount,
      { strictUltimate: true },
    );
  }
  return resultFromMetrics(
    finalMetrics,
    startedAt,
    'pc-engine-plus',
  );
}

async function runHomeBoardWithPcPlanner(
  params: HomeBoardMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics?: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const seed = params.seedKeyword || defaultSeedForHomeCategory(params.categoryId);
  context.progress(10, `expanding PC home-board angles for ${params.categoryId}`);
  ensureNotAborted(context);

  const roots = [
    seed,
    ...buildCleanIntentCandidates(seed, Math.min(40, Math.max(12, params.targetCount))),
  ];
  const expanded = roots.flatMap((root) => expandHomeNeedKeywords(
    root,
    params.categoryId,
    Math.min(80, Math.max(HOME_HUNTER_MIN_SPLUS_RESULTS, Math.ceil(params.targetCount / 2))),
  ));

  context.progress(55, `ranking ${expanded.length} home-board candidates with PC home intent engine`);
  ensureNotAborted(context);

  const ranked = rankHomeNeedKeywords(expanded)
    .filter((item) => !params.requireSplusFloor || item.homeNeedGrade === 'S+')
    .slice(0, params.targetCount);
  const fallback = ranked.length >= params.targetCount
    ? ranked
    : rankHomeNeedKeywords(expanded).slice(0, params.targetCount);

  const metrics = fallback.map((item) => metricFromHomeNeedResult(item, params.categoryId));
  const measuredMetrics = measureKeywordMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;
  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
}

// v2.49.72: 지식인 스크래퍼 0건 대비 HTTP 폴백 — 네이버 지식인 OpenAPI(kin.json).
//   서버에서 브라우저 스크래핑이 죽어도 "실제 지식인 질문" 풀을 유지한다.
//   실측 게이트(prioritizeMeasuredDecisionMetrics)는 그대로 통과시킨다 — 풀 확장이지 게이트 완화가 아님.
async function fetchKinOpenApiFallbackQuestions(
  env: Partial<EnvConfig>,
  roots: string[],
  limit: number,
): Promise<Array<{ title: string; honeyPotScore: number; honeyPotReason: string; category: string }>> {
  let config: { clientId: string; clientSecret: string };
  try {
    config = requireNaverOpenApiConfig(env, 'kin-hidden-honey');
  } catch {
    return []; // 키 없으면 폴백 불가 — 호출자는 context topup 으로 계속 진행
  }
  const queryRoots = Array.from(new Set(
    roots.map((keyword) => normalizeKeyword(keyword)).filter((keyword) => keyword.length >= 2)
  )).slice(0, 6);
  if (queryRoots.length === 0) return [];

  const axios = (await import('axios')).default;
  const out: Array<{ title: string; honeyPotScore: number; honeyPotReason: string; category: string }> = [];
  const seen = new Set<string>();
  const settled = await Promise.allSettled(queryRoots.map((root) =>
    axios.get('https://openapi.naver.com/v1/search/kin.json', {
      params: { query: root, display: 20, sort: 'point' },
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
      },
      timeout: 8000,
      validateStatus: (s: number) => s < 500,
    }).then((res) => ({ root, items: Array.isArray(res.data?.items) ? res.data.items : [] }))
  ));
  for (const row of settled) {
    if (row.status !== 'fulfilled') continue;
    for (const [index, item] of (row.value.items as Array<{ title?: string }>).entries()) {
      const title = String(item?.title || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
      if (!title || title.length < 4) continue;
      const key = compactKeyword(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        title,
        honeyPotScore: Math.max(40, 62 - index * 1.2),
        honeyPotReason: `지식인 OpenAPI 폴백 (질문 검색: ${row.value.root})`,
        category: 'naver-kin',
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function runKinHiddenHoneyWithPcHunter(
  params: KinHiddenHoneyMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
  getEnvConfig?: () => Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  context.progress(10, `starting PC KIN hunter: ${params.tabType}`);
  ensureNotAborted(context);

  const kin = await import('../utils/naver-kin-golden-hunter-v3');
  let result: any;
  try {
    if (params.tabType === 'trending') {
      result = await kin.getTrendingHiddenQuestions();
    } else if (params.tabType === 'hidden') {
      result = await kin.fullHunt();
    } else if (params.tabType === 'latest') {
      result = await kin.getRisingQuestions();
    } else {
      result = await kin.getPopularQnA();
    }
  } catch (err: any) {
    // v2.49.72: 스크래퍼 자체가 죽어도(서버 브라우저 실패 등) 폴백 경로로 계속
    context.progress(30, `PC KIN scraper failed: ${err?.message || err} — OpenAPI 폴백 시도`);
    result = { goldenQuestions: [] };
  }
  ensureNotAborted(context);

  context.progress(88, `PC KIN hunter returned ${result?.goldenQuestions?.length || 0}/${params.targetCount}`);
  let metrics = (result?.goldenQuestions || [])
    .slice(0, params.targetCount)
    .map(metricFromKinQuestion)
    .filter((item: MobileKeywordMetric) => item.keyword);

  // v2.49.72: 스크래퍼 0건 → kin.json 폴백으로 실제 질문 풀 재확보 (동일 실측 게이트 통과)
  if (metrics.length === 0 && getEnvConfig) {
    const fallbackRoots = (params.contextKeywords || [])
      .map((item) => item.keyword)
      .filter((keyword) => isKinAnswerDemandKeyword(keyword));
    let roots = fallbackRoots;
    if (roots.length === 0) {
      try {
        const snapshot = await buildMobileSourceSignalSnapshot({ lane: 'all', limit: 24 });
        if (!snapshot.fallbackUsed) roots = balancedSourceSignalRoots(snapshot, 12);
      } catch { /* 소스 신호 실패 시 폴백 루트 없음 */ }
    }
    const fallbackQuestions = await fetchKinOpenApiFallbackQuestions(
      getEnvConfig(),
      roots,
      Math.max(params.targetCount * 2, 40),
    );
    if (fallbackQuestions.length > 0) {
      context.progress(90, `KIN OpenAPI 폴백 질문 ${fallbackQuestions.length}건 확보`);
      metrics = fallbackQuestions
        .map(metricFromKinQuestion)
        .filter((item: MobileKeywordMetric) => item.keyword);
    }
  }
  const measuredKinMetrics = metrics.length > 0
    ? await measureKeywordMetrics(metrics, context)
    : [];
  let finalMetrics = prioritizeMeasuredDecisionMetrics(
    measuredKinMetrics.filter(isKinAnswerDemandMetric),
    params.targetCount,
    {
      requirePcMobileSplit: true,
      minTotalSearchVolume: 30,
      maxDocumentCount: 150000,
    },
  );
  if (finalMetrics.length < params.targetCount) {
    const kinContextKeywords = (params.contextKeywords || []).filter((item) => isKinAnswerDemandKeyword(item.keyword));
    const contextTopUp = await buildMeasuredContextKeywordMetrics(
      undefined,
      kinContextKeywords,
      Math.max(0, params.targetCount - finalMetrics.length),
      'pc-kin-web-context-topup',
      'kin-question-web-context',
      'naver-kin',
      context,
      measureKeywordMetrics,
    );
    if (contextTopUp.length > 0) {
      const seen = new Set(finalMetrics.map((item: MobileKeywordMetric) => compactKeyword(item.keyword)).filter(Boolean));
      for (const metric of contextTopUp) {
        const key = compactKeyword(metric.keyword);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        finalMetrics.push(metric);
        if (finalMetrics.length >= params.targetCount) break;
      }
    }
  }
  finalMetrics = prioritizeMeasuredDecisionMetrics(finalMetrics, params.targetCount, {
    requirePcMobileSplit: true,
    minTotalSearchVolume: 30,
    maxDocumentCount: 50000,
  });
  if (finalMetrics.length < params.targetCount) {
    const fallback = await buildSourceSignalMetrics(
      'all',
      Math.max(params.targetCount * 2, 60),
      context,
      'pc-kin-live-source-fallback',
      'kin-question-source-gap',
      measureKeywordMetrics,
    );
    finalMetrics = prioritizeMeasuredDecisionMetrics([...finalMetrics, ...fallback].filter(isKinAnswerDemandMetric), params.targetCount, {
      requirePcMobileSplit: true,
      minTotalSearchVolume: 30,
      maxDocumentCount: 50000,
    });
  }
  return resultFromMetrics(finalMetrics, startedAt, 'pc-engine-plus');
}

async function runShoppingConnectWithPcEngine(
  params: ShoppingConnectMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const autoDiscovery = !params.keyword;
  const contextSeeds = contextSeedKeywords(
    params.keyword || undefined,
    params.contextKeywords,
    Math.min(30, Math.max(params.targetCount, 30)),
  ).filter(seed => !isAutoDiscoveryPlaceholderKeyword(seed));

  context.progress(10, autoDiscovery ? 'starting PC shopping auto discovery' : `starting PC shopping connect for ${params.keyword}`);
  ensureNotAborted(context);

  const shopping = await import('../utils/naver-shopping-api');
  const discovery = await import('../utils/shopping-keyword-suggestions');
  const contextPlans = contextSeeds.map((keyword) => ({
    keyword,
    source: 'trend-seed' as const,
    reason: 'web keyword-analysis context',
  }));
  if (contextPlans.length > 0) {
    context.progress(16, `injecting ${contextPlans.length} web context seeds into shopping connect`);
  }
  const shoppingDiscoverySeedLimit = Math.min(60, Math.max(params.targetCount * 2, 30));
  const discoveryPlans = autoDiscovery
    ? (await discovery.getShoppingDiscoverySeeds(shoppingDiscoverySeedLimit)).slice(0, shoppingDiscoverySeedLimit).map((seed) => ({
        keyword: seed.keyword,
        source: 'auto-discovery' as const,
        reason: seed.reason,
        pcSearchVolume: seed.pcSearchVolume,
        mobileSearchVolume: seed.mobileSearchVolume,
        searchVolume: seed.searchVolume,
        documentCount: seed.documentCount,
        goldenRatio: seed.goldenRatio,
        category: seed.category,
        priorityScore: seed.priorityScore,
      }))
    : [];
  const shoppingRootKeyword = params.keyword
    || contextSeeds[0]
    || discoveryPlans.find(plan => !isAutoDiscoveryPlaceholderKeyword(plan.keyword))?.keyword
    || '';
  const rawSearchPlans = autoDiscovery
    ? [...contextPlans, ...discoveryPlans]
    : [{
        keyword: params.keyword,
        source: 'direct' as const,
        reason: 'direct shopping keyword',
      }, ...contextPlans];
  const seenPlans = new Set<string>();
  const searchPlans = rawSearchPlans.filter((plan) => {
    const key = compactKeyword(plan.keyword);
    if (isAutoDiscoveryPlaceholderKeyword(plan.keyword)) return false;
    if (!key || seenPlans.has(key)) return false;
    seenPlans.add(key);
    return true;
  }).slice(0, autoDiscovery ? Math.min(60, Math.max(params.targetCount * 2, 30)) : Math.min(30, Math.max(1, params.targetCount)));
  if (searchPlans.length === 0) throw new Error('shopping discovery seeds are empty');
  const balancedStaticShoppingSeeds = autoDiscovery
    ? discovery.getStaticShoppingSuggestions(6).flatMap((group) => group.keywords)
    : [];
  const fallbackSeeds = uniqueKeywords(
    [
      shoppingRootKeyword,
      ...balancedStaticShoppingSeeds,
      ...searchPlans.map(plan => plan.keyword),
      ...discoveryPlans.map(plan => plan.keyword),
      ...contextSeeds,
    ]
      .flatMap(seed => shoppingKeywordVariants(seed))
      .filter(seed => seed && !isAutoDiscoveryPlaceholderKeyword(seed)),
    Math.min(80, Math.max(30, params.targetCount * 3)),
  );

  const settledShopping = await Promise.allSettled(searchPlans.map((plan) =>
    shopping.searchNaverShopping(plan.keyword, {
      display: autoDiscovery ? 20 : Math.min(100, Math.max(params.targetCount * 3, 30)),
      sort: params.sort,
    }).then((result) => ({ plan, result }))
  ));
  const rejectedReasons = settledShopping
    .filter((row): row is PromiseRejectedResult => row.status === 'rejected')
    .map(row => row.reason);
  const result = {
    total: 0,
    items: [] as any[],
  };
  const seenProducts = new Set<string>();
  for (const row of settledShopping) {
    if (row.status !== 'fulfilled') continue;
    result.total += Number(row.value.result.total || 0);
    for (const item of row.value.result.items || []) {
      const key = item.productId || `${item.title}|${item.lprice}|${item.mallName}`;
      if (!key || seenProducts.has(key)) continue;
      seenProducts.add(key);
      item.discoveryQuery = row.value.plan.keyword;
      item.discoverySource = row.value.plan.source;
      item.discoveryReason = row.value.plan.reason;
      result.items.push(item);
    }
  }
  if (result.items.length === 0 && rejectedReasons.length > 0) {
    const quotaError = rejectedReasons.find(isQuotaLimitError);
    if (!quotaError) throw rejectedReasons[0];
    context.progress(35, `shopping quota exhausted; using SearchAd/OpenAPI measured commerce fallback for ${shoppingRootKeyword}`);
    const fallback = await buildMeasuredIntentFallbackFromSeeds(
      fallbackSeeds,
      params.targetCount,
      'pc-shopping-quota-searchad-fallback',
      'commerce-entry',
      'shopping',
      context,
      measureKeywordMetrics,
    );
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }
  ensureNotAborted(context);

  if (Array.isArray((result as any).fallbackMetrics)) {
    return resultFromMetrics((result as any).fallbackMetrics, startedAt, 'pc-engine-plus');
  }

  const shoppingItems = Array.isArray(result.items) ? result.items : [];
  if (shoppingItems.length === 0) {
    context.progress(45, `shopping returned 0 products; using SearchAd/OpenAPI measured commerce fallback for ${shoppingRootKeyword}`);
    const fallback = await buildMeasuredIntentFallbackFromSeeds(
      fallbackSeeds,
      params.targetCount,
      'pc-shopping-empty-searchad-fallback',
      'commerce-entry',
      'shopping',
      context,
      measureKeywordMetrics,
    );
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }

  const scoredItems = shoppingItems
    .filter((item) => isShoppingItemRelevantToDiscovery(item, shoppingRootKeyword))
    .map((item) => ({
      ...item,
      conversionScore: shopping.computeConversionScore(item),
    }));
  const rankingItems = scoredItems.length > 0 ? scoredItems : shoppingItems.map((item) => ({
    ...item,
    conversionScore: shopping.computeConversionScore(item),
  }));
  const shoppingCandidateMetricLimit = Math.min(120, Math.max(params.targetCount * 3, 90));
  const rankedItems = shopping.rankShoppingOpportunities(
    rankingItems,
    {
      keyword: shoppingRootKeyword,
      intentPrimary: 'buy',
      totalHits: result.total,
      relatedKeywords: [],
      crossSourceSeeds: [],
    },
    shoppingCandidateMetricLimit,
    { balanceDiscovery: true },
  );

  context.progress(55, `building LeWord entry keywords from ${rankedItems.length} shopping products`);
  ensureNotAborted(context);

  const metrics: MobileKeywordMetric[] = [];
  const seen = new Set<string>();
  for (const plan of discoveryPlans) {
    const metric = metricFromShoppingDiscoverySeed(plan);
    const key = compactKeyword(metric?.keyword || '');
    if (!metric || !key || seen.has(key)) continue;
    seen.add(key);
    metrics.push(metric);
  }
  for (const item of rankedItems) {
    const seeds = shopping.buildProductLeWordSeeds(item, item.discoveryQuery || shoppingRootKeyword, 10);
    if (seeds.length === 0) {
      seeds.push({
        keyword: normalizeKeyword(item.cleanTitle || item.simplifiedTitle || item.title || item.discoveryQuery || shoppingRootKeyword),
        relation: 'same-product',
        reason: 'shopping product opportunity',
      });
    }
    for (const seed of seeds) {
      const variants = shoppingKeywordVariants(seed.keyword);
      for (const keyword of variants) {
        const key = compactKeyword(keyword);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        metrics.push(metricFromShoppingSeed({ ...seed, keyword }, item, item.discoveryQuery || shoppingRootKeyword));
        if (metrics.length >= shoppingCandidateMetricLimit) break;
      }
      if (metrics.length >= shoppingCandidateMetricLimit) break;
    }
    if (metrics.length >= shoppingCandidateMetricLimit) break;
  }

  const measuredMetrics = await measureKeywordMetrics(metrics, context);
  const measuredProductPicks = prioritizeShoppingProductPickMetrics(
    measuredMetrics,
    params.targetCount,
  );
  let strictMetrics = prioritizeMeasuredDecisionMetrics(
    measuredMetrics,
    params.targetCount,
    {
      requirePcMobileSplit: true,
      minTotalSearchVolume: 30,
      maxDocumentCount: 50000,
    },
  );
  let finalMetrics = mergePrioritizedKeywordMetrics(
    [measuredProductPicks, strictMetrics],
    params.targetCount,
  );
  if (finalMetrics.length < params.targetCount) {
    context.progress(
      82,
      `shopping publishable pool has ${finalMetrics.length}/${params.targetCount}; measuring commerce intent top-up`,
    );
    const fallback = await buildMeasuredIntentFallbackFromSeeds(
      fallbackSeeds,
      Math.max(params.targetCount - finalMetrics.length, Math.min(30, params.targetCount)),
      'pc-shopping-commerce-intent-topup',
      'commerce-entry',
      'shopping',
      context,
      measureKeywordMetrics,
    );
    const fallbackWithProductPicks = attachShoppingProductPicksToMetrics(
      fallback,
      rankedItems,
      shoppingRootKeyword,
    );
    const measuredProductPicksWithFallback = prioritizeShoppingProductPickMetrics(
      [...measuredMetrics, ...fallbackWithProductPicks],
      params.targetCount,
    );
    strictMetrics = prioritizeMeasuredDecisionMetrics(
      [...measuredMetrics, ...fallbackWithProductPicks],
      params.targetCount,
      {
        requirePcMobileSplit: true,
        minTotalSearchVolume: 30,
        maxDocumentCount: 150000,
      },
    );
    finalMetrics = mergePrioritizedKeywordMetrics(
      [measuredProductPicksWithFallback, strictMetrics],
      params.targetCount,
    );
  }
  return resultFromMetrics(finalMetrics, startedAt, 'pc-engine-plus');
}

async function runYoutubeGoldenWithPcEngine(
  params: YoutubeGoldenMobileParams,
  context: MobileJobExecutorContext,
  getEnvConfig: () => Partial<EnvConfig>,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const env = getEnvConfig();
  const apiKey = envValue(env, 'youtubeApiKey', 'YOUTUBE_API_KEY');
  if (!apiKey) {
    throw new MobilePcEngineConfigError(
      'youtube-golden',
      'YouTube API key is required on the server worker.',
    );
  }

  context.progress(10, 'collecting YouTube trending videos with PC engine');
  ensureNotAborted(context);

  const youtube = await import('../utils/youtube-data-api');
  const analyzer = await import('../utils/youtube-trend-analyzer');
  const categoryId = params.categoryId && params.categoryId !== 'all'
    ? params.categoryId
    : undefined;
  const trending = await youtube.getYouTubeTrending({
    apiKey,
    maxResults: params.maxResults,
    categoryId,
    regionCode: 'KR',
    useCache: true,
  });
  ensureNotAborted(context);

  const videos = Array.isArray(trending.videos) ? trending.videos : [];
  context.progress(45, `analyzing ${videos.length} YouTube trend videos`);
  const dashboard = analyzer.aggregateTrendDashboard(videos);
  const patterns = analyzer.analyzeTitlePatterns(videos);
  const golden = analyzer.generateGoldenKeywords(dashboard, patterns, videos);

  const crossByKeyword = new Map<string, any>();
  if (params.crossReferenceNaver && golden.length > 0) {
    const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
    const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
    if (clientId && clientSecret) {
      context.progress(72, 'cross-referencing YouTube keywords with Naver SearchAd/OpenAPI');
      const cross = await analyzer.crossReferenceWithNaver(
        golden.map((item) => item.keyword).slice(0, Math.min(30, params.maxResults)),
        { clientId, clientSecret },
        videos,
      );
      for (const item of cross.opportunities || []) {
        const key = compactKeyword(item.keyword);
        if (key) crossByKeyword.set(key, item);
      }
    } else {
      context.progress(72, 'skipping Naver cross-reference because OpenAPI keys are missing');
    }
  }
  ensureNotAborted(context);

  const youtubeNoiseKeywords = new Set([
    '그냥', '장면은', '메인', '분석', '예고편', '공개', '공식', '영상', '방송', '게임',
    '그림', '대회', '직전', '감독', '지시', '선수들', '브랜드', '데이', '체크', '마이크',
    '중요할', '먹으라고', '탈락', '못할', '뭐가', '있어', '라이브', '쇼츠', '티저',
  ]);
  const isUsefulYoutubeKeyword = (keyword: string): boolean => {
    const normalized = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
    const compacted = compactKeyword(normalized);
    if (!normalized || !compacted || normalized.length < 3 || normalized.length > 36) return false;
    if (!isSearchPhraseCandidate(normalized)) return false;
    if (!/[가-힣]/.test(normalized)) return false;
    if (/^\d+(?:회|탄|차|부)?$/.test(normalized)) return false;
    if (youtubeNoiseKeywords.has(normalized.toLowerCase())) return false;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && compacted.length < 5) return false;
    if (tokens.length === 1 && youtubeNoiseKeywords.has(compacted.toLowerCase())) return false;
    return true;
  };
  const youtubeIntentExpansions = (keyword: string, category?: string): string[] => {
    const base = normalizeKeyword(keyword).replace(/\s+/g, ' ').trim();
    if (!isUsefulYoutubeKeyword(base)) return [];
    const lowerCategory = String(category || '').toLowerCase();
    const compacted = compactKeyword(base);
    const suffixes = /(영화|애니|movie|animation)/i.test(lowerCategory) || /스파이더맨|드라마|영화|애니/.test(base)
      ? ['예고편', '개봉일', '출연진', '쿠키영상', '줄거리', '해석', '리뷰']
      : /(게임|gaming)/i.test(lowerCategory) || /게임|리니지|스타|공성전|숨바꼭질/.test(base)
        ? ['공략', '하는법', '출시일', '쿠폰', '정리', '설정', '랭킹']
        : /(스포츠|sports|kbo|fifa|월드컵)/i.test(lowerCategory) || /kbo|경기|월드컵|야구|축구/.test(base.toLowerCase())
          ? ['중계', '일정', '라인업', '결과', '하이라이트', '순위']
          : ['정리', '뜻', '방법', '후기', '반응'];
    const out = [base, ...buildYouTubeSearchIntentRoots(base, category, 12)];
    for (const suffix of suffixes) {
      const expanded = `${base} ${suffix}`.replace(/\s+/g, ' ').trim();
      if (compactKeyword(expanded) !== compacted) out.push(expanded);
    }
    return uniqueKeywords(out.filter(isUsefulYoutubeKeyword), 18);
  };
  const seen = new Set<string>();
  const metrics: MobileKeywordMetric[] = [];
  const pushYoutubeMetric = (
    keyword: string,
    score: number,
    source: string,
    evidence: string[],
    cross?: any,
  ) => {
    const normalized = normalizeKeyword(keyword);
    const key = compactKeyword(normalized);
    if (!isUsefulYoutubeKeyword(normalized) || !key || seen.has(key)) return;
    seen.add(key);
    const metric = metricFromYoutubeKeyword(
      { keyword: normalized, trendScore: score, reason: source },
      cross || crossByKeyword.get(key),
    );
    metrics.push({
      ...metric,
      grade: normalizeGrade(metric.grade, score),
      source,
      evidence: Array.from(new Set([...(metric.evidence || []), ...evidence].filter(Boolean))),
    });
  };

  golden.forEach((item, index) => {
    const score = finiteNumber(item.totalScore) ?? finiteNumber(item.trendScore) ?? Math.max(55, 88 - index);
    youtubeIntentExpansions(item.keyword, (item as any).category).forEach((keyword, expandIndex) => {
      pushYoutubeMetric(
        keyword,
        Math.max(50, score - expandIndex * 1.5),
        expandIndex === 0 ? 'pc-youtube-golden-keywords' : 'pc-youtube-blog-intent-expansion',
        ['youtube-trend-analyzer', normalizeKeyword(item.reason), expandIndex > 0 ? 'youtube-blog-search-intent' : ''].filter(Boolean),
      );
    });
  });

  const trendKeywords = await youtube.getYouTubeTrendKeywords({
    apiKey,
    maxResults: Math.min(80, Math.max(50, params.maxResults)),
  }).catch(() => [] as Array<{ keyword: string; viewCount?: number; changeRate?: number; category?: string }>);
  trendKeywords.forEach((item, index) => {
    const score = Math.min(95, Math.max(55, finiteNumber(item.changeRate) ?? (86 - index * 0.35)));
    youtubeIntentExpansions(item.keyword, item.category).forEach((keyword, expandIndex) => {
      pushYoutubeMetric(
        keyword,
        Math.max(50, score - expandIndex * 1.25),
        expandIndex === 0 ? 'pc-youtube-title-keyword' : 'pc-youtube-blog-intent-expansion',
        [
          'youtube-title-keyword',
          expandIndex > 0 ? 'youtube-blog-search-intent' : '',
          typeof item.viewCount === 'number' ? `youtube-view-count ${item.viewCount}` : '',
          normalizeKeyword(item.category),
        ].filter(Boolean),
      );
    });
  });

  for (const video of videos) {
    const videoScore = finiteNumber((video as any)?.viewsPerHour)
      ? Math.min(95, 55 + Math.log10(Math.max(10, (video as any).viewsPerHour)) * 8)
      : 65;
    const titleCandidates = typeof youtube.extractYouTubeTrendKeywordCandidates === 'function'
      ? youtube.extractYouTubeTrendKeywordCandidates((video as any).title || '')
      : [];
    for (const keyword of titleCandidates) {
      youtubeIntentExpansions(keyword, (video as any).categoryName).forEach((expanded, expandIndex) => {
        pushYoutubeMetric(
          expanded,
          Math.max(50, videoScore - expandIndex * 1.25),
          expandIndex === 0 ? 'pc-youtube-title-candidate' : 'pc-youtube-blog-intent-expansion',
          [
            'youtube-title-candidate',
            expandIndex > 0 ? 'youtube-blog-search-intent' : '',
            normalizeKeyword((video as any).categoryName),
            typeof (video as any).viewCount === 'number' ? `youtube-view-count ${(video as any).viewCount}` : '',
          ].filter(Boolean),
        );
      });
      if (metrics.length >= Math.min(180, Math.max(80, params.maxResults * 4))) break;
    }
    if (metrics.length >= Math.min(180, Math.max(80, params.maxResults * 4))) break;
  }

  const candidateMetrics = metrics.slice(0, Math.min(180, Math.max(80, params.maxResults * 4)));
  if (candidateMetrics.length > 0) {
    context.progress(82, `measuring ${candidateMetrics.length} YouTube trend keywords with Naver SearchAd/OpenAPI`);
    const measured = await measureKeywordMetrics(candidateMetrics, context);
    const finalMetrics = prioritizeMeasuredDecisionMetrics(
      measured,
      params.maxResults,
      {
        requirePcMobileSplit: true,
        minTotalSearchVolume: 30,
        maxDocumentCount: 100000,
      },
    );
    if (finalMetrics.length > 0) {
      return resultFromMetrics(finalMetrics, startedAt, 'pc-engine-plus');
    }
  }

  const fallback = await buildSourceSignalMetrics(
    'all',
    params.maxResults,
    context,
    'pc-youtube-live-source-fallback',
    'youtube-trend-source-gap',
    params.crossReferenceNaver ? measureKeywordMetrics : undefined,
  );
  const measuredFallback = prioritizeMeasuredDecisionMetrics(
    fallback,
    params.maxResults,
    {
      requirePcMobileSplit: true,
      minTotalSearchVolume: 30,
      maxDocumentCount: 100000,
    },
  ).filter((item) => {
    const key = compactKeyword(item.keyword);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return resultFromMetrics(measuredFallback, startedAt, 'pc-engine-plus');
}

async function runNaverMateWithPcEngine(
  params: NaverMateMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
  getEnvConfig: () => Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  if (!params.seedKeyword) throw new Error('seedKeyword is required');

  const env = getEnvConfig();
  const config = requireNaverOpenApiConfig(env, 'naver-mate-hunter');
  const autoDiscovery = params.autoDiscovery === true || isNaverMateAutoDiscoverySeed(params.seedKeyword);
  const candidates: Array<{ keyword: string; score: number; source: string; evidence: string[] }> = [];

  const addCandidate = (keyword: unknown, score: number, source: string, evidence: string[]) => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized || !isSearchPhraseCandidate(normalized)) return;
    candidates.push({ keyword: normalized, score, source, evidence });
  };

  const contextSeeds = contextSeedKeywords(
    autoDiscovery ? undefined : params.seedKeyword || undefined,
    params.contextKeywords,
    Math.min(120, Math.max(params.targetCount * 2, 30)),
  );
  if (!autoDiscovery) {
    addCandidate(params.seedKeyword, 88, 'naver-mate-seed', ['pc-naver-mate-seed']);
  }
  if (contextSeeds.length > 1 || (contextSeeds.length === 1 && compactKeyword(contextSeeds[0]) !== compactKeyword(params.seedKeyword))) {
    context.progress(16, `injecting ${contextSeeds.length} web context seeds into Naver Mate`);
  }
  if (!autoDiscovery) {
    contextSeeds.forEach((keyword, index) => {
      if (compactKeyword(keyword) === compactKeyword(params.seedKeyword)) return;
      addCandidate(keyword, Math.max(52, 90 - index * 0.35), 'pc-naver-mate-web-context', [
        'pc-naver-mate-web-context',
        'web-analysis-context',
      ]);
    });
  }

  let roots = uniqueKeywords(
    [
      autoDiscovery ? '' : params.seedKeyword,
      ...contextSeeds,
    ].filter((keyword) => !isNaverMateAutoDiscoverySeed(keyword)),
    Math.min(12, Math.max(4, Math.ceil(params.targetCount / 4))),
  );
  if (autoDiscovery && roots.length < Math.min(4, params.targetCount)) {
    context.progress(18, 'collecting live source roots for Naver Mate auto discovery');
    const snapshot = await buildMobileSourceSignalSnapshot({
      lane: 'all',
      limit: Math.min(40, Math.max(12, params.targetCount)),
    });
    if (!snapshot.fallbackUsed) {
      const sourceRoots = balancedSourceSignalRoots(
        snapshot,
        Math.min(30, Math.max(12, params.targetCount)),
      ).filter(isNaverMateUtilityRootCandidate);
      roots = uniqueKeywords(
        [...roots, ...sourceRoots].filter((keyword) => !isNaverMateAutoDiscoverySeed(keyword)),
        Math.min(60, Math.max(24, params.targetCount)),
      );
      if (sourceRoots.length > 0) {
        context.progress(19, `Naver Mate live source roots: ${roots.length}`);
      }
    }
  }
  roots = expandNaverMateQueryRoots(roots, params.targetCount);
  if (autoDiscovery && roots.length > 0) {
    context.progress(19, `Naver Mate intent query roots: ${roots.length}`);
  }

  const earlyMeasuredSourceMetrics = autoDiscovery && params.includeVolumeMetrics
    ? await buildNaverMateLiveSourceFallbackMetrics(
      Math.min(80, Math.max(40, params.targetCount)),
      context,
      measureKeywordMetrics,
      22,
    )
    : [];
  if (earlyMeasuredSourceMetrics.length > 0) {
    context.progress(24, `Naver Mate early measured source pool: ${earlyMeasuredSourceMetrics.filter(isFullyMeasuredKeyword).length}/${earlyMeasuredSourceMetrics.length}`);
  }

  if (params.includeAutocomplete) {
    context.progress(28, 'collecting Naver autocomplete signals');
    ensureNotAborted(context);
    const autocomplete = await import('../utils/naver-autocomplete');
    const autocompleteRoots = (roots.length ? roots : [params.seedKeyword].filter((keyword) => !isNaverMateAutoDiscoverySeed(keyword)))
      .filter((keyword) => !autoDiscovery || isNaverMateUtilityRootCandidate(keyword))
      .slice(0, autoDiscovery ? Math.min(18, Math.max(6, params.targetCount)) : Math.min(36, Math.max(12, params.targetCount)));
    const settledAutocomplete = await Promise.allSettled(autocompleteRoots.map((root) =>
      autocomplete.getNaverAutocompleteKeywords(root, config)
        .then((keywords) => ({ root, keywords }))
    ));
    settledAutocomplete.forEach((row, rootIndex) => {
      if (row.status !== 'fulfilled') {
        context.progress(36, `Naver autocomplete unavailable: ${row.reason?.message || row.reason}`);
        return;
      }
      row.value.keywords.slice(0, Math.max(8, params.targetCount)).forEach((keyword, index) => {
        addCandidate(keyword, Math.max(45, 88 - rootIndex * 1.5 - index * 0.35), 'pc-naver-autocomplete', [
          'pc-naver-autocomplete',
          `seed:${row.value.root}`,
        ]);
      });
    });
  }

  if (params.includeRelated) {
    context.progress(48, 'collecting Naver related keyword signals');
    ensureNotAborted(context);
    const datalab = await import('../utils/naver-datalab-api');
    const relatedRoots = (roots.length ? roots : [params.seedKeyword].filter((keyword) => !isNaverMateAutoDiscoverySeed(keyword)))
      .filter((keyword) => !autoDiscovery || isNaverMateUtilityRootCandidate(keyword))
      .slice(0, autoDiscovery ? Math.min(8, Math.max(4, Math.ceil(params.targetCount / 4))) : Math.min(24, Math.max(8, params.targetCount)));
    const settledRelated = await Promise.allSettled(relatedRoots.map((root) =>
      datalab.getNaverRelatedKeywords(root, config, {
        limit: autoDiscovery ? Math.min(35, Math.max(params.targetCount, 20)) : Math.min(80, Math.max(params.targetCount, 30)),
        spiderWebDepth: autoDiscovery ? 0 : 1,
      }).then((related) => ({ root, related }))
    ));
    settledRelated.forEach((row, rootIndex) => {
      if (row.status !== 'fulfilled') {
        context.progress(58, `Naver related keywords unavailable: ${row.reason?.message || row.reason}`);
        return;
      }
      row.value.related.forEach((item: any, index: number) => {
        const volumeScore = Math.min(22, Math.log10(Math.max(1, Number(item?.searchVolume || 0))) * 6);
        addCandidate(item?.keyword, Math.max(45, 82 - rootIndex * 1.25 - index * 0.25 + volumeScore), 'pc-naver-related-keywords', [
          'pc-naver-related-keywords',
          `seed:${row.value.root}`,
          normalizeKeyword(item?.intent),
          normalizeKeyword(item?.category),
        ].filter(Boolean));
      });
    });
  }

  context.progress(72, `ranking ${candidates.length} Naver Mate candidates`);
  ensureNotAborted(context);

  const seen = new Set<string>();
  const seedCounts = new Map<string, number>();
  const maxCandidatesPerSeed = Math.max(4, Math.ceil(params.targetCount / 8));
  const ranked = candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = compactKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      if (!isNaverMateConciseMeasuredCandidate(item.keyword)) return false;
      const seedKey = naverMateCandidateSeedKey(item);
      const seedCount = seedCounts.get(seedKey) || 0;
      if (seedCount >= maxCandidatesPerSeed) return false;
      seedCounts.set(seedKey, seedCount + 1);
      seen.add(key);
      return true;
    })
    .slice(0, Math.min(180, Math.max(params.targetCount * 3, params.targetCount)))
    .map((item) => metricFromExpansion(
      item.keyword,
      item.score,
      item.source,
      'naver-mate',
      'naver',
      item.evidence,
    ));

  let measuredMetrics = params.includeVolumeMetrics
    ? [...earlyMeasuredSourceMetrics, ...(await measureKeywordMetrics(ranked, context))]
    : ranked;
  let finalMetrics = params.includeVolumeMetrics
    ? prioritizeNaverMateMeasuredMetrics(measuredMetrics, params.targetCount, 50000)
    : ranked;
  const naverMateMinimumUsefulCount = Math.min(params.targetCount, autoDiscovery ? 16 : 30);
  if (params.includeVolumeMetrics && finalMetrics.length < naverMateMinimumUsefulCount && roots.length > 0) {
    context.progress(
      78,
      `Naver Mate measured pool has ${finalMetrics.length}/${params.targetCount}; measuring intent-root candidates`,
    );
    const rootTopUpMetrics = roots
      .filter(isNaverMateIntentRootCandidate)
      .filter((keyword) => !autoDiscovery || isNaverMateUtilityRootCandidate(keyword))
      .slice(0, autoDiscovery ? Math.min(36, Math.max(16, params.targetCount)) : Math.min(120, Math.max(40, params.targetCount * 3)))
      .map((keyword, index) => metricFromExpansion(
        keyword,
        Math.max(45, 80 - index * 0.2),
        'pc-naver-mate-intent-root-measured',
        'naver-mate',
        'naver',
        ['pc-naver-mate-intent-root-measured', 'live-source-intent-query-root'],
      ));
    if (rootTopUpMetrics.length > 0) {
      const measuredRootTopUp = await measureKeywordMetrics(rootTopUpMetrics, context);
      measuredMetrics = [...measuredMetrics, ...measuredRootTopUp];
      finalMetrics = prioritizeNaverMateMeasuredMetrics(measuredMetrics, params.targetCount, 50000);
    }
  }
  if (params.includeVolumeMetrics && finalMetrics.length < Math.min(naverMateMinimumUsefulCount, 12) && roots.length > 0) {
    context.progress(
      82,
      `Naver Mate measured pool has ${finalMetrics.length}/${params.targetCount}; collecting second-hop expansions`,
    );
    const topUpRows = await Promise.all(roots
      .filter((keyword) => !autoDiscovery || isNaverMateUtilityRootCandidate(keyword))
      .slice(0, autoDiscovery ? Math.min(4, roots.length) : Math.min(16, roots.length))
      .map((root) =>
      collectLiveExpansionCandidates(
        root,
        autoDiscovery ? Math.min(35, Math.max(16, params.targetCount)) : Math.min(80, Math.max(30, params.targetCount)),
        env,
        context,
        params.contextKeywords,
      ).catch(() => [] as LiveExpansionCandidate[])
    ));
    const existingKeys = new Set(ranked.map((item) => compactKeyword(item.keyword)).filter(Boolean));
    const topUpSeen = new Set<string>();
    const topUpMetrics = topUpRows.flat()
      .filter((item) => {
        const key = compactKeyword(item.keyword);
        if (!key || existingKeys.has(key) || topUpSeen.has(key)) return false;
        if (!isNaverMateConciseMeasuredCandidate(item.keyword)) return false;
        topUpSeen.add(key);
        return /(autocomplete|relkwd|related)/i.test([item.source, ...item.sources].join(' '));
      })
      .slice(0, Math.min(240, Math.max(80, params.targetCount * 5)))
      .map((item, index) => {
        const sourceText = [item.source, ...item.sources].join(' ');
        const source = /autocomplete/i.test(sourceText)
          ? 'pc-naver-autocomplete-second-hop'
          : 'pc-naver-related-keywords-second-hop';
        return metricFromExpansion(
          item.keyword,
          Math.max(45, 78 - index * 0.2),
          source,
          'naver-mate',
          'naver',
          [source, ...item.sources].slice(0, 8),
        );
      });
    if (topUpMetrics.length > 0) {
      const measuredTopUp = await measureKeywordMetrics(topUpMetrics, context);
      measuredMetrics = [...measuredMetrics, ...measuredTopUp];
      finalMetrics = prioritizeNaverMateMeasuredMetrics(measuredMetrics, params.targetCount, 50000);
    }
  }
  if (params.includeVolumeMetrics && finalMetrics.length < Math.min(naverMateMinimumUsefulCount, 12)) {
    context.progress(86, `Naver Mate measured pool low (${finalMetrics.length}/${params.targetCount}); measuring live source fallback`);
    const sourceFallback = await buildNaverMateLiveSourceFallbackMetrics(
      Math.min(180, Math.max(120, params.targetCount * 3)),
      context,
      measureKeywordMetrics,
    );
    measuredMetrics = [...measuredMetrics, ...sourceFallback];
    finalMetrics = prioritizeNaverMateMeasuredMetrics(measuredMetrics, params.targetCount, 50000);
  }
  const displayMetrics = params.includeVolumeMetrics
    ? finalMetrics.filter(isNaverMateDisplayQualityMetric)
    : finalMetrics;
  return resultFromMetrics(displayMetrics, startedAt, 'pc-engine-plus');
}

async function runKeywordAnalysis(
  job: MobileJobEnvelope<unknown, MobileKeywordResult>,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
  getEnvConfig: () => Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const params = asKeywordAnalysisParams(job.params);
  if (!params.keyword) throw new Error('keyword is required');

  context.progress(10, 'normalizing keyword analysis request');
  ensureNotAborted(context);

  context.progress(35, 'ranking related keywords with PC expansion engine');
  ensureNotAborted(context);
  const liveCandidates = await collectLiveExpansionCandidates(
    params.keyword,
    Math.max(params.maxRelatedCount * 3, 60),
    getEnvConfig(),
    context,
    params.contextKeywords,
  );
  if (liveCandidates.length === 0) {
    context.progress(52, 'no live related keyword source candidates; keeping exact keyword only');
  }

  const ranked = rankKeywordExpansionCandidates(
    params.keyword,
    liveCandidates,
    {
      limit: params.maxRelatedCount,
      minScore: 30,
      fallbackMinScore: 22,
      minKeep: Math.min(10, params.maxRelatedCount),
      ensureIntentCoverage: true,
      intentCoverageMin: Math.min(24, Math.max(8, params.maxRelatedCount)),
      allowSyntheticFallback: false,
    },
  );

  context.progress(75, 'building mobile result envelope');
  ensureNotAborted(context);

  const rankedMetrics = ranked.map((item) => metricFromExpansion(
    item.keyword,
    item.score,
    item.source || item.sources?.[0] || 'pc-expansion-ranker',
    'related-keyword',
      params.categoryId || 'auto',
      ['pc-keyword-expansion-ranker', ...item.reasons],
    ));
  const requestedMetric = metricFromExpansion(
    params.keyword,
    92,
    'pc-keyword-analysis-exact',
    'requested-keyword',
    params.categoryId || 'auto',
    ['pc-keyword-expansion-ranker', 'requested-keyword-exact-match'],
  );
  const seen = new Set<string>([compactKeyword(requestedMetric.keyword)]);
  const metrics = [
    requestedMetric,
    ...rankedMetrics.filter((item) => {
      const key = compactKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ].slice(0, params.maxRelatedCount + 1);
  const measuredMetrics = filterKeywordAnalysisMetrics(
    params.keyword,
    await measureKeywordMetrics(metrics, context),
  );

  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
}

async function runMindmapExpansion(
  job: MobileJobEnvelope<unknown, MobileKeywordResult>,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
  getEnvConfig: () => Partial<EnvConfig>,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const params = asMindmapParams(job.params);
  if (!params.seedKeyword) throw new Error('seedKeyword is required');

  context.progress(10, 'normalizing mindmap expansion request');
  ensureNotAborted(context);

  const expansionSeedKeyword = stripKnownIntent(params.seedKeyword) || params.seedKeyword;
  let candidates: MindmapExpansionCandidate[] = await collectLiveExpansionCandidates(
    expansionSeedKeyword,
    Math.max(params.targetCount * 3, 60),
    getEnvConfig(),
    context,
    params.contextKeywords,
    { includeSemanticBridge: true },
  );
  if (candidates.length === 0) {
    const aliasSeeds = buildKoreanNumericAliasRoots(expansionSeedKeyword, 4);
    if (aliasSeeds.length > 0) {
      context.progress(42, `collecting mindmap numeric alias candidates: ${aliasSeeds.join(', ')}`);
      const aliasRows = await Promise.all(aliasSeeds.map((alias) =>
        collectLiveExpansionCandidates(
          alias,
          Math.max(params.targetCount * 2, 40),
          getEnvConfig(),
          context,
          params.contextKeywords,
          { includeSemanticBridge: true },
        ).catch(() => [] as MindmapExpansionCandidate[])
      ));
      candidates = aliasRows.flat();
    }
  }
  if (candidates.length === 0) {
    context.progress(52, 'no live mindmap candidates; measuring seed/context intent candidates');
    const fallback = params.includeVolumeMetrics
      ? await buildMeasuredMindmapSeedMetrics(
        params.seedKeyword,
        params.contextKeywords,
        params.targetCount,
        context,
        measureKeywordMetrics,
      )
      : [];
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }

  context.progress(45, 'ranking mindmap candidates with PC quality gate');
  ensureNotAborted(context);

  const ranked = rankMindmapExpansionCandidates(
    expansionSeedKeyword,
    candidates,
    params.targetCount,
  );

  context.progress(80, 'building mobile mindmap result envelope');
  ensureNotAborted(context);

  const rankedMetrics = ranked
    .map((item) => ({
      ...item,
      keyword: normalizeMindmapSearchPhrase(item.keyword),
    }))
    .filter((item) => isMindmapSearchPhraseCandidate(item.keyword))
    .map((item) => metricFromExpansion(
      item.keyword,
      item.score,
      item.source || item.sources?.[0] || 'pc-mindmap-ranker',
      'mindmap-expansion',
      'auto',
      ['pc-mindmap-expansion-quality', ...item.reasons],
    ));
  const metrics = rankedMetrics.slice(0, params.targetCount);
  const measuredMetrics = params.includeVolumeMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;
  let finalMetrics = params.includeVolumeMetrics
    ? prioritizeMindmapMeasuredMetrics(measuredMetrics, params.targetCount)
    : measuredMetrics;
  const sourceOnlyMetrics = metrics.filter((metric) => !isFullyMeasuredKeyword(metric));

  const minimumMeasuredMindmapRows = Math.min(params.targetCount, 10);
  if (params.includeVolumeMetrics && finalMetrics.length < minimumMeasuredMindmapRows) {
    context.progress(88, `mindmap measured pool low (${finalMetrics.length}/${minimumMeasuredMindmapRows}); measuring seed/context fallback`);
    const fallback = await buildMeasuredMindmapSeedMetrics(
      params.seedKeyword,
      [
        ...(params.contextKeywords || []),
        ...metrics.map((item) => ({
          keyword: item.keyword,
          source: item.source,
          evidence: item.evidence,
        })),
      ],
      params.targetCount,
      context,
      measureKeywordMetrics,
    );
    finalMetrics = mergePrioritizedKeywordMetrics([finalMetrics, fallback, sourceOnlyMetrics], params.targetCount);
  }
  if (!params.includeVolumeMetrics && finalMetrics.length < params.targetCount && sourceOnlyMetrics.length > 0) {
    finalMetrics = mergePrioritizedKeywordMetrics([finalMetrics, sourceOnlyMetrics], params.targetCount);
  }

  const mindmapResult = resultFromMetrics(finalMetrics, startedAt, 'pc-engine-plus');
  if (!params.includeVolumeMetrics) return mindmapResult;
  return withKeywordResultSummary(
    mindmapResult,
    mindmapResult.keywords.filter((item) => item.grade !== 'C'),
  );
}

export function createMobilePcEngineExecutor(
  options: MobilePcEngineExecutorOptions = {},
): MobileJobExecutor {
  const baseGetEnvConfig = options.getEnvConfig || defaultEnvConfig;

  return async (job, context) => {
    context.progress(5, 'accepted by MobilePcEngineExecutor');
    ensureNotAborted(context);
    const getJobEnvConfig = () => mergeJobApiCredentials(baseGetEnvConfig(), job.params);
    const jobMeasureKeywordMetrics = options.measureKeywordMetrics
      || createUserKeyRescueMetricsAdapter(
        createDefaultKeywordMetricsAdapter(
          getJobEnvConfig,
          job.product === 'keyword-analysis',
        ),
        createDefaultKeywordMetricsAdapter(
          baseGetEnvConfig,
          job.product === 'keyword-analysis',
        ),
        hasUserNaverCredentialOverride(job.params),
      );

    switch (job.product) {
      case 'keyword-analysis': {
        const params = asKeywordAnalysisParams(job.params);
        const result = await runKeywordAnalysis(job, context, jobMeasureKeywordMetrics, getJobEnvConfig);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'mindmap-expansion': {
        const params = asMindmapParams(job.params);
        const result = await runMindmapExpansion(job, context, jobMeasureKeywordMetrics, getJobEnvConfig);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'golden-discovery': {
        const params = asGoldenParams(job.params);
        const adapter = options.runGoldenDiscovery
          || ((payload, ctx) => runGoldenDiscoveryWithPcMdp(payload, ctx, getJobEnvConfig));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(normalizeGoldenDiscoveryResult(result, params.targetCount), params, job.product, getJobEnvConfig());
      }
      case 'pro-traffic-hunter': {
        const params = asProTrafficParams(job.params);
        const adapter = options.runProTraffic
          || ((payload, ctx) => runProTrafficWithPcHunter(payload, ctx, jobMeasureKeywordMetrics));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'home-board-hunter': {
        const params = asHomeBoardParams(job.params);
        const adapter = options.runHomeBoard
          || ((payload, ctx) => runHomeBoardWithPcPlanner(payload, ctx, jobMeasureKeywordMetrics));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'kin-hidden-honey': {
        const params = asKinHiddenHoneyParams(job.params);
        const result = options.runKinHiddenHoney
          ? await options.runKinHiddenHoney(params, context)
          : await runKinHiddenHoneyWithPcHunter(params, context, jobMeasureKeywordMetrics, getJobEnvConfig);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'shopping-connect': {
        const params = asShoppingConnectParams(job.params);
        const adapter = options.runShoppingConnect
          || ((payload, ctx) => runShoppingConnectWithPcEngine(payload, ctx, jobMeasureKeywordMetrics));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'youtube-golden': {
        const params = asYoutubeGoldenParams(job.params);
        const adapter = options.runYoutubeGolden
          || ((payload, ctx) => runYoutubeGoldenWithPcEngine(payload, ctx, getJobEnvConfig, jobMeasureKeywordMetrics));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      case 'naver-mate-hunter': {
        const params = asNaverMateParams(job.params);
        const adapter = options.runNaverMate
          || ((payload, ctx) => runNaverMateWithPcEngine(payload, ctx, jobMeasureKeywordMetrics, getJobEnvConfig));
        const result = await adapter(params, context);
        return await withAgentAssistSummary(result, params, job.product, getJobEnvConfig());
      }
      default:
        throw new Error(`unsupported mobile product: ${job.product}`);
    }
  };
}
