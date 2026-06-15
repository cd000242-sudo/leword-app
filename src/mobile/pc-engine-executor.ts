import {
  type GoldenDiscoveryMobileParams,
  type HomeBoardMobileParams,
  type KeywordAnalysisMobileParams,
  type KinHiddenHoneyMobileParams,
  type MindmapExpansionMobileParams,
  type NaverMateMobileParams,
  type MobileJobEnvelope,
  type MobileKeywordMetric,
  type MobileKeywordProduct,
  type MobileKeywordResult,
  type MobileResultGrade,
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
import {
  buildMobileSourceSignalSnapshot,
} from './source-signals';

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
  };
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
  const directIntents = [
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
    ...directIntents.map((intentKeyword) => `${base} ${intentKeyword}`),
    ...buildCleanIntentCandidates(seed, Math.max(6, limit * 2)),
  ].filter((keyword) => {
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

function asShoppingConnectParams(params: unknown): ShoppingConnectMobileParams {
  const payload = (params || {}) as Partial<ShoppingConnectMobileParams>;
  const sort = payload.sort === 'date' || payload.sort === 'asc' || payload.sort === 'dsc'
    ? payload.sort
    : 'sim';
  return {
    keyword: normalizeKeyword(payload.keyword),
    targetCount: clampInt(payload.targetCount, 30, 30, 80),
    sort,
  };
}

function asYoutubeGoldenParams(params: unknown): YoutubeGoldenMobileParams {
  const payload = (params || {}) as Partial<YoutubeGoldenMobileParams>;
  return {
    maxResults: clampInt(payload.maxResults, 50, 10, 100),
    categoryId: payload.categoryId ? normalizeKeyword(payload.categoryId) : undefined,
    crossReferenceNaver: payload.crossReferenceNaver !== false,
  };
}

function asNaverMateParams(params: unknown): NaverMateMobileParams {
  const payload = (params || {}) as Partial<NaverMateMobileParams>;
  return {
    seedKeyword: normalizeKeyword(payload.seedKeyword),
    targetCount: clampInt(payload.targetCount, 50, 1, 120),
    includeAutocomplete: payload.includeAutocomplete !== false,
    includeRelated: payload.includeRelated !== false,
    includeVolumeMetrics: payload.includeVolumeMetrics !== false,
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

async function collectLiveExpansionCandidates(
  seed: string,
  limit: number,
  env: Partial<EnvConfig>,
  context: MobileJobExecutorContext,
): Promise<Array<{ keyword: string; sources: string[]; source: string; freq: number; monthlyVolume?: number }>> {
  const clientId = envValue(env, 'naverClientId', 'NAVER_CLIENT_ID');
  const clientSecret = envValue(env, 'naverClientSecret', 'NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) return [];

  const config = { clientId, clientSecret };
  const byKey = new Map<string, { keyword: string; sources: string[]; source: string; freq: number; monthlyVolume?: number }>();
  const add = (keyword: string, source: string, monthlyVolume?: number) => {
    const normalized = normalizeKeyword(keyword);
    const key = compactKeyword(normalized);
    if (!normalized || normalized.length < 2 || normalized.length > 42 || !key) return;
    const current = byKey.get(key);
    if (current) {
      current.freq += 1;
      if (!current.sources.includes(source)) current.sources.push(source);
      if (typeof monthlyVolume === 'number') current.monthlyVolume = Math.max(current.monthlyVolume || 0, monthlyVolume);
      return;
    }
    byKey.set(key, {
      keyword: normalized,
      sources: [source],
      source,
      freq: 1,
      monthlyVolume,
    });
  };

  const [autocomplete, related] = await Promise.all([
    import('../utils/naver-autocomplete')
      .then(mod => mod.getNaverAutocompleteKeywords(seed, config))
      .catch(() => [] as string[]),
    import('../utils/naver-datalab-api')
      .then(mod => mod.getNaverRelatedKeywords(seed, config, { limit: Math.min(80, Math.max(20, limit)) }))
      .catch(() => [] as Array<{ keyword?: string; searchVolume?: number; monthlyVolume?: number }>),
  ]);
  ensureNotAborted(context);

  for (const keyword of autocomplete || []) add(keyword, 'autocomplete');
  for (const item of related || []) {
    const row = item as any;
    add(
      String(row?.keyword || ''),
      'naver-relkwd',
      typeof row?.searchVolume === 'number'
        ? row.searchVolume
        : (typeof row?.monthlyVolume === 'number' ? row.monthlyVolume : undefined),
    );
  }

  return Array.from(byKey.values()).slice(0, Math.max(limit, 1));
}

function buildServerFallbackExpansionCandidates(
  seed: string,
  limit: number,
  source: string,
): Array<{ keyword: string; sources: string[]; source: string; freq: number; monthlyVolume?: number }> {
  return buildCleanIntentCandidates(seed, Math.max(limit, 1)).map((keyword, index) => ({
    keyword,
    sources: [source],
    source,
    freq: Math.max(1, limit - index),
  }));
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
  measureKeywordMetrics?: MobileKeywordMetricsAdapter,
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
  const measuredMetrics = measureKeywordMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;
  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
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

async function runKinHiddenHoneyWithPcHunter(
  params: KinHiddenHoneyMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
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
  if (metrics.length === 0) {
    const fallback = await buildSourceSignalMetrics(
      'all',
      params.targetCount,
      context,
      'pc-kin-live-source-fallback',
      'kin-question-source-gap',
      measureKeywordMetrics,
    );
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }
  return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
}

async function runShoppingConnectWithPcEngine(
  params: ShoppingConnectMobileParams,
  context: MobileJobExecutorContext,
  measureKeywordMetrics: MobileKeywordMetricsAdapter,
): Promise<MobileKeywordResult> {
  const startedAt = Date.now();
  const autoDiscovery = !params.keyword;
  const rootKeyword = params.keyword || '쇼핑 자동 발굴';

  context.progress(10, autoDiscovery ? 'starting PC shopping auto discovery' : `starting PC shopping connect for ${params.keyword}`);
  ensureNotAborted(context);

  const shopping = await import('../utils/naver-shopping-api');
  const discovery = await import('../utils/shopping-keyword-suggestions');
  const searchPlans = autoDiscovery
    ? (await discovery.getShoppingDiscoverySeeds(params.targetCount)).slice(0, Math.min(30, params.targetCount)).map((seed) => ({
        keyword: seed.keyword,
        source: 'auto-discovery' as const,
        reason: seed.reason,
      }))
    : [{
        keyword: params.keyword,
        source: 'direct' as const,
        reason: 'direct shopping keyword',
      }];
  if (searchPlans.length === 0) throw new Error('shopping discovery seeds are empty');

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
    context.progress(35, `shopping quota exhausted; using SearchAd/OpenAPI measured commerce fallback for ${rootKeyword}`);
    const fallback = await buildMeasuredIntentFallback(
      rootKeyword,
      params.targetCount,
      'pc-shopping-quota-searchad-fallback',
      'commerce-entry',
      'shopping',
      context,
      measureKeywordMetrics,
    );
    return {
      total: 0,
      items: [],
      fallbackMetrics: fallback,
    } as any;
  }
  ensureNotAborted(context);

  if (Array.isArray((result as any).fallbackMetrics)) {
    return resultFromMetrics((result as any).fallbackMetrics, startedAt, 'pc-engine-plus');
  }

  const shoppingItems = Array.isArray(result.items) ? result.items : [];
  if (shoppingItems.length === 0) {
    context.progress(45, `shopping returned 0 products; using SearchAd/OpenAPI measured commerce fallback for ${rootKeyword}`);
    const fallback = await buildMeasuredIntentFallback(
      rootKeyword,
      params.targetCount,
      'pc-shopping-empty-searchad-fallback',
      'commerce-entry',
      'shopping',
      context,
      measureKeywordMetrics,
    );
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }

  const scoredItems = shoppingItems.map((item) => ({
    ...item,
    conversionScore: shopping.computeConversionScore(item),
  }));
  const rankedItems = shopping.rankShoppingOpportunities(
    scoredItems,
    {
      keyword: rootKeyword,
      intentPrimary: 'buy',
      totalHits: result.total,
      relatedKeywords: [],
      crossSourceSeeds: [],
    },
    Math.max(params.targetCount, 30),
    { balanceDiscovery: true },
  );

  context.progress(55, `building LeWord entry keywords from ${rankedItems.length} shopping products`);
  ensureNotAborted(context);

  const metrics: MobileKeywordMetric[] = [];
  const seen = new Set<string>();
  for (const item of rankedItems) {
    const seeds = shopping.buildProductLeWordSeeds(item, item.discoveryQuery || rootKeyword, 5);
    if (seeds.length === 0) {
      seeds.push({
        keyword: normalizeKeyword(item.cleanTitle || item.simplifiedTitle || item.title || item.discoveryQuery || rootKeyword),
        relation: 'same-product',
        reason: 'shopping product opportunity',
      });
    }
    for (const seed of seeds) {
      const key = compactKeyword(seed.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      metrics.push(metricFromShoppingSeed(seed, item, item.discoveryQuery || rootKeyword));
      if (metrics.length >= params.targetCount) break;
    }
    if (metrics.length >= params.targetCount) break;
  }

  const measuredMetrics = await measureKeywordMetrics(metrics, context);
  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
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
  const trending = await youtube.getYouTubeTrending({
    apiKey,
    maxResults: params.maxResults,
    categoryId: params.categoryId,
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

  const seen = new Set<string>();
  const metrics = golden
    .map((item) => metricFromYoutubeKeyword(item, crossByKeyword.get(compactKeyword(item.keyword))))
    .filter((item) => {
      const key = compactKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, params.maxResults);

  if (metrics.length === 0) {
    const fallback = await buildSourceSignalMetrics(
      'all',
      params.maxResults,
      context,
      'pc-youtube-live-source-fallback',
      'youtube-trend-source-gap',
      params.crossReferenceNaver ? measureKeywordMetrics : undefined,
    );
    return resultFromMetrics(fallback, startedAt, 'pc-engine-plus');
  }

  return resultFromMetrics(metrics, startedAt, 'pc-engine-plus');
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
  const candidates: Array<{ keyword: string; score: number; source: string; evidence: string[] }> = [
    {
      keyword: params.seedKeyword,
      score: 88,
      source: 'naver-mate-seed',
      evidence: ['pc-naver-mate-seed'],
    },
  ];

  const addCandidate = (keyword: unknown, score: number, source: string, evidence: string[]) => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) return;
    candidates.push({ keyword: normalized, score, source, evidence });
  };

  if (params.includeAutocomplete) {
    context.progress(20, 'collecting Naver autocomplete signals');
    ensureNotAborted(context);
    const autocomplete = await import('../utils/naver-autocomplete');
    const keywords = await autocomplete.getNaverAutocompleteKeywords(params.seedKeyword, config)
      .catch((err: any) => {
        context.progress(30, `Naver autocomplete unavailable: ${err?.message || err}`);
        return [] as string[];
      });
    keywords.slice(0, params.targetCount * 2).forEach((keyword, index) => {
      addCandidate(keyword, Math.max(45, 86 - index * 0.55), 'pc-naver-autocomplete', [
        'pc-naver-autocomplete',
        'naver-pc-mobile-shopping-related',
      ]);
    });
  }

  if (params.includeRelated) {
    context.progress(48, 'collecting Naver related keyword signals');
    ensureNotAborted(context);
    const datalab = await import('../utils/naver-datalab-api');
    const related = await datalab.getNaverRelatedKeywords(params.seedKeyword, config, {
      limit: Math.min(100, Math.max(params.targetCount, 30)),
      spiderWebDepth: 1,
    }).catch((err: any) => {
      context.progress(58, `Naver related keywords unavailable: ${err?.message || err}`);
      return [] as any[];
    });
    related.forEach((item: any, index: number) => {
      const volumeScore = Math.min(22, Math.log10(Math.max(1, Number(item?.searchVolume || 0))) * 6);
      addCandidate(item?.keyword, Math.max(45, 78 - index * 0.35 + volumeScore), 'pc-naver-related-keywords', [
        'pc-naver-related-keywords',
        normalizeKeyword(item?.intent),
        normalizeKeyword(item?.category),
      ].filter(Boolean));
    });
  }

  context.progress(72, `ranking ${candidates.length} Naver Mate candidates`);
  ensureNotAborted(context);

  const seen = new Set<string>();
  const ranked = candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = compactKeyword(item.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, params.targetCount)
    .map((item) => metricFromExpansion(
      item.keyword,
      item.score,
      item.source,
      'naver-mate',
      'naver',
      item.evidence,
    ));

  const measuredMetrics = params.includeVolumeMetrics
    ? await measureKeywordMetrics(ranked, context)
    : ranked;
  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
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
  let liveCandidates = await collectLiveExpansionCandidates(
    params.keyword,
    Math.max(params.maxRelatedCount * 3, 60),
    getEnvConfig(),
    context,
  );
  if (liveCandidates.length === 0) {
    liveCandidates = buildServerFallbackExpansionCandidates(
      params.keyword,
      Math.max(params.maxRelatedCount * 3, 60),
      'server-intent-template',
    );
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
  const measuredMetrics = await measureKeywordMetrics(metrics, context);

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

  let candidates: MindmapExpansionCandidate[] = await collectLiveExpansionCandidates(
    params.seedKeyword,
    Math.max(params.targetCount * 3, 60),
    getEnvConfig(),
    context,
  );
  const usingServerFallback = candidates.length === 0;
  if (usingServerFallback) {
    candidates = buildServerFallbackExpansionCandidates(
      params.seedKeyword,
      Math.max(params.targetCount * 3, 60),
      'server-mindmap-intent-template',
    );
  }

  context.progress(45, 'ranking mindmap candidates with PC quality gate');
  ensureNotAborted(context);

  const ranked = usingServerFallback
    ? candidates.slice(0, params.targetCount).map((item, index) => ({
      keyword: item.keyword,
      score: Math.max(45, 82 - index * 0.5),
      source: item.source,
      sources: item.sources,
      reasons: ['server-zero-live-fallback', item.source],
    }))
    : rankMindmapExpansionCandidates(
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
  const metrics = rankedMetrics.slice(0, params.targetCount);
  const measuredMetrics = params.includeVolumeMetrics
    ? await measureKeywordMetrics(metrics, context)
    : metrics;

  return resultFromMetrics(measuredMetrics, startedAt, 'pc-engine-plus');
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
      || createDefaultKeywordMetricsAdapter(getJobEnvConfig);

    switch (job.product) {
      case 'keyword-analysis':
        return runKeywordAnalysis(job, context, jobMeasureKeywordMetrics, getJobEnvConfig);
      case 'mindmap-expansion':
        return runMindmapExpansion(job, context, jobMeasureKeywordMetrics, getJobEnvConfig);
      case 'golden-discovery': {
        const params = asGoldenParams(job.params);
        const adapter = options.runGoldenDiscovery
          || ((payload, ctx) => runGoldenDiscoveryWithPcMdp(payload, ctx, getJobEnvConfig));
        const result = await adapter(params, context);
        return normalizeGoldenDiscoveryResult(result, params.targetCount);
      }
      case 'pro-traffic-hunter': {
        const params = asProTrafficParams(job.params);
        const adapter = options.runProTraffic
          || ((payload, ctx) => runProTrafficWithPcHunter(payload, ctx, jobMeasureKeywordMetrics));
        return adapter(params, context);
      }
      case 'home-board-hunter': {
        const params = asHomeBoardParams(job.params);
        const adapter = options.runHomeBoard
          || ((payload, ctx) => runHomeBoardWithPcPlanner(payload, ctx, jobMeasureKeywordMetrics));
        return adapter(params, context);
      }
      case 'kin-hidden-honey': {
        const params = asKinHiddenHoneyParams(job.params);
        if (options.runKinHiddenHoney) return options.runKinHiddenHoney(params, context);
        return runKinHiddenHoneyWithPcHunter(params, context, jobMeasureKeywordMetrics);
      }
      case 'shopping-connect': {
        const params = asShoppingConnectParams(job.params);
        const adapter = options.runShoppingConnect
          || ((payload, ctx) => runShoppingConnectWithPcEngine(payload, ctx, jobMeasureKeywordMetrics));
        return adapter(params, context);
      }
      case 'youtube-golden': {
        const params = asYoutubeGoldenParams(job.params);
        const adapter = options.runYoutubeGolden
          || ((payload, ctx) => runYoutubeGoldenWithPcEngine(payload, ctx, getJobEnvConfig, jobMeasureKeywordMetrics));
        return adapter(params, context);
      }
      case 'naver-mate-hunter': {
        const params = asNaverMateParams(job.params);
        const adapter = options.runNaverMate
          || ((payload, ctx) => runNaverMateWithPcEngine(payload, ctx, jobMeasureKeywordMetrics, getJobEnvConfig));
        return adapter(params, context);
      }
      default:
        throw new Error(`unsupported mobile product: ${job.product}`);
    }
  };
}
