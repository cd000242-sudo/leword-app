import {
  type GoldenDiscoveryMobileParams,
  type HomeBoardMobileParams,
  type KeywordAnalysisMobileParams,
  type KinHiddenHoneyMobileParams,
  type MindmapExpansionMobileParams,
  type MobileJobEnvelope,
  type MobileKeywordMetric,
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobileResultGrade,
  type ProTrafficMobileParams,
} from './contracts';
import {
  type MobileJobExecutor,
  type MobileJobExecutorContext,
} from './job-orchestrator';
import {
  rankKeywordExpansionCandidates,
} from '../utils/keyword-expansion-ranker';
import {
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
  calculateMindmapMetricGrade,
} from '../utils/mindmap-metrics';
import {
  countSss,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
} from '../utils/golden-discovery-floor';
import {
  discoverDirectGoldenKeywords,
} from '../utils/direct-golden-keyword-miner';

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

export type MobileKeywordMetricsAdapter = (
  metrics: MobileKeywordMetric[],
  context: MobileJobExecutorContext,
) => Promise<MobileKeywordMetric[]>;

export interface MobilePcEngineExecutorOptions {
  runGoldenDiscovery?: MobileGoldenDiscoveryAdapter;
  runProTraffic?: MobileProTrafficAdapter;
  runHomeBoard?: MobileHomeBoardAdapter;
  runKinHiddenHoney?: MobileKinHiddenHoneyAdapter;
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

function compactKeyword(value: string): string {
  return normalizeKeyword(value).toLowerCase().replace(/\s+/g, '');
}

function finiteNumber(value: unknown): number | null {
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
  const grade = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (grade === 'SSS' || grade === 'SS' || grade === 'S' || grade === 'A' || grade === 'B') {
    return grade;
  }
  if (fallbackScore >= 85) return 'SSS';
  if (fallbackScore >= 75) return 'SS';
  if (fallbackScore >= 65) return 'S';
  if (fallbackScore >= 55) return 'A';
  if (fallbackScore >= 45) return 'B';
  return 'C';
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
  };
}

function metricFromMdpResult(result: MDPResult, categoryId: string): MobileKeywordMetric {
  const totalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount);
  return {
    keyword: normalizeKeyword(result.keyword),
    grade: normalizeGrade(result.grade, result.score),
    score: finiteNumber(result.score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(result.goldenRatio),
    cpc: finiteNumber(result.cpc),
    category: categoryId || (result.categoryMatched ? 'matched' : 'auto'),
    source: 'pc-mdp-engine',
    intent: result.intent || 'golden-discovery',
    evidence: [
      'pc-mdp-engine',
      result.goldenReason || '',
      ...(result.externalSources || []),
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null && documentCount !== null,
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

function metricFromProResult(result: ProTrafficKeyword, categoryId: string): MobileKeywordMetric {
  const totalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount);
  const cpc = finiteNumber(result.profitAnalysis?.estimatedCPC)
    ?? finiteNumber(result.revenueEstimate?.estimatedCPC)
    ?? null;

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
  return {
    keyword: normalizeKeyword(question?.title),
    grade: normalizeGrade(question?.honeyPotGrade ?? question?.goldenGrade, score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: finiteNumber(question?.viewCount),
    documentCount: finiteNumber(question?.answerCount),
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
    ].filter(Boolean),
    isMeasured: true,
  };
}

function resultFromMetrics(
  keywords: MobileKeywordMetric[],
  startedAt: number,
  parityMode: MobileKeywordResult['summary']['parityMode'] = 'pc-engine',
): MobileKeywordResult {
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: keywords.filter((item) => item.grade === 'SSS').length,
      measured: keywords.filter((item) => item.isMeasured).length,
      elapsedMs: Date.now() - startedAt,
      fromCache: false,
      parityMode,
    },
  };
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

function stripKnownIntent(seed: string): string {
  let out = normalizeKeyword(seed);
  const trailing = [
    '신청방법', '신청 방법', '신청자격', '자격', '대상', '혜택', '서류', '기간', '마감', '조회', '확인',
    '피해 확인', '피해 조회', '보상', '대처', '예방법', '해결', '방법', '후기', '가격', '추천',
  ];
  for (const intent of trailing) {
    out = out.replace(new RegExp(`\\s*${intent.replace(/\s+/g, '\\s*')}$`, 'i'), '').trim();
  }
  return out || normalizeKeyword(seed);
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
    categoryId: normalizeKeyword(payload.categoryId) || 'all',
    targetCount: clampInt(payload.targetCount, 30, 1, 250),
    seedKeyword: payload.seedKeyword ? normalizeKeyword(payload.seedKeyword) : undefined,
    includeSeasonal: payload.includeSeasonal !== false,
    includeEvergreen: payload.includeEvergreen !== false,
    includeFreshIssue: payload.includeFreshIssue !== false,
  };
}

function asHomeBoardParams(params: unknown): HomeBoardMobileParams {
  const payload = (params || {}) as Partial<HomeBoardMobileParams>;
  return {
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
    tabType: tab,
    targetCount: clampInt(payload.targetCount, 15, 1, 100),
    isPremiumRequest: payload.isPremiumRequest === true || tab === 'trending' || tab === 'hidden',
  };
}

function asKeywordAnalysisParams(params: unknown): KeywordAnalysisMobileParams {
  const payload = (params || {}) as Partial<KeywordAnalysisMobileParams>;
  return {
    keyword: normalizeKeyword(payload.keyword),
    categoryId: payload.categoryId ? normalizeKeyword(payload.categoryId) : undefined,
    maxRelatedCount: clampInt(payload.maxRelatedCount, 10, 1, 250),
    includeMindmapPreview: payload.includeMindmapPreview !== false,
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
    seedKeyword: normalizeKeyword(payload.seedKeyword),
    depth: clampInt(payload.depth, 1, 1, 3),
    targetCount: clampInt(payload.targetCount, 50, 1, 250),
    includeVolumeMetrics: payload.includeVolumeMetrics !== false,
  };
}

function defaultEnvConfig(): Partial<EnvConfig> {
  return EnvironmentManager.getInstance().getConfig();
}

function envValue(env: Partial<EnvConfig>, key: keyof EnvConfig, ...envNames: string[]): string {
  for (const name of envNames) {
    const value = normalizeKeyword(process.env[name]);
    if (value) return value;
  }
  return normalizeKeyword(env[key] || '');
}

function addEvidence(evidence: string[], value: string): string[] {
  return evidence.includes(value) ? evidence : [...evidence, value];
}

async function fetchNaverBlogDocumentCount(
  keyword: string,
  env: Partial<EnvConfig>,
  signal: AbortSignal,
): Promise<number | null> {
  const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
  const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1&sort=sim`;
    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const total = finiteNumber(data?.total);
    return total !== null && total >= 0 ? total : null;
  } catch (error) {
    if (signal.aborted) throw new Error('cancelled');
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onAbort);
  }
}

async function fetchNaverBlogDocumentCountMap(
  keywords: string[],
  env: Partial<EnvConfig>,
  context: MobileJobExecutorContext,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const pending = [...keywords];
  const workerCount = Math.min(5, Math.max(1, pending.length));

  const worker = async () => {
    while (pending.length > 0) {
      ensureNotAborted(context);
      const keyword = pending.shift();
      if (!keyword) continue;
      const documentCount = await fetchNaverBlogDocumentCount(keyword, env, context.signal);
      out.set(compactKeyword(keyword), documentCount);
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
  if (!accessLicense || !secretKey) return out;

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

function mergeMeasuredMetric(
  metric: MobileKeywordMetric,
  volume: KeywordSearchVolume | undefined,
  documentCount: number | null | undefined,
): MobileKeywordMetric {
  const pcSearchVolume = finiteNumber(volume?.pcSearchVolume) ?? metric.pcSearchVolume;
  const mobileSearchVolume = finiteNumber(volume?.mobileSearchVolume) ?? metric.mobileSearchVolume;
  const totalFromVolume = finiteNumber(volume?.totalSearchVolume);
  const totalSearchVolume = totalFromVolume
    ?? ((pcSearchVolume !== null || mobileSearchVolume !== null)
      ? (pcSearchVolume || 0) + (mobileSearchVolume || 0)
      : metric.totalSearchVolume);
  const resolvedDocumentCount = documentCount !== undefined
    ? documentCount
    : metric.documentCount;
  const cpc = finiteNumber(volume?.monthlyAveCpc) ?? metric.cpc;
  const goldenRatio = ratioFromMetrics(totalSearchVolume, resolvedDocumentCount) ?? metric.goldenRatio;
  const isMeasured = totalSearchVolume !== null && resolvedDocumentCount !== null;

  let evidence = metric.evidence;
  if (volume && totalSearchVolume !== null) {
    evidence = addEvidence(evidence, 'pc-searchad-volume');
    if (volume.pcSearchVolumeLt10 || volume.mobileSearchVolumeLt10) {
      evidence = addEvidence(evidence, 'pc-searchad-lt10-range');
    }
  }
  if (resolvedDocumentCount !== null && resolvedDocumentCount !== metric.documentCount) {
    evidence = addEvidence(evidence, 'pc-naver-blog-document-count');
  }
  if (!isMeasured) {
    evidence = addEvidence(evidence, 'metric-measurement-partial-or-unavailable');
  }

  return {
    ...metric,
    pcSearchVolume,
    mobileSearchVolume,
    totalSearchVolume,
    documentCount: resolvedDocumentCount,
    goldenRatio,
    cpc,
    grade: measuredGrade(metric.grade, totalSearchVolume, resolvedDocumentCount, goldenRatio),
    evidence,
    isMeasured,
  };
}

function createDefaultKeywordMetricsAdapter(
  getEnvConfig: () => Partial<EnvConfig>,
): MobileKeywordMetricsAdapter {
  return async (metrics, context) => {
    const env = getEnvConfig();
    const keywords = metrics.map((item) => normalizeKeyword(item.keyword)).filter(Boolean);
    if (keywords.length === 0) return metrics;

    const hasSearchAdConfig = !!(
      envValue(env, 'naverSearchAdAccessLicense', 'NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCHAD_ACCESS_LICENSE')
      && envValue(env, 'naverSearchAdSecretKey', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCHAD_SECRET_KEY')
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

    const [volumeMap, documentCountMap] = await Promise.all([
      hasSearchAdConfig ? fetchSearchAdVolumeMap(keywords, env, context) : Promise.resolve(new Map<string, KeywordSearchVolume>()),
      hasOpenApiConfig ? fetchNaverBlogDocumentCountMap(keywords, env, context) : Promise.resolve(new Map<string, number | null>()),
    ]);
    ensureNotAborted(context);

    return metrics.map((metric) => {
      const key = compactKeyword(metric.keyword);
      return mergeMeasuredMetric(
        metric,
        volumeMap.get(key),
        documentCountMap.has(key) ? documentCountMap.get(key) : undefined,
      );
    });
  };
}

function requireNaverOpenApiConfig(
  env: Partial<EnvConfig>,
  product: MobileKeywordProduct,
): { clientId: string; clientSecret: string } {
  const clientId = normalizeKeyword(env.naverClientId);
  const clientSecret = normalizeKeyword(env.naverClientSecret);
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
          ? Math.max(1800, Math.min(3600, Math.max(visibleNeed, directNeed) * 120))
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
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  context.progress(8, `starting PC PRO traffic hunter for ${params.categoryId}`);
  ensureNotAborted(context);

  const result: ProTrafficHuntResult = await huntProTrafficKeywords({
    mode: 'category',
    category: params.categoryId,
    seedKeywords: params.seedKeyword ? [params.seedKeyword] : [],
    targetRookie: true,
    includeSeasonKeywords: params.includeSeasonal,
    explosionMode: params.includeFreshIssue,
    useDeepMining: true,
    discoveryFirst: params.targetCount >= 50,
    fastDiscovery: params.targetCount >= 100,
    count: params.targetCount,
    forceRefresh: true,
  });
  ensureNotAborted(context);

  context.progress(88, `PC PRO hunter returned ${result.keywords.length}/${params.targetCount}`);
  const metrics = result.keywords
    .slice(0, params.targetCount)
    .map((item) => metricFromProResult(item, params.categoryId))
    .filter((item) => item.keyword);
  return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
}

async function runHomeBoardWithPcPlanner(
  params: HomeBoardMobileParams,
  context: MobileJobExecutorContext,
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
  return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
}

async function runKinHiddenHoneyWithPcHunter(
  params: KinHiddenHoneyMobileParams,
  context: MobileJobExecutorContext,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  context.progress(10, `starting PC KIN hunter: ${params.tabType}`);
  ensureNotAborted(context);

  const kin = await import('../utils/naver-kin-golden-hunter-v3');
  let result: any;
  if (params.tabType === 'trending') {
    result = await kin.getTrendingHiddenQuestions();
  } else if (params.tabType === 'hidden') {
    result = await kin.fullHunt();
  } else if (params.tabType === 'latest') {
    result = await kin.getRisingQuestions();
  } else {
    result = await kin.getPopularQnA();
  }
  ensureNotAborted(context);

  context.progress(88, `PC KIN hunter returned ${result?.goldenQuestions?.length || 0}/${params.targetCount}`);
  const metrics = (result?.goldenQuestions || [])
    .slice(0, params.targetCount)
    .map(metricFromKinQuestion)
    .filter((item: MobileKeywordMetric) => item.keyword);
  return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
}

async function runKeywordAnalysis(
  job: MobileJobEnvelope<unknown, MobileKeywordResult>,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const params = asKeywordAnalysisParams(job.params);
  if (!params.keyword) throw new Error('keyword is required');

  context.progress(10, 'normalizing keyword analysis request');
  ensureNotAborted(context);

  const intentFallbacks = buildCleanIntentCandidates(
    params.keyword,
    Math.max(params.maxRelatedCount * 2, 24),
  );

  context.progress(35, 'ranking related keywords with PC expansion engine');
  ensureNotAborted(context);

  const ranked = rankKeywordExpansionCandidates(
    params.keyword,
    intentFallbacks.map((keyword, index) => ({
      keyword,
      sources: ['pc-intent-expansion'],
      source: 'pc-intent-expansion',
      freq: Math.max(1, intentFallbacks.length - index),
      priority: Math.max(1, intentFallbacks.length - index),
    })),
    {
      limit: params.maxRelatedCount,
      minScore: 30,
      fallbackMinScore: 22,
      minKeep: Math.min(10, params.maxRelatedCount),
      ensureIntentCoverage: true,
      intentCoverageMin: Math.min(24, Math.max(8, params.maxRelatedCount)),
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
  const coverageMetrics = intentFallbacks
    .slice(0, Math.min(6, params.maxRelatedCount))
    .map((keyword) => metricFromExpansion(
      keyword,
      72,
      'pc-intent-expansion',
      'related-keyword',
      params.categoryId || 'auto',
      ['pc-keyword-expansion-ranker', 'intent-coverage-preserved'],
    ));
  const metrics = mergeCoverageMetrics(coverageMetrics, rankedMetrics, params.maxRelatedCount);
  const measuredMetrics = await measureKeywordMetrics(metrics, context);

  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
}

async function runMindmapExpansion(
  job: MobileJobEnvelope<unknown, MobileKeywordResult>,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const params = asMindmapParams(job.params);
  if (!params.seedKeyword) throw new Error('seedKeyword is required');

  context.progress(10, 'normalizing mindmap expansion request');
  ensureNotAborted(context);

  const fallbackKeywords = buildCleanIntentCandidates(
    params.seedKeyword,
    Math.max(params.targetCount * 2, 60),
  );

  const candidates: MindmapExpansionCandidate[] = fallbackKeywords.map((keyword, index) => ({
    keyword,
    sources: ['pc-mindmap-intent-expansion'],
    source: 'pc-mindmap-intent-expansion',
    freq: Math.max(1, fallbackKeywords.length - index),
    priority: Math.max(1, fallbackKeywords.length - index),
  }));

  context.progress(45, 'ranking mindmap candidates with PC quality gate');
  ensureNotAborted(context);

  const ranked = rankMindmapExpansionCandidates(
    params.seedKeyword,
    candidates,
    params.targetCount,
  );

  context.progress(80, 'building mobile mindmap result envelope');
  ensureNotAborted(context);

  const rankedMetrics = ranked.map((item) => metricFromExpansion(
    item.keyword,
    item.score,
    item.source || item.sources?.[0] || 'pc-mindmap-ranker',
    'mindmap-expansion',
    'auto',
    ['pc-mindmap-expansion-quality', ...item.reasons],
  ));
  const coverageMetrics = fallbackKeywords
    .slice(0, Math.min(8, params.targetCount))
    .map((keyword) => metricFromExpansion(
      keyword,
      72,
      'pc-mindmap-intent-expansion',
      'mindmap-expansion',
      'auto',
      ['pc-mindmap-expansion-quality', 'intent-coverage-preserved'],
    ));
  const metrics = mergeCoverageMetrics(coverageMetrics, rankedMetrics, params.targetCount);
  const measuredMetrics = params.includeVolumeMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;

  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
}

export function createMobilePcEngineExecutor(
  options: MobilePcEngineExecutorOptions = {},
): MobileJobExecutor {
  const getEnvConfig = options.getEnvConfig || defaultEnvConfig;
  const measureKeywordMetrics = options.measureKeywordMetrics
    || createDefaultKeywordMetricsAdapter(getEnvConfig);

  return async (job, context) => {
    context.progress(5, 'accepted by MobilePcEngineExecutor');
    ensureNotAborted(context);

    switch (job.product) {
      case 'keyword-analysis':
        return runKeywordAnalysis(job, context, measureKeywordMetrics);
      case 'mindmap-expansion':
        return runMindmapExpansion(job, context, measureKeywordMetrics);
      case 'golden-discovery': {
        const params = asGoldenParams(job.params);
        const adapter = options.runGoldenDiscovery
          || ((payload, ctx) => runGoldenDiscoveryWithPcMdp(payload, ctx, getEnvConfig));
        const result = await adapter(params, context);
        return normalizeGoldenDiscoveryResult(result, params.targetCount);
      }
      case 'pro-traffic-hunter': {
        const params = asProTrafficParams(job.params);
        const adapter = options.runProTraffic || runProTrafficWithPcHunter;
        return adapter(params, context);
      }
      case 'home-board-hunter': {
        const params = asHomeBoardParams(job.params);
        const adapter = options.runHomeBoard || runHomeBoardWithPcPlanner;
        return adapter(params, context);
      }
      case 'kin-hidden-honey': {
        const params = asKinHiddenHoneyParams(job.params);
        const adapter = options.runKinHiddenHoney || runKinHiddenHoneyWithPcHunter;
        return adapter(params, context);
      }
      default:
        throw new Error(`unsupported mobile product: ${job.product}`);
    }
  };
}
