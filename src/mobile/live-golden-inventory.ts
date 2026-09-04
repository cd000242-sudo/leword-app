import type {
  MobileLiveGoldenBoardItem,
  MobileLiveGoldenInventoryItem,
  MobileLiveGoldenInventoryReasonCode,
  MobileLiveGoldenInventorySnapshot,
  MobileLiveGoldenInventoryState,
  MobileLiveGoldenPurposeTag,
  MobileMeasurementConfidence,
} from './contracts';
import {
  calculateAdsenseRPM,
  calculateInfoIntentScore,
  calculateYmylRisk,
  classifySearchIntent,
} from '../utils/adsense-keyword-hunter';
import { estimateCPC } from '../utils/profit-golden-keyword-engine';

const INVENTORY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SURGE_TTL_MS = 48 * 60 * 60 * 1_000;
const TRAFFIC_SURGE_LANE = 'traffic-surge';

const STATE_LABELS: Record<MobileLiveGoldenInventoryState, string> = {
  verified: '검증 완료',
  watch: '관찰 중',
  surge: '실시간 급상승',
  expired: '측정 만료',
  rejected: '검증 제외',
};

const REASON_LABELS: Record<MobileLiveGoldenInventoryReasonCode, string> = {
  'verified-all-gates-passed': '실측·품질·게시 가능 조건을 모두 통과했습니다.',
  'watch-quality-gate-pending': '실측은 완료됐지만 Verified 품질 게이트 통과를 기다립니다.',
  'surge-recent-demand-spike': '최근 48시간 이내 실측된 급상승 수요입니다.',
  'expired-measurement-ttl': '측정 유효기간이 지나 재측정이 필요합니다.',
  'rejected-unmeasured': '필수 검색량 또는 문서수 실측이 없어 표시 대상에서 제외했습니다.',
};

const TRANSITIONS: Readonly<Record<MobileLiveGoldenInventoryState, readonly MobileLiveGoldenInventoryState[]>> = {
  verified: ['watch', 'expired', 'rejected'],
  watch: ['verified', 'surge', 'expired', 'rejected'],
  surge: ['verified', 'watch', 'expired', 'rejected'],
  expired: ['watch', 'rejected'],
  rejected: ['watch'],
};

export interface BuildLiveGoldenPhase2InventoryInput {
  verified: readonly MobileLiveGoldenBoardItem[];
  board: readonly MobileLiveGoldenBoardItem[];
  references: readonly MobileLiveGoldenBoardItem[];
  now?: Date;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseIsoOr(value: string | undefined, fallback: string): string {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizedSearchVolumeSource(item: MobileLiveGoldenBoardItem): string {
  switch (item.searchVolumeSource) {
    case 'searchad': return 'naver-searchad';
    case 'cache': return 'naver-searchad-cache';
    case 'manual': return 'manual-measurement';
    default: return 'unknown';
  }
}

function normalizedDocumentCountSource(item: MobileLiveGoldenBoardItem): string {
  switch (item.documentCountSource) {
    case 'naver-api': return 'naver-blog-search-api';
    case 'cache': return 'naver-blog-search-api-cache';
    case 'scrape': return 'naver-blog-search-scrape';
    case 'fallback': return 'fallback-measurement';
    default: return 'unknown';
  }
}

function lowerConfidence(
  left: MobileMeasurementConfidence | undefined,
  right: MobileMeasurementConfidence | undefined,
  estimated: boolean,
): MobileMeasurementConfidence {
  if (estimated || left === 'low' || right === 'low' || !left || !right) return 'low';
  if (left === 'medium' || right === 'medium') return 'medium';
  return 'high';
}

function measurementComplete(item: MobileLiveGoldenBoardItem): boolean {
  const measuredStatus = !item.measurementStatus || item.measurementStatus === 'measured';
  const sourcesKnown = normalizedSearchVolumeSource(item) !== 'unknown'
    && normalizedDocumentCountSource(item) !== 'unknown';
  return item.isMeasured === true
    && measuredStatus
    && finitePositive(item.totalSearchVolume)
    && finiteNonNegative(item.documentCount)
    && finitePositive(item.goldenRatio)
    && sourcesKnown;
}

function inventoryReason(
  state: MobileLiveGoldenInventoryState,
): MobileLiveGoldenInventoryReasonCode {
  switch (state) {
    case 'verified': return 'verified-all-gates-passed';
    case 'watch': return 'watch-quality-gate-pending';
    case 'surge': return 'surge-recent-demand-spike';
    case 'expired': return 'expired-measurement-ttl';
    case 'rejected': return 'rejected-unmeasured';
  }
}

function commercialPurpose(item: MobileLiveGoldenBoardItem): boolean {
  const text = `${item.keyword} ${item.intent}`.toLocaleLowerCase('ko-KR');
  return /(비교|추천|가격|구매|할인|후기|리뷰|최저가|견적|신청|가입|렌탈|보험|대출|commercial|transaction)/i.test(text);
}

function purposeTags(item: MobileLiveGoldenBoardItem, state: MobileLiveGoldenInventoryState): MobileLiveGoldenPurposeTag[] {
  const tags: MobileLiveGoldenPurposeTag[] = ['naver-traffic', 'adsense-rpm'];
  if (commercialPurpose(item)) tags.push('affiliate-commerce');
  if (state === 'surge') tags.push('realtime-surge');
  return tags;
}

function scenario(searchVolume: number, rpm: number, trafficCaptureRate: number) {
  const expectedMonthlyClicks = Math.round(searchVolume * trafficCaptureRate);
  const expectedMonthlyPageviews = expectedMonthlyClicks;
  return {
    trafficCaptureRate,
    expectedMonthlyClicks,
    expectedMonthlyPageviews,
    monthlyRevenueKrw: Math.round((expectedMonthlyPageviews * rpm) / 1_000),
  };
}

function toInventoryItem(
  item: MobileLiveGoldenBoardItem,
  state: MobileLiveGoldenInventoryState,
  measuredAt: string,
  expiresAt: string,
): MobileLiveGoldenInventoryItem {
  const reasonCode = inventoryReason(state);
  const hasMeasuredCpc = finitePositive(item.cpc) && item.isMeasured === true;
  const cpc = hasMeasuredCpc ? item.cpc : estimateCPC(item.keyword, item.category || 'default');
  const infoIntentScore = calculateInfoIntentScore(item.keyword);
  const ymyl = calculateYmylRisk(item.keyword);
  const intentType = classifySearchIntent(item.keyword).primary;
  const rpm = Math.max(0, calculateAdsenseRPM({
    keyword: item.keyword,
    category: item.category || 'default',
    cpc,
    infoIntentScore,
    ymylScore: ymyl.score,
    intentType,
  }));
  const searchVolume = finiteNonNegative(item.totalSearchVolume) ? item.totalSearchVolume : 0;
  const estimatedMeasurement = item.isSearchVolumeEstimated === true || item.isDocumentCountEstimated === true;
  const complete = measurementComplete(item);
  const evidence = [
    ...item.evidence,
    `검색량 출처: ${normalizedSearchVolumeSource(item)}`,
    `문서수 출처: ${normalizedDocumentCountSource(item)}`,
    `측정 시각: ${measuredAt}`,
  ];

  return {
    ...item,
    state,
    reasonCode,
    purposeTags: purposeTags(item, state),
    expiresAt,
    measurement: {
      complete,
      measuredAt,
      expiresAt,
      confidence: lowerConfidence(
        item.searchVolumeConfidence,
        item.documentCountConfidence,
        estimatedMeasurement,
      ),
      sources: {
        searchVolume: normalizedSearchVolumeSource(item),
        documentCount: normalizedDocumentCountSource(item),
      },
    },
    scores: {
      market: {
        score: finiteNonNegative(item.score) ? item.score : 0,
        source: 'server-live-golden-score',
      },
      personalFit: {
        score: null,
        status: 'not-evaluated',
        reason: 'profile-required',
      },
    },
    revenueEvidence: {
      cpc: {
        amountKrw: cpc,
        source: hasMeasuredCpc ? 'naver-searchad' : 'profit-golden-keyword-engine',
        estimated: !hasMeasuredCpc,
      },
      rpm: {
        amountKrw: rpm,
        source: 'adsense-keyword-hunter',
        estimated: true,
      },
      scenarios: {
        conservative: scenario(searchVolume, rpm, 0.01),
        base: scenario(searchVolume, rpm, 0.03),
        aggressive: scenario(searchVolume, rpm, 0.07),
      },
      disclaimer: '검색량·예상 유입률·RPM을 바탕으로 계산한 추정 시나리오이며 실제 수익을 보장하지 않습니다.',
    },
    display: {
      grade: item.grade,
      stateLabel: STATE_LABELS[state],
      reason: REASON_LABELS[reasonCode],
      reasonCode,
      evidence,
    },
  };
}

export function canTransitionLiveGoldenInventory(
  from: MobileLiveGoldenInventoryState,
  to: MobileLiveGoldenInventoryState,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function buildLiveGoldenPhase2Inventory(
  input: BuildLiveGoldenPhase2InventoryInput,
): MobileLiveGoldenInventorySnapshot {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const verifiedIds = new Set(input.verified.map((item) => item.id));
  const rows = new Map<string, MobileLiveGoldenBoardItem>();

  for (const row of input.references) rows.set(row.id, row);
  for (const row of input.board) rows.set(row.id, row);
  for (const row of input.verified) rows.set(row.id, row);

  const items = [...rows.values()].map((row) => {
    const measuredAt = parseIsoOr(row.searchVolumeMeasuredAt, parseIsoOr(row.updatedAt, now.toISOString()));
    const isSurge = String(row.lane || '').trim().toLowerCase() === TRAFFIC_SURGE_LANE;
    const ttlMs = isSurge ? SURGE_TTL_MS : INVENTORY_TTL_MS;
    const expiresAt = new Date(Date.parse(measuredAt) + ttlMs).toISOString();
    const complete = measurementComplete(row);
    let state: MobileLiveGoldenInventoryState;
    if (!complete) state = 'rejected';
    else if (nowMs > Date.parse(expiresAt)) state = 'expired';
    else if (isSurge) state = 'surge';
    else if (verifiedIds.has(row.id)) state = 'verified';
    else state = 'watch';
    return toInventoryItem(row, state, measuredAt, expiresAt);
  }).sort((left, right) => {
    const stateOrder: Record<MobileLiveGoldenInventoryState, number> = {
      verified: 0,
      watch: 1,
      surge: 2,
      expired: 3,
      rejected: 4,
    };
    const stateDelta = stateOrder[left.state] - stateOrder[right.state];
    if (stateDelta !== 0) return stateDelta;
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.keyword.localeCompare(right.keyword, 'ko-KR');
  });

  const counts: MobileLiveGoldenInventorySnapshot['counts'] = {
    total: items.length,
    verified: 0,
    watch: 0,
    surge: 0,
    expired: 0,
    rejected: 0,
  };
  for (const item of items) counts[item.state] += 1;

  return {
    contractVersion: 'phase2-inventory-v1',
    generatedAt: now.toISOString(),
    counts,
    items,
    verified: items.filter((item) => item.state === 'verified'),
    watch: items.filter((item) => item.state === 'watch'),
    surge: items.filter((item) => item.state === 'surge'),
  };
}

