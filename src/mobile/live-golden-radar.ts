import {
  MOBILE_PC_PARITY_SLA,
  type MobileDocumentCountSource,
  type MobileLiveGoldenBoardItem,
  type MobileLiveGoldenFreshness,
  type MobileMeasurementConfidence,
  type MobileKeywordMetric,
  type MobileKeywordResult,
  type MobileLiveGoldenRadarSnapshot,
  type MobileResultGrade,
  type MobileSearchVolumeSource,
} from './contracts';
import type { MobileNotificationInbox } from './notification-inbox';
import { EnvironmentManager, type EnvConfig } from '../utils/environment-manager';
import {
  discoverDirectGoldenKeywords,
  resolveDirectGoldenBulkSssTarget,
} from '../utils/direct-golden-keyword-miner';
import { classifyKeywordIntent, getNaverKeywordSearchVolumeSeparate } from '../utils/naver-datalab-api';
import { getNaverAutocompleteKeywords } from '../utils/naver-autocomplete';
import {
  getNaverSearchAdKeywordSuggestions,
  type NaverSearchAdConfig,
} from '../utils/naver-searchad-api';
import * as fs from 'fs';
import * as path from 'path';
import {
  countSss,
  isActionableGoldenKeyword,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
  scoreGoldenKeywordVirality,
} from '../utils/golden-discovery-floor';
import type { MDPResult } from '../utils/mdp-engine';
import { classifyKeyword } from '../utils/categories';
import { getDiscoveryCategorySeeds } from '../utils/category-discovery-map';
import { measureDocumentCount, type DcMeasurement } from '../utils/measure-dc';
import {
  getNaverBlogOpenApiQuotaBlockedUntil,
  isNaverBlogOpenApiQuotaBlocked,
} from '../utils/naver-blog-api';
import { evaluatePublishDecision } from './publish-decision';
import {
  applyKeywordAiJudge,
  hasTrustedDocumentCountMeasurement,
  hasTrustedSearchVolumeMeasurement,
  hasUltimateHighValueNeedIntent,
  isUltimateGoldenKeywordCandidate,
  isUltimateLowValueLookupKeyword,
} from './keyword-ai-judge';

export interface MobileLiveGoldenRadarRunGate {
  ok: boolean;
  message?: string;
}

export interface MobileLiveGoldenRadarOptions {
  notificationInbox?: MobileNotificationInbox | null;
  intervalMs?: number;
  runOnStart?: boolean;
  runOnStartDelayMs?: number;
  cycleLimit?: number;
  boardTarget?: number;
  publicPreviewCount?: number;
  boardFile?: string;
  resultCacheFile?: string;
  keywordCacheFile?: string;
  probeQueueFile?: string;
  maxSeeds?: number;
  maxCandidates?: number;
  startupCatchUpCycles?: number;
  categories?: string[];
  getEnvConfig?: () => Partial<EnvConfig>;
  discover?: (
    config: { clientId: string; clientSecret: string },
    options: Parameters<typeof discoverDirectGoldenKeywords>[1],
  ) => Promise<MDPResult[]>;
  liveSeedProvider?: (categoryId: string) => Promise<string[]>;
  measureLiveSearchVolumeSeparate?: typeof getNaverKeywordSearchVolumeSeparate;
  measureLiveDocumentCount?: typeof measureDocumentCount;
  autocompleteProvider?: typeof getNaverAutocompleteKeywords;
  searchAdSuggestionProvider?: typeof getNaverSearchAdKeywordSuggestions;
  enableBackfill?: boolean;
  refreshBoardFileOnSnapshot?: boolean;
  shouldRun?: () => MobileLiveGoldenRadarRunGate | boolean;
  setIntervalFn?: (handler: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  now?: () => Date;
}

type LiveSearchVolumeRow = Awaited<ReturnType<typeof getNaverKeywordSearchVolumeSeparate>>[number];

interface LiveMeasuredProbeQueueItem {
  keyword: string;
  category: string;
  source: string;
  priority: number;
  firstSeenAt: string;
  lastTriedAt?: string;
  attempts: number;
  misses: number;
}

const DEFAULT_CATEGORIES = Object.freeze([
  'shopping',
  'electronics',
  'home_life',
  'travel_domestic',
  'food',
  'beauty',
  'fashion',
  'policy',
  'finance',
  'health',
  'life_tips',
  'it',
  'ai_tool',
  'recipe',
  'travel_overseas',
  'game',
  'all',
]);

const PUBLIC_PREVIEW_ROTATION_MS = 60_000;
const LIVE_SEED_COLLECTION_TIMEOUT_MS = 5_000;
const LIVE_DISCOVERY_TIMEOUT_MS = 80_000;
const LIVE_BACKFILL_TIMEOUT_MS = 105_000;
const LIVE_BACKFILL_STAGE_TIMEOUT_MS = 115_000;
const LIVE_GLOBAL_BACKFILL_STAGE_TIMEOUT_MS = 95_000;
const LIVE_ISSUE_FALLBACK_TIMEOUT_MS = 25_000;
const LIVE_SPLIT_ENRICHMENT_TIMEOUT_MS = 25_000;
const PUBLIC_PREVIEW_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const LIVE_BOARD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_BOARD_FILE_REFRESH_MS = 30_000;
const LIVE_SNAPSHOT_CACHE_MS = 5_000;
const BROAD_KEYWORD_VOLUME_CEILING = 500_000;
const BROAD_KEYWORD_DOCUMENT_CEILING = 80_000;
const PUBLIC_PREVIEW_VOLUME_CEILING = 250_000;
const PUBLIC_PREVIEW_DOCUMENT_CEILING = 30_000;
const PUBLIC_PREVIEW_PROFILE_INTENT_MAX = 0;
const PUBLIC_PREVIEW_PROTECTED_TOP_COUNT = 3;
const LIVE_BOARD_CATEGORY_SHARE_CAP = 0.18;
const LIVE_BOARD_CLUSTER_MAX = 2;
const LIVE_BOARD_CATEGORY_ABSOLUTE_MAX = 16;
const LIVE_BOARD_EPISODE_LOOKUP_SHARE_CAP = 0.05;
const LIVE_BOARD_EPISODE_LOOKUP_ABSOLUTE_MAX = 3;
const LIVE_BOARD_CONTENT_LOOKUP_SHARE_CAP = 0.10;
const LIVE_BOARD_CONTENT_LOOKUP_ABSOLUTE_MAX = 6;
const LIVE_BOARD_STRICT_READY_MIN = 60;
const LIVE_DIRECT_CANDIDATE_MAX_PER_CYCLE = 7200;
const LIVE_ISSUE_FALLBACK_DOCUMENT_LIMIT = 16;
const LIVE_ISSUE_FALLBACK_CONCURRENCY = 2;
const LIVE_BACKFILL_VOLUME_PASS_MAX = 360;
const LIVE_BACKFILL_DOCUMENT_PASS_MAX = 240;
const LIVE_BACKFILL_DOCUMENT_CONCURRENCY = 3;
const LIVE_BACKFILL_DOCUMENT_SUPPLEMENT_MAX = 90;
const LIVE_ISSUE_DOCUMENT_SUPPLEMENT_MAX = 8;
const LIVE_BACKFILL_CANDIDATE_LIMIT_MAX = 1800;
const LIVE_MEASURED_PROBE_CANDIDATE_LIMIT_MAX = 1440;
const LIVE_BACKFILL_MEASURED_PROBE_SHARE_ALL = 0.65;
const LIVE_BACKFILL_MEASURED_PROBE_SHARE_CATEGORY = 0.25;
const LIVE_REFERENCE_SSS_PROBE_MIN_VOLUME = 500;
const LIVE_REFERENCE_SSS_PROBE_MIN_RATIO = 1.5;
const LIVE_REFERENCE_SSS_PROBE_LIMIT = 720;
const LIVE_REFERENCE_SSS_PROBE_PRIORITY_BOOST = 620;
const LIVE_BOARD_SPLIT_ENRICHMENT_LIMIT = 80;
const LIVE_SEARCHAD_VOLUME_BATCH_SIZE = 4;
const LIVE_SEARCHAD_VOLUME_BATCH_TIMEOUT_MS = 28_000;
const LIVE_SEARCHAD_VOLUME_MIN_REMAINING_MS = 2_000;
const LIVE_PROBE_QUEUE_FILE_NAME = 'live-golden-probe-queue.json';
const LIVE_PROBE_QUEUE_MAX_ITEMS = 5000;
const LIVE_PROBE_QUEUE_FAMILY_MAX_ITEMS = 12;
const LIVE_PROBE_QUEUE_CATEGORY_SHARE_CAP = 0.32;
const LIVE_PROBE_QUEUE_MAX_ATTEMPTS = 4;
const LIVE_PROBE_QUEUE_NO_RESULT_MAX = 2;
const LIVE_PROBE_QUEUE_RETRY_DELAY_MS = 90 * 60 * 1000;
const LIVE_CACHE_PROMOTION_MAX_CANDIDATES = 96;
const LIVE_CACHE_PROMOTION_BATCH_SIZE = 6;
const LIVE_CACHE_PROMOTION_BATCH_TIMEOUT_MS = 16_000;
const LIVE_CACHE_PROMOTION_MIN_VOLUME = 100;
const LIVE_CACHE_PROMOTION_MIN_RATIO = 0.5;
const LIVE_CACHE_PROMOTION_STRONG_NEED_MIN_RATIO = 0.08;
const LIVE_CACHE_PROMOTION_STRONG_NEED_DOCUMENT_CEILING = 80_000;
const LIVE_SEARCHAD_CANDIDATE_MIN_CHARS = 3;
const LIVE_SEARCHAD_CANDIDATE_MAX_CHARS = 30;
const LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS = 5;
const LIVE_QUOTA_RETRY_BUFFER_MS = 5_000;
const LIVE_QUOTA_RETRY_MIN_DELAY_MS = 1_000;
const NEWS_HEADLINE_FRAGMENT_RE = /(?:\uBD80\uCE5C\uC0C1|\uC0AC\uACFC|\uAD6C\uC18D\uC601\uC7A5|\uD610\uC758|\uC870\uC0AC|\uB17C\uB780|\uC911\uB2E8|\uC778\uC99D|\uC9C0\uC5F0|\uBC15\uC218|\uC120\uC218\uB4E4|\uBC29\uBB38|\uC2AC\uD514|\uD574\uBA85|\uBC1C\uC5B8|\uC120\uACE0|\uCCB4\uD3EC|\uC555\uC218\uC218\uC0C9|\uC0AC\uB9DD|\uBCC4\uC138|\uACB0\uBCC4|\uC5F4\uC560|\uD63C\uC778)/u;

function formatKstRetryAt(untilMs: number | null): string {
  if (!untilMs) return '';
  const kst = new Date(untilMs + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('.000Z', ' KST');
  return `; retry after ${kst}`;
}

function liveQuotaRetryDelayMs(untilMs: number, nowMs: number, intervalMs: number): number {
  return Math.max(
    LIVE_QUOTA_RETRY_MIN_DELAY_MS,
    Math.min(intervalMs, Math.floor(untilMs - nowMs + LIVE_QUOTA_RETRY_BUFFER_MS)),
  );
}
const SEMANTIC_CLUSTER_SUFFIX_RE = new RegExp(`(?:${[
  '\\uBA87\\uBD80\\uC791',
  '\\uCD9C\\uC5F0\\uC9C4',
  '\\uBC29\\uC1A1\\uC2DC\\uAC04',
  '\\uC7AC\\uBC29\\uC1A1',
  '\\uB4F1\\uAE09\\uCEF7',
  '\\uB2F5\\uC9C0',
  '\\uB2F9\\uCCA8\\uBC88\\uD638',
  '\\uC608\\uB9E4',
  '\\uC77C\\uC815',
  '\\uC2E0\\uCCAD',
  '\\uAC00\\uC785',
  '\\uB300\\uC0C1',
  '\\uC790\\uACA9',
  '\\uC870\\uAC74',
  '\\uC870\\uD68C',
  '\\uC9C0\\uAE09\\uC77C',
  '\\uBC29\\uBC95',
  '\\uC900\\uBE44\\uBB3C',
  '\\uAC00\\uACA9\\uBE44\\uAD50',
  '\\uCD94\\uCC9C',
  '\\uD6C4\\uAE30',
  '\\uB2E4\\uC2DC\\uBCF4\\uAE30',
  '\\uACB0\\uB9D0',
  '\\uCFE0\\uD0A4\\uC601\\uC0C1',
  '\\uC8FC\\uCC28',
  '\\uC704\\uCE58',
  '\\uC11C\\uB958',
  '\\uB9C8\\uAC10\\uC77C',
  '\\uB9C8\\uAC10',
  '\\uBC1C\\uD45C',
  '\\uC911\\uACC4',
  '\\uB77C\\uC778\\uC5C5',
  '\\uD558\\uC774\\uB77C\\uC774\\uD2B8',
  '\\uC6D0\\uC791',
  '\\uB4F1\\uC7A5\\uC778\\uBB3C',
  '\\uC778\\uBB3C\\uAD00\\uACC4\\uB3C4',
  '\\uACF5\\uC2DD\\uC601\\uC0C1',
].join('|')})+$`, 'u');
const SEASONAL_CONTENT_CLUSTER_SUFFIX_RE = new RegExp(`(?:${[
  '\\uBA87\\uBD80\\uC791',
  '\\uCD9C\\uC5F0\\uC9C4',
  '\\uBC29\\uC1A1\\uC2DC\\uAC04',
  '\\uC7AC\\uBC29\\uC1A1',
  '\\uB2E4\\uC2DC\\uBCF4\\uAE30',
  '\\uACB0\\uB9D0',
  '\\uCFE0\\uD0A4\\uC601\\uC0C1',
  '\\uC6D0\\uC791',
  '\\uB4F1\\uC7A5\\uC778\\uBB3C',
  '\\uC778\\uBB3C\\uAD00\\uACC4\\uB3C4',
  '\\uACF5\\uC2DD\\uC601\\uC0C1',
].join('|')})+$`, 'u');
const EPISODE_LOOKUP_INTENT_RE = /\uBA87\uBD80\uC791/u;
const CONTENT_LOOKUP_INTENT_RE = /(?:\uBA87\uBD80\uC791|\uCD9C\uC5F0\uC9C4|\uBC29\uC1A1\uC2DC\uAC04|\uC7AC\uBC29\uC1A1|\uB2E4\uC2DC\uBCF4\uAE30|\uACB0\uB9D0|\uCFE0\uD0A4\uC601\uC0C1|\uC6D0\uC791|\uB4F1\uC7A5\uC778\uBB3C|\uC778\uBB3C\uAD00\uACC4\uB3C4|\uACF5\uC2DD\uC601\uC0C1)/u;
const LIVE_ULTIMATE_NEED_INTENT_RE = new RegExp([
  '\\uC2E0\\uCCAD\\uBC29\\uBC95',
  '\\uC2E0\\uCCAD',
  '\\uB300\\uC0C1',
  '\\uC790\\uACA9',
  '\\uC870\\uAC74',
  '\\uC9C0\\uAE09\\uC77C',
  '\\uC870\\uD68C',
  '\\uC11C\\uB958',
  '\\uB9C8\\uAC10',
  '\\uD658\\uAE09',
  '\\uC9C0\\uC6D0\\uAE08',
  '\\uD61C\\uD0DD',
  '\\uBC14\\uC6B0\\uCC98',
  '\\uC218\\uB2F9',
  '\\uAE09\\uC5EC',
  '\\uACC4\\uC0B0\\uAE30',
  '\\uACC4\\uC0B0',
  '\\uC2E4\\uC218\\uB839\\uC561',
  '\\uBCF4\\uC99D',
  '\\uD2B9\\uB840\\uBCF4\\uC99D',
  '\\uC138\\uC561\\uACF5\\uC81C',
  '\\uBCF4\\uD5D8',
  '\\uB300\\uCD9C',
  '\\uCCAD\\uC57D',
  '\\uC624\\uB958',
  '\\uC124\\uC815',
  '\\uC0AC\\uC6A9\\uBC95',
  '\\uC124\\uCE58',
  '\\uB2E4\\uC6B4\\uB85C\\uB4DC',
  '\\uD574\\uACB0',
  '\\uAC00\\uACA9\\uBE44\\uAD50',
  '\\uBE44\\uAD50',
  '\\uCD94\\uCC9C',
  '\\uD6C4\\uAE30',
  '\\uB9AC\\uBDF0',
  '\\uD560\\uC778',
  '\\uCFE0\\uD3F0',
  '\\uAD6C\\uB9E4\\uCC98',
  '\\uCD5C\\uC800\\uAC00',
  '\\uC7AC\\uACE0',
  '\\uBC30\\uC1A1',
  '\\uB80C\\uD0C8',
  '\\uAD50\\uCCB4',
  '\\uC218\\uB9AC',
  'AS',
  '\\uC911\\uACC4',
  '\\uACBD\\uAE30\\s*\\uC77C\\uC815',
  '\\uACBD\\uAE30\\s*\\uC2DC\\uAC04',
  '\\uBA85\\uB2E8',
  '\\uB77C\\uC778\\uC5C5',
  '\\uC120\\uBC1C',
  '\\uC5D4\\uD2B8\\uB9AC',
  '\\uC870\\uD3B8\\uC131',
  '\\uB300\\uC9C4\\uD45C',
  '\\uC0C1\\uB300\\uC804\\uC801',
  '\\uC21C\\uC704',
  '\\uACB0\\uACFC',
  '\\uC785\\uC7A5\\uB8CC',
  '\\uC8FC\\uCC28',
  '\\uC608\\uC57D',
  '\\uC608\\uB9E4',
  '\\uD2F0\\uCF13\\uD305',
  '\\uCDE8\\uC18C\\uD45C',
  '\\uD658\\uBD88',
  '\\uC88C\\uC11D',
  '\\uC219\\uC18C',
  '\\uACAC\\uC801',
].join('|'), 'iu');
const LIVE_LOW_VALUE_TOPIC_RE = new RegExp([
  '\\uD504\\uB85C\\uD544',
  '\\uC778\\uC2A4\\uD0C0',
  '\\uB098\\uC774',
  '\\uBA87\\uBD80\\uC791',
  '\\uCD9C\\uC5F0\\uC9C4',
  '\\uBC29\\uC1A1\\uC2DC\\uAC04',
  '\\uC7AC\\uBC29\\uC1A1',
  '\\uB2E4\\uC2DC\\uBCF4\\uAE30',
  '\\uACB0\\uB9D0',
  '\\uCFE0\\uD0A4\\uC601\\uC0C1',
  '\\uC6D0\\uC791',
  '\\uC778\\uBB3C\\uAD00\\uACC4\\uB3C4',
  '\\uACF5\\uC2DD\\uC601\\uC0C1',
  '\\uD558\\uC774\\uB77C\\uC774\\uD2B8',
  '\\uC2DC\\uCCAD\\uB960',
  '\\uB77C\\uC778\\uC5C5',
  '\\uC608\\uACE0\\uD3B8',
  '\\uC5F0\\uD328',
  '\\uD0C8\\uCD9C',
  '\\uD648\\uB7F0',
  '\\uC548\\uD0C0',
  '\\uC5ED\\uC804\\uACE8',
  '\\uC120\\uC218',
  '\\uB85C\\uB610',
  '\\uB2F9\\uCCA8\\uBC88\\uD638',
  '\\uB2F9\\uCCA8\\uC9C0\\uC5ED',
  '\\uB4F1\\uAE09\\uCEF7',
  '\\uC6D4\\uB4DC\\uCEF5',
  '\\uD504\\uB85C\\uC57C\\uAD6C',
  '\\uC62C\\uC2A4\\uD0C0\\uC804',
  '\\uD751\\uBED1\\uC1FC',
  '\\uB4DC\\uB77C\\uB9C8',
  'KBO',
  'MVP',
].join('|'), 'iu');
const LIVE_NEWS_ONLY_TOPIC_RE = new RegExp([
  '\\uB17C\\uB780',
  '\\uD574\\uBA85',
  '\\uACF5\\uC2DD\\uC785\\uC7A5',
  '\\uAE30\\uC790\\uD68C\\uACAC',
  '\\uD68C\\uB3D9',
  '\\uBC1C\\uC5B8',
  '\\uC218\\uC0AC',
  '\\uAD6C\\uC18D',
  '\\uD310\\uACB0',
  '\\uD30C\\uC7A5',
  '\\uC0AC\\uACFC',
  '\\uADFC\\uD669',
  '\\uBCC4\\uC138',
  '\\uC0AC\\uB9DD',
].join('|'), 'iu');
const LOW_VALUE_LIVE_SIGNAL_CATEGORY_RE = /^(?:celeb|drama|broadcast|movie|music|sports|issue|entertainment)$/i;
const LIVE_ULTIMATE_GENERAL_INTENTS = Object.freeze([
  '방법',
  '조회',
  '일정',
  '준비물',
  '후기',
  '비교',
  '가격',
  '주의사항',
]);
const LIVE_ULTIMATE_CATEGORY_INTENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  policy: [
    '신청 방법',
    '대상 조건',
    '자격 서류',
    '지급일 조회',
    '마감일',
    '환급 방법',
    '사용처',
    '금액 조회',
  ],
  finance: [
    '세액공제 조건',
    '금리 비교',
    '청약 일정',
    '환급 조회',
    '수수료 비교',
    '수혜주 전망',
  ],
  shopping: [
    '가격 비교',
    '추천 후기',
    '할인 쿠폰',
    '구매처 재고',
    '최저가',
    '실사용 후기',
  ],
  travel_domestic: [
    '주차',
    '입장료',
    '예약 방법',
    '운영시간',
    '준비물',
    '코스 후기',
  ],
  travel_overseas: [
    '비자 서류',
    '항공권 가격',
    '숙소 예약',
    '환전 준비물',
    '여행 일정',
    '입국 조건',
  ],
  health: [
    '보험 적용',
    '검사 비용',
    '예약 방법',
    '주의사항',
    '증상 체크',
    '병원 후기',
  ],
  it: [
    '오류 해결',
    '설정 사용법',
    '가격 비교',
    '다운로드 설치',
    '업데이트 방법',
    '대체 서비스',
  ],
  ai_tool: [
    '사용법',
    '가격 비교',
    '프롬프트',
    '오류 해결',
    '무료 대체',
    '업데이트',
  ],
  home_life: [
    '수리 비용',
    '교체 가격',
    '추천 후기',
    '오류 해결',
    '청소 방법',
    '렌탈 비교',
  ],
  food: [
    '메뉴 가격',
    '예약 방법',
    '영업시간',
    '주차',
    '웨이팅 후기',
    '포장 가능',
  ],
  recipe: [
    '레시피',
    '재료',
    '만드는 법',
    '보관법',
    '칼로리',
    '실패 원인',
  ],
  electronics: [
    '가격 비교',
    '스펙 비교',
    '추천 후기',
    '할인 정보',
    '출시일',
    '구매처',
  ],
  fashion: [
    '사이즈 추천',
    '코디',
    '할인 정보',
    '실착 후기',
    '브랜드 비교',
    '구매처',
  ],
  beauty: [
    '성분 비교',
    '사용 후기',
    '추천',
    '할인 정보',
    '부작용',
    '사용법',
  ],
  sports: [
    '중계 일정',
    '경기 일정',
    '예매 일정',
    '직관 준비물',
    '티켓 가격',
    '좌석 추천',
  ],
  education: [
    '시험 일정',
    '접수 방법',
    '준비물',
    '기출 범위',
    '발표 일정',
    '응시자격',
  ],
  music: [
    '콘서트 일정',
    '예매 일정',
    '티켓팅 방법',
    '좌석 가격',
    '굿즈 구매',
    '셋리스트',
  ],
  game: [
    '쿠폰',
    '업데이트',
    '공략',
    '사전예약',
    '출시일',
    '티어 추천',
  ],
});
const LIVE_ULTIMATE_EXPANDABLE_CATEGORIES = new Set([
  'policy',
  'finance',
  'shopping',
  'travel_domestic',
  'travel_overseas',
  'health',
  'it',
  'ai_tool',
  'home_life',
  'food',
  'recipe',
  'electronics',
  'fashion',
  'beauty',
  'sports',
  'education',
  'music',
  'game',
]);

const ROBUST_ACTIONABLE_TERMS = Object.freeze([
  '\uACC4\uC0B0\uAE30',
  '\uACC4\uC0B0',
  '\uC2E4\uC218\uB839\uC561',
  '\uC218\uB2F9',
  '\uAE09\uC5EC',
  '일정',
  '신청',
  '대상',
  '자격',
  '지급일',
  '조회',
  '방법',
  '조건',
  '서류',
  '마감',
  '발표',
  '예매',
  '가격비교',
  '추천',
  '후기',
  '준비물',
  '중계',
  '라인업',
  '하이라이트',
  '출연진',
  '몇부작',
  '방송시간',
  '다시보기',
  '결말',
  '쿠키영상',
  '공식영상',
  '공식입장',
  '현재 상황',
  '정리',
  '이유',
  '합의',
  '예상',
  '전망',
  '소식',
  '가능',
  '위치',
  '주차',
  '할인',
  '예약',
]);

const ROBUST_GENERAL_INTENTS = Object.freeze([
  '정리',
  '일정',
  '방법',
  '조회',
  '후기',
  '비교',
  '추천',
  '준비물',
]);

const ROBUST_CATEGORY_INTENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  policy: ['신청 방법', '지원 대상', '자격 조건', '지급일 조회', '서류', '마감', '혜택 정리'],
  sports: ['중계', '경기 일정', '예매 일정', '라인업', '하이라이트', '결과', '순위'],
  education: ['시험 일정', '접수', '발표 일정', '등급컷', '답지', '기출 범위', '준비물'],
  drama: ['몇부작', '출연진', '방송시간', '다시보기', '결말', '인물관계도', '공식영상'],
  broadcast: ['출연진', '방송시간', '다시보기', '공식영상', '방청 신청', '재방송'],
  movie: ['예매', '쿠키영상', '결말 해석', '출연진', '상영관', '후기'],
  music: ['콘서트 일정', '예매 일정', '티켓팅', '라인업', '굿즈', '셋리스트'],
  finance: ['주가 전망', '관련주', '실적 발표', '배당', '청약 일정', '수혜주'],
  life_tips: ['조회', '방법', '당첨번호', '당첨지역', '판매점', '준비물', '체크리스트'],
  health: ['증상', '원인', '검사', '치료', '예약', '주의사항'],
  food: ['맛집', '예약', '메뉴', '가격', '추천', '후기'],
  recipe: ['레시피', '재료', '만드는 법', '보관법', '칼로리'],
  electronics: ['가격비교', '추천', '후기', '스펙', '할인', '출시일'],
  fashion: ['코디', '브랜드', '사이즈', '후기', '할인', '추천'],
  beauty: ['성분', '후기', '추천', '비교', '사용법', '할인'],
  travel_domestic: ['일정', '예약', '주차', '입장료', '준비물', '후기'],
  travel_overseas: ['일정', '항공권', '비자', '준비물', '환율', '후기'],
  it: ['사용법', '설정', '오류 해결', '비교', '추천', '업데이트'],
  ai_tool: ['사용법', '가격', '비교', '추천', '프롬프트', '업데이트'],
  game: ['쿠폰', '업데이트', '티어', '공략', '사전예약', '출시일'],
  shopping: ['가격비교', '추천', '후기', '할인', '구매처', '최저가'],
  live_issue: ['정리', '현재 상황', '이유', '공식입장', '일정', '전망', '관련주'],
});

const ROBUST_CATEGORY_TERMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  life_tips: ['로또', '복권', '당첨번호', '당첨지역', '판매점', '장마', '준비물', '체크리스트'],
  sports: ['KBO', '프로야구', '야구', '축구', '농구', '배구', '월드컵', 'FIFA', '경기', '중계', '올스타전', '하이라이트'],
  policy: ['지원금', '정책', '지급', '청년', '복지', '부모급여', '보조금', '환급', '캐시백', '공휴일', '정부', '민생'],
  education: ['등급컷', '답지', '모의고사', '수능', '시험', '접수', '합격자', '기출'],
  broadcast: ['예능', '방송', '방송시간', '재방송', '다시보기', '방청', '공식영상'],
  drama: ['드라마', '몇부작', '출연진', '인물관계도', '등장인물'],
  movie: ['영화', '개봉', '예매', '쿠키영상', '상영관', '결말'],
  music: ['콘서트', '티켓팅', '예매', '라인업', '앨범', '노래', '가수', '셋리스트'],
  finance: ['주가', '증시', '코스피', '코스닥', '환율', '금리', '공모주', '청약', '실적', '배당', '관련주', '수혜주'],
  electronics: ['노트북', '휴대폰', '아이폰', '갤럭시', '청소기', '에어컨', '가전', '스펙'],
  beauty: ['선크림', '화장품', '성분', '피부', '뷰티'],
  fashion: ['코디', '브랜드', '사이즈', '패션'],
  food: ['맛집', '메뉴', '삼계탕', '카페', '디저트', '브런치', '베이커리', '핫플', '혼밥'],
  travel_domestic: ['제주', '부산', '강릉', '렌터카', '여행', '숙소'],
  health: ['증상', '검사', '치료', '병원', '입원', '격리'],
  it: ['AI', '앱', '오류', '업데이트', '설정', '사용법'],
  game: ['게임', '쿠폰', '사전예약', '티어', '공략'],
});

const ROBUST_STOP_TOKENS = new Set([
  '기자',
  '단독',
  '속보',
  '포착',
  '논란',
  '종료',
  '중단',
  '반박',
  '방문',
  '공개',
  '사진',
  '영상',
  '오늘',
  '이번주',
]);

const HIGH_VALUE_NEED_INTENT_RE = /(신청|대상|자격|조건|지급일|조회|예약|예매|티켓팅|가격|가격비교|비교|추천|후기|리뷰|방법|준비물|체크리스트|서류|마감|오류|설정|사용법|답지|등급컷|당첨번호|당첨지역|중계|라인업|관련주|전망|주가|주차|입장료|비용|견적|영업시간|위치|시간표|환급|지원금|장려금|보조금|바우처|수당|급여|계산기|계산|실수령액|세액공제|혜택|청약|쿠폰|할인|구매처|최저가|가성비|사전예약|출시일|발매일)/u;
const LOW_CONVERSION_LOOKUP_INTENT_RE = /(?:몇부작|출연진|방송시간|재방송|다시보기|결말|쿠키영상|원작|등장인물|인물관계도|공식영상|하이라이트|공식입장|해명|논란|기자회견|회동|발언|근황|비주얼|공개|소식|방한|방문|합의|악수|체결|파업|수사|구속|별세|끝내기|안타|MVP)/u;
const ADSENSE_NEED_INTENT_RE = /(?:신청|대상|자격|조건|지급일|조회|예약|예매|티켓팅|가격|가격비교|비교|추천|후기|리뷰|방법|준비물|체크리스트|서류|마감|설정|사용법|주차|입장료|비용|견적|영업시간|위치|시간표|환급|지원금|혜택|청약|쿠폰|할인|구매처|최저가|가성비|사전예약|출시일|발매일|보험|대출|카드|계좌|배송|재고|매장|예약방법|신청방법)/u;
const ADSENSE_LOW_VALUE_LOOKUP_RE = /(?:몇부작|출연진|방송시간|재방송|다시보기|결말|쿠키영상|원작|등장인물|인물관계도|공식영상|하이라이트|라인업|공식입장|해명|논란|기자회견|회동|발언|근황|비주얼|공개|소식|방한|방문|합의|악수|체결|파업|수사|구속|별세|끝내기|안타|MVP)/u;
const ADSENSE_LOTTO_LOOKUP_RE = /(?:로또|복권|당첨번호|당첨지역|판매점|실수령액)/u;
const ADSENSE_BRAND_SAFETY_NEWS_RE = /(?:사망|사고|혐의|조사|구속|체포|압수수색|기소|재판|선고|논란|공식입장|해명|기자회견|회동|발언|파업|별세|결별|열애|혼인|끝내기|안타|MVP|하이라이트|공식영상)/u;
const BROAD_BENEFIT_PRODUCT_RE = /(?:\uBC14\uC6B0\uCC98|\uC7A5\uB824\uAE08|\uC9C0\uC6D0\uAE08|\uBCF4\uC870\uAE08|\uC218\uB2F9|\uAE09\uC5EC|\uD61C\uD0DD|\uCE90\uC2DC\uBC31|\uD658\uAE09|\uCCAD\uC57D)/u;
const CONCRETE_PUBLISH_ACTION_RE = /(?:\uC2E0\uCCAD|\uC2E0\uCCAD\uBC29\uBC95|\uB300\uC0C1|\uC790\uACA9|\uC870\uAC74|\uC9C0\uAE09\uC77C|\uC870\uD68C|\uC11C\uB958|\uB9C8\uAC10|\uBC29\uBC95|\uACC4\uC0B0|\uBE44\uAD50|\uC608\uC57D|\uC608\uB9E4|\uAC00\uACA9|\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uD6C4\uAE30|\uCD94\uCC9C|\uC900\uBE44\uBB3C|\uC8FC\uC758\uC0AC\uD56D)/u;
const PRESS_RELEASE_SLOGAN_SEED_RE = /(?:\uC5EC\uB294\s+\uC0C8\uB85C\uC6B4|\uC0C8\uB85C\uC6B4\s+.+\s+\uBBF8\uB798|\uBBF8\uB798|\uBE44\uC804|\uD611\uB825|\uAC04\uB2F4\uD68C|\uCD94\uC9C4|\uAC1C\uCD5C|\uD568\uAED8|\uD070\uB2E4|\uC120\uB3C4|\uB3C4\uC57D|\uD601\uC2E0|\uD65C\uC131\uD654|\uAC15\uD654)/u;
const CONCRETE_POLICY_PRODUCT_RE = /(?:\uC9C0\uC6D0\uAE08|\uC7A5\uB824\uAE08|\uBC14\uC6B0\uCC98|\uBCF4\uC870\uAE08|\uC218\uB2F9|\uAE09\uC5EC|\uD61C\uD0DD|\uD658\uAE09|\uCCAD\uC57D|\uC138\uC561\uACF5\uC81C|\uBCF4\uD5D8|\uB300\uCD9C|\uCE90\uC2DC\uBC31|\uCFE0\uD3F0|\uBC1C\uAE09|\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC11C\uB958|\uB9C8\uAC10|\uC9C0\uAE09\uC77C|\uC870\uD68C)/u;
const SEARCHAD_POLICY_PRODUCT_BASE_RE = /(?:[\uAC00-\uD7A3]{2,12}\uBC14\uC6B0\uCC98|\uC815\uCC45\uC790\uAE08|\uADFC\uB85C\uC7A5\uB824\uAE08|\uC790\uB140\uC7A5\uB824\uAE08|\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98|\uCCAB\uB9CC\uB0A8\uC774\uC6A9\uAD8C|\uAE30\uCD08\uC5F0\uAE08|\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C|\uCCAD\uB144\uBBF8\uB798\uC801\uAE08|\uC18C\uC0C1\uACF5\uC778.{0,6}(?:\uD658\uAE09|\uC9C0\uC6D0|\uB300\uCD9C|\uC9C0\uC6D0\uAE08|\uC815\uCC45\uC790\uAE08)|\uBBFC\uC0DD\uD68C\uBCF5\uC9C0\uC6D0\uAE08|\uC0C1\uC0DD\uD398\uC774\uBC31|\uC2E4\uC5C5\uAE09\uC5EC|\uC721\uC544\uD734\uC9C1\uAE09\uC5EC|\uBD80\uBAA8\uAE09\uC5EC|\uC544\uB3D9\uC218\uB2F9|\uAC74\uAC15\uBCF4\uD5D8|\uB3C4\uC218\uCE58\uB8CC|\uD0C8\uBAA8\uCE58\uB8CC\uC81C|\uC5EC\uC131\uCCAD\uC18C\uB144.{0,6}\uBC14\uC6B0\uCC98)/u;
const SEARCHAD_PRESS_ACTIVITY_RE = /(?:\uAC04\uB2F4\uD68C|\uC124\uBA85\uD68C|\uD611\uC57D|\uAC1C\uCD5C|\uBAA8\uC9D1|\uC120\uC815|\uD655\uB300|\uCD94\uC9C4|\uBBF8\uB798|\uC0AC\uC5C5|\uD504\uB85C\uC81D\uD2B8|\uBD80\uD2B8\uCEA0\uD504|\uAD50\uC721\uC0DD|\uCC38\uC5EC\uAE30\uAD00|\uC591\uC131|\uC778\uC7AC\uC591\uC131)/u;
const SEARCHAD_FINANCE_BASE_RE = /(?:ETF|\uBC30\uB2F9\uC8FC|ISA|\uC801\uAE08|\uC608\uAE08|\uCCAD\uC57D|\uB300\uCD9C|\uBCF4\uD5D8|\uC138\uC561\uACF5\uC81C|\uC99D\uAD8C\uC0AC|\uC218\uC218\uB8CC|\uD658\uAE09|\uAD00\uB828\uC8FC|\uACF5\uBAA8\uC8FC)/iu;
const LOW_VALUE_SENTENCE_SEED_RE = /(?:\uC5B4\uB514\uC5D0|\uBB34\uC5C7|\uB204\uAC00|\uC65C|\uC5B4\uB5BB\uAC8C|\uACC4\uC2E0\uAC00\uC694|\uC778\uAC00\uC694|\uD560\uAE4C\uC694|\uD588\uB098\uC694|\uD558\uC138\uC694|\uC54C\uB824\uC8FC\uC138\uC694|\uB4DC\uB9BD\uB2C8\uB2E4|\uC55E\uB2F9\uAE30\uACE0)/u;
const LOW_VALUE_CRISIS_NEWS_RE = /(?:\uC774\uB780|\uD638\uB974\uBB34\uC988|\uC804\uC7C1|\uACF5\uC2B5|\uBD09\uC1C4|\uC7AC\uBD09\uC1C4|\uC704\uAE30|\uD575|\uBBF8\uC0AC\uC77C|\uC0AC\uB9DD|\uBCC4\uC138|\uD22C\uBCD1|\uD610\uC758|\uC870\uC0AC|\uAD6C\uC18D|\uCCB4\uD3EC|\uD30C\uC5C5)/u;
const LOW_VALUE_POLICY_FRAGMENT_RE = /(?:\uC6D0\uAC00\uC815\s*\uBCF5\uADC0|\uC77C\uC2DC\uBCF4\uD638\uAE30\uAC04|\uC778\uAD6C\uAC10\uC18C\uC9C0\uC5ED\s*\uC18C\uC0C1\uACF5\uC778|\uC18C\uC0C1\uACF5\uC778\uACFC\s*\uC778\uAD6C\uAC10\uC18C\uC9C0\uC5ED|\uC0AC\uB791\uC744\s*\uCC98\uBC29\uD574|\uAD11\uBCF5\uC808\s*\uB300\uCCB4\uACF5\uD734\uC77C\s*\uC2E0\uCCAD|공식\s*확인\s*경로|놓치기\s*쉬운\s*변경사항|변경사항\s*금액|오늘\s*확인할\s*제외|확인할\s*제외|소득\s*기준과(?:\s*제외)?|부정수급|거짓\s*근로계약서|58명\s*적발|구독\s*서비스\s*내역\s*한눈에)/u;
const GENERIC_AUDIENCE_TERMS = new Set([
  '\uCCAD\uB144',
  '\uC77C\uBC18',
  '\uAD6D\uBBFC',
  '\uC544\uB3D9',
  '\uC7A5\uC560\uC778',
  '\uC5EC\uC131',
  '\uACE0\uB839\uC790',
  '\uB178\uC778',
  '\uD559\uC0DD',
  '\uADFC\uB85C\uC790',
  '\uC9C1\uC7A5\uC778',
  '\uC18C\uC0C1\uACF5\uC778',
  '\uC790\uC601\uC5C5\uC790',
  '\uBD80\uBAA8',
  '\uAC00\uAD6C',
  '\uCDE8\uC57D\uACC4\uCE35',
  '\uC800\uC18C\uB4DD\uCE35',
  '\uC2E0\uD63C\uBD80\uBD80',
  '\uC784\uC0B0\uBD80',
  '\uB18D\uC5B4\uBBFC',
  '\uAD6C\uC9C1\uC790',
  '\uC911\uC18C\uAE30\uC5C5',
  '\uC5B4\uB974\uC2E0',
]);
const ADSENSE_HIGH_VALUE_CATEGORIES = new Set([
  'policy',
  'finance',
  'shopping',
  'electronics',
  'beauty',
  'fashion',
  'food',
  'recipe',
  'travel_domestic',
  'travel_overseas',
  'health',
  'home_life',
  'it',
  'ai_tool',
  'game',
]);
const ADSENSE_LOW_VALUE_CATEGORIES = new Set([
  'celeb',
  'drama',
  'broadcast',
  'movie',
  'music',
]);

const ROBUST_EXAM_STALE_RE = /(?:2027\s*)?(?:6모|6월\s*모의고사|모의고사).{0,12}(?:등급컷|답지|정답|해설)/u;
const FUTURE_EXAM_SESSION_RE = /(20\d{2})\s*(?:6\uBAA8|9\uBAA8|[69]\uC6D4\s*\uBAA8\uC758\uACE0\uC0AC|\uBAA8\uC758\uACE0\uC0AC|\uBAA8\uD3C9|\uC218\uB2A5)/u;
const BARE_ROUND_ONLY_RE = /^(\d{3,5})\s*\uD68C$/u;
const ROBUST_LOTTO_ROUND_RE = /(?:(\d{3,5})\s*회\s*로또|로또\s*(\d{3,5})\s*회)/u;

const GRADE_WEIGHT: Record<MobileResultGrade, number> = {
  SSS: 120,
  SS: 95,
  S: 75,
  A: 45,
  B: 20,
  C: 0,
};

const GRADE_RANK: Record<MobileResultGrade, number> = {
  C: 0,
  B: 1,
  A: 2,
  S: 3,
  SS: 4,
  SSS: 5,
};

const LIVE_SSS_GRADE: MobileResultGrade = 'SSS';

function normalizeGrade(value: unknown, score = 0): MobileResultGrade {
  const grade = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (grade === 'SSS' || grade === 'SS' || grade === 'S' || grade === 'A' || grade === 'B') return grade;
  if (score >= 85) return 'SSS';
  if (score >= 75) return 'SS';
  if (score >= 65) return 'S';
  if (score >= 55) return 'A';
  if (score >= 45) return 'B';
  return 'C';
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKeyword(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMeasurementConfidence(value: unknown): MobileMeasurementConfidence | undefined {
  const clean = normalizeKeyword(value).toLowerCase();
  if (clean === 'high' || clean === 'medium' || clean === 'low') return clean;
  return undefined;
}

function normalizeSearchVolumeSource(value: unknown): MobileSearchVolumeSource | undefined {
  const clean = normalizeKeyword(value).toLowerCase();
  if (clean === 'searchad' || clean === 'cache' || clean === 'manual' || clean === 'unknown' || clean === 'none') {
    return clean;
  }
  return undefined;
}

function normalizeDocumentCountSource(value: unknown): MobileDocumentCountSource | undefined {
  const clean = normalizeKeyword(value).toLowerCase();
  if (clean === 'naver-api' || clean === 'cache' || clean === 'scrape' || clean === 'fallback' || clean === 'unknown' || clean === 'none') {
    return clean;
  }
  return undefined;
}

function measurementMetadataFromRow(row: any): Partial<MobileKeywordMetric> {
  const pc = finiteNumber(row?.pcSearchVolume);
  const mobile = finiteNumber(row?.mobileSearchVolume);
  const hasSearchAdSplit = pc !== null || mobile !== null;
  const meta: Partial<MobileKeywordMetric> = {};
  const searchVolumeSource = normalizeSearchVolumeSource(row?.searchVolumeSource || row?.svSource)
    ?? (hasSearchAdSplit ? 'searchad' : undefined);
  const searchVolumeConfidence = normalizeMeasurementConfidence(row?.searchVolumeConfidence || row?.svConfidence)
    ?? (searchVolumeSource === 'searchad' && hasSearchAdSplit ? 'high' : undefined);
  const documentCountSource = normalizeDocumentCountSource(row?.documentCountSource || row?.dcSource);
  const documentCountConfidence = normalizeMeasurementConfidence(row?.documentCountConfidence || row?.dcConfidence);
  if (searchVolumeSource) meta.searchVolumeSource = searchVolumeSource;
  if (searchVolumeConfidence) meta.searchVolumeConfidence = searchVolumeConfidence;
  if (row?.isSearchVolumeEstimated === true || row?.svEstimated === true) meta.isSearchVolumeEstimated = true;
  if (row?.isSearchVolumeEstimated === false || row?.svEstimated === false) meta.isSearchVolumeEstimated = false;
  if (searchVolumeSource === 'searchad' && hasSearchAdSplit && meta.isSearchVolumeEstimated === undefined) {
    meta.isSearchVolumeEstimated = false;
  }
  if (documentCountSource) meta.documentCountSource = documentCountSource;
  if (documentCountConfidence) meta.documentCountConfidence = documentCountConfidence;
  if (row?.isDocumentCountEstimated === true || row?.dcEstimated === true) meta.isDocumentCountEstimated = true;
  if (row?.isDocumentCountEstimated === false || row?.dcEstimated === false) meta.isDocumentCountEstimated = false;
  return meta;
}

function measurementMetadataFromDocumentCount(measurement: DcMeasurement): Partial<MobileKeywordMetric> {
  return {
    documentCountSource: measurement.source,
    documentCountConfidence: measurement.confidence,
    isDocumentCountEstimated: measurement.isEstimated,
  };
}

function measurementMetadataWithPersistentDefaults(row: any): Partial<MobileKeywordMetric> {
  const meta = measurementMetadataFromRow(row);
  const documentCount = finiteNumber(row?.documentCount)
    ?? finiteNumber(row?.documents)
    ?? finiteNumber(row?.docs);
  if (documentCount !== null && documentCount > 0 && !meta.documentCountSource) {
    meta.documentCountSource = 'cache';
    meta.documentCountConfidence = 'medium';
    meta.isDocumentCountEstimated = false;
  }
  return meta;
}

function includesAnyTerm(value: string, terms: readonly string[]): boolean {
  const clean = normalizeKeyword(value);
  return terms.some((term) => clean.includes(term));
}

function uniqueKeywords(values: string[], limit = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeKeyword(raw);
    if (!value) continue;
    const key = value.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function uniqueSearchAdMeasurementKeywords(values: string[], limit = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeKeyword(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function uniqueVolumeRows(rows: LiveSearchVolumeRow[], limit = 40): LiveSearchVolumeRow[] {
  const seen = new Set<string>();
  const out: LiveSearchVolumeRow[] = [];
  for (const row of rows) {
    const key = keywordCompactId(row?.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

const CACHE_DERIVED_CALCULATOR_RE = /(?:\uACC4\uC0B0\uAE30|\uACC4\uC0B0|\uBCF4\uD5D8\uB8CC|\uC2E4\uC218\uB839\uC561|\uC218\uB2F9|\uD1F4\uC9C1\uAE08|\uC2DC\uAE09|\uBD80\uAC00\uC138|\uC5F0\uCC28|\uC8FC\uD734|\uC0AC\uB300\uBCF4\uD5D8|4\uB300\uBCF4\uD5D8)/u;
const CACHE_DERIVED_POLICY_RE = /(?:\uC9C0\uC6D0\uAE08|\uC7A5\uB824\uAE08|\uAE09\uC5EC|\uBC14\uC6B0\uCC98|\uC218\uB2F9|\uC815\uCC45\uC790\uAE08|\uC8FC\uAC70\uAE09\uC5EC|\uBB38\uD654\uB204\uB9AC|\uCCAD\uB144|\uC18C\uC0C1\uACF5\uC778|\uC2E4\uC5C5\uAE09\uC5EC|\uBD80\uBAA8\uAE09\uC5EC|\uC544\uB3D9\uC218\uB2F9|\uAE30\uCD08\uC5F0\uAE08|\uD658\uAE09)/u;
const CACHE_DERIVED_COMMERCE_RE = /(?:\uAC00\uACA9\uBE44\uAD50|\uCD5C\uC800\uAC00|\uAD6C\uB9E4|\uC0AC\uC6A9\uCC98|\uCD94\uCC9C|\uD6C4\uAE30|\uCFE0\uD3F0|\uD560\uC778|\uC81C\uD488|\uCE74\uB4DC|\uB80C\uD130\uCE74|\uB80C\uD2B8\uCE74|\uC5D0\uC5B4\uCEE8|\uCCAD\uC18C\uAE30|\uC815\uB9AC\uB300)/u;

const CACHE_DERIVED_CALCULATOR_INTENTS = Object.freeze([
  '\uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
  '\uC9C1\uC7A5\uC778 \uC2E4\uC218\uB839\uC561',
  '\uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0',
  '\uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uACC4\uC0B0',
  '\uC77C\uC6A9\uC9C1 \uACC4\uC0B0\uBC29\uBC95',
  '\uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9',
  '\uD504\uB9AC\uB79C\uC11C 3.3 \uC138\uAE08 \uACC4\uC0B0',
  '\uD1F4\uC9C1\uAE08 \uC138\uD6C4 \uACC4\uC0B0',
  '4\uB300\uBCF4\uD5D8\uB8CC \uC694\uC728 \uACC4\uC0B0',
  '\uC138\uAE08 \uACF5\uC81C',
  '\uC694\uC728\uD45C',
  '\uC5D1\uC140 \uC591\uC2DD',
]);
const CACHE_DERIVED_POLICY_CALCULATOR_CONTEXT_RE = /(?:\uADFC\uB85C\uC7A5\uB824\uAE08|\uC790\uB140\uC7A5\uB824\uAE08|\uAE30\uCD08\uC5F0\uAE08|\uC2E4\uC5C5\uAE09\uC5EC|\uACE0\uC6A9\uBCF4\uD5D8|\uBC14\uC6B0\uCC98|\uC9C0\uC6D0\uAE08|\uC7A5\uB824\uAE08|\uAE09\uC5EC|\uC218\uB2F9|\uC815\uCC45\uC790\uAE08|\uCCAD\uB144\uB3C4\uC57D|\uBBF8\uB798\uC801\uAE08|\uAD6D\uBBFC\uC5F0\uAE08)/u;
const CACHE_DERIVED_TRUE_PAYROLL_CALCULATOR_RE = /(?:\uADFC\uBB34\uC2DC\uAC04|\uC2DC\uAE09|\uC8FC\uD734\uC218\uB2F9|\uC5F0\uCC28\uC218\uB2F9|\uC0AC\uB300\uBCF4\uD5D8|4\uB300\uBCF4\uD5D8|\uD1F4\uC9C1\uAE08|\uBD80\uAC00\uC138|\uC885\uD569\uC18C\uB4DD\uC138|\uC6D0\uCC9C\uC138)/u;
const CACHE_DERIVED_POLICY_COMMERCE_INTENT_RE = /(?:\uCD5C\uC800\uAC00|\uAC00\uACA9\uBE44\uAD50|\uAD6C\uB9E4\uCC98|\uD560\uC778|\uCFE0\uD3F0|\uC120\uD0DD\s*\uAC00\uC774\uB4DC|\uC2E4\uC0AC\uC6A9\s*\uD6C4\uAE30|\uBE44\uC6A9\s*\uBE44\uAD50)/u;
const CACHE_DERIVED_TRUE_COMMERCE_BASE_RE = /(?:\uB80C\uD130\uCE74|\uB80C\uD2B8\uCE74|\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uC120\uD48D\uAE30|\uB0C9\uC7A5\uACE0|\uC138\uD0C1\uAE30|\uAC74\uC870\uAE30|\uC644\uC804\uC790\uCC28|\uC218\uC218\uB8CC|\uAE08\uB9AC|\uB300\uCD9C|\uBCF4\uD5D8)/u;

function cacheDerivedCalculatorIntentsForSeed(seed: string): string[] {
  const clean = normalizeKeyword(seed);
  if (!clean) return [];
  const isWage = /(?:\uADFC\uBB34\uC2DC\uAC04|\uC2DC\uAE09|\uC8FC\uD734\uC218\uB2F9|\uC5F0\uCC28\uC218\uB2F9)/u.test(clean);
  const isInsurance = /(?:\uC0AC\uB300\uBCF4\uD5D8|4\uB300\uBCF4\uD5D8)/u.test(clean);
  const isSeverance = /\uD1F4\uC9C1\uAE08/u.test(clean);
  const isTax = /(?:\uBD80\uAC00\uC138|\uC885\uD569\uC18C\uB4DD\uC138|\uC6D0\uCC9C\uC138)/u.test(clean);
  const isPolicyCalculator = CACHE_DERIVED_POLICY_CALCULATOR_CONTEXT_RE.test(clean)
    && !isWage
    && !isInsurance
    && !isSeverance
    && !isTax;

  if (isPolicyCalculator) return [];
  if (isInsurance) {
    return [
      '\uD504\uB9AC\uB79C\uC11C \uC2E4\uC218\uB839\uC561',
      '\uC9C1\uC7A5\uC778 \uC2E4\uC218\uB839\uC561',
      '\uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0',
      '\uC694\uC728\uD45C',
      '\uC5D1\uC140 \uC591\uC2DD',
    ];
  }
  if (isWage) {
    return [
      '\uC54C\uBC14 \uC790\uB3D9\uACC4\uC0B0',
      '\uC54C\uBC14 \uC8FC\uD734\uC218\uB2F9 \uACC4\uC0B0',
      '\uC77C\uC6A9\uC9C1 \uACC4\uC0B0\uBC29\uBC95',
      '\uC138\uAE08 \uACF5\uC81C',
      '\uC5D1\uC140 \uC591\uC2DD',
    ];
  }
  if (isSeverance) return ['\uD1F4\uC9C1\uAE08 \uC138\uD6C4 \uACC4\uC0B0', '\uC138\uAE08 \uACF5\uC81C', '\uC5D1\uC140 \uC591\uC2DD'];
  if (isTax) {
    return [
      '\uAC1C\uC778\uC0AC\uC5C5\uC790 \uACF5\uC81C\uD56D\uBAA9',
      '\uD504\uB9AC\uB79C\uC11C 3.3 \uC138\uAE08 \uACC4\uC0B0',
      '\uC138\uAE08 \uACF5\uC81C',
      '\uC5D1\uC140 \uC591\uC2DD',
    ];
  }
  return CACHE_DERIVED_CALCULATOR_INTENTS.filter((intent) => !/4\uB300\uBCF4\uD5D8\uB8CC\s*\uC694\uC728\s*\uACC4\uC0B0/u.test(intent));
}
const CACHE_DERIVED_POLICY_INTENTS = Object.freeze([
  '\uC2E0\uCCAD \uB300\uC0C1',
  '\uC2E0\uCCAD \uBC29\uBC95',
  '\uC790\uACA9 \uC870\uAC74',
  '\uC9C0\uAE09\uC77C \uC870\uD68C',
  '\uD544\uC694 \uC11C\uB958',
  '\uC0AC\uC6A9\uCC98 \uC870\uD68C',
  '\uB9C8\uAC10\uC77C \uD655\uC778',
  '\uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
]);
const CACHE_DERIVED_COMMERCE_INTENTS = Object.freeze([
  '\uC2E4\uC0AC\uC6A9 \uD6C4\uAE30',
  '\uCD5C\uC800\uAC00 \uBE44\uAD50',
  '\uD560\uC778 \uCFE0\uD3F0',
  '\uAD6C\uB9E4\uCC98 \uCD94\uCC9C',
  '\uC7A5\uB2E8\uC810',
  '\uC120\uD0DD \uAC00\uC774\uB4DC',
  '\uBE44\uC6A9 \uBE44\uAD50',
]);
const CACHE_DERIVED_POLICY_AUDIENCE_INTENTS = Object.freeze([
  '\uD504\uB9AC\uB79C\uC11C \uC2E0\uCCAD \uB300\uC0C1',
  '\uC54C\uBC14 \uC2E0\uCCAD \uB300\uC0C1',
  '\uAC1C\uC778\uC0AC\uC5C5\uC790 \uC18C\uB4DD\uAE30\uC900 \uACC4\uC0B0',
  '\uBB34\uC9C1\uC790 \uC2E0\uCCAD \uC870\uAC74',
  '\uB9DE\uBC8C\uC774 \uC9C0\uAE09\uC77C \uC870\uD68C',
]);
const CACHE_DERIVED_TRAVEL_INTENTS = Object.freeze([
  '\uC785\uC7A5\uB8CC',
  '\uC8FC\uCC28',
  '\uC608\uC57D \uBC29\uBC95',
  '\uC6B4\uC601\uC2DC\uAC04',
  '\uC544\uC774\uB791 \uCF54\uC2A4',
  '\uB69C\uBC85\uC774 \uCF54\uC2A4',
  '\uB2F9\uC77C\uCE58\uAE30 \uC900\uBE44\uBB3C',
]);
const CACHE_DERIVED_HOME_PRODUCT_INTENTS = Object.freeze([
  '1\uC778\uAC00\uAD6C \uCD94\uCC9C',
  '\uC6D0\uB8F8 \uC804\uAE30\uC694\uAE08 \uBE44\uAD50',
  '\uC790\uCDE8\uBC29 \uC18C\uC74C \uBE44\uAD50',
  '\uC800\uC18C\uC74C \uD6C4\uAE30',
  '\uD544\uD130 \uAD50\uCCB4\uC8FC\uAE30',
  '\uC124\uCE58\uBE44 \uBE44\uAD50',
]);
const CACHE_DERIVED_TRAVEL_BASE_RE = /(?:\uD558\uB298\uAE38|\uBC14\uB2E4\uD558\uB298\uAE38|\uACC4\uACE1|\uCEA0\uD551\uC7A5|\uB9AC\uC870\uD2B8|\uB80C\uD130\uCE74|\uAD00\uAD11|\uCD95\uC81C|\uC218\uBAA9\uC6D0|\uC804\uB9DD\uB300|\uD574\uBCC0)/u;
const CACHE_DERIVED_HOME_PRODUCT_RE = /(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uC120\uD48D\uAE30|\uC11C\uD058\uB808\uC774\uD130|\uB0C9\uC7A5\uACE0|\uC138\uD0C1\uAE30|\uAC74\uC870\uAE30)/u;
const CACHE_DERIVED_ORGANIZER_NOT_APPLIANCE_RE = /(?:냉장고\s*(?:수납)?정리(?:함)?|수납\s*정리함|정리함)/u;
const CACHE_DERIVED_POLICY_INTENT_RE = /(?:신청\s*(?:대상|방법)|자격\s*조건|지급일\s*조회|필요\s*서류|사용처\s*추천|마감일\s*확인|소득기준\s*계산|프리랜서|알바|무직자|맞벌이|개인사업자)/u;
const CACHE_DERIVED_POLICY_CONTEXT_RE = /(?:지원금|장려금|급여|바우처|수당|정책자금|문화누리|청년|소상공인|실업급여|부모급여|아동수당|기초연금|환급|구제신청|근로|자녀|국민연금|복지할인|도약계좌|미래적금)/u;
const CACHE_DERIVED_LOCAL_PLACE_RE = /(?:가볼만한곳|카페거리|맛집|당일치기|관광|축제|수목원|전망대|해변|계곡|하늘길|바다하늘길)/u;
const CACHE_DERIVED_PRODUCT_MAINTENANCE_INTENT_RE = /(?:전기요금\s*비교|전기세\s*비교|소음\s*비교|저소음\s*후기|필터\s*교체주기|설치비\s*비교)/u;
const CACHE_DERIVED_TERMINAL_POLICY_TAIL_RE = /(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uC870\uAC74|\uC9C0\uAE09\uC77C|\uD658\uAE09\uC77C)$/u;
const LOW_VALUE_POLICY_TERMINAL_BASE_RE = /(?:\uC804\uD654\uBC88\uD638|\uBB38\uC758|\uCF5C\uC13C\uD130|\uAE08\uC561\uD45C)$/u;
const LOW_VALUE_ONLINE_SIGNUP_PROBE_RE = /\uC628\uB77C\uC778\s*\uC2E0\uCCAD/u;
const FINANCE_USAGE_PLACE_TAIL_RE = /(?:\uC801\uAE08|\uACC4\uC88C|\uB300\uCD9C|\uBCF4\uD5D8|\uAE08\uB9AC|IRP|ISA).{0,18}\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C.{0,18}(?:\uC801\uAE08|\uACC4\uC88C|\uB300\uCD9C|\uBCF4\uD5D8|\uAE08\uB9AC|IRP|ISA)/iu;
const DUPLICATED_POLICY_TAIL_PROBE_RE = /(\uC218\uAE09\uC790\uACA9|\uC790\uACA9|\uC2E0\uCCAD\uBC29\uBC95|\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uC0AC\uC6A9\uCC98|\uC18C\uB4DD\uAE30\uC900)\s*\1|\uC870\uAC74\s*\uC790\uACA9\s*\uC870\uAC74/u;

const CACHE_DERIVED_FORCE_PARTIAL_INTENT_RE = /(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC628\uB77C\uC778\s*\uC2E0\uCCAD|\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uD504\uB9AC\uB79C\uC11C\s*\uC2E4\uC218\uB839\uC561|\uC9C1\uC7A5\uC778\s*\uC2E4\uC218\uB839\uC561|\uC54C\uBC14\s*(?:\uC790\uB3D9\uACC4\uC0B0|\uC8FC\uD734\uC218\uB2F9\s*\uACC4\uC0B0)|\uC77C\uC6A9\uC9C1\s*\uACC4\uC0B0\uBC29\uBC95|\uAC1C\uC778\uC0AC\uC5C5\uC790\s*\uACF5\uC81C\uD56D\uBAA9|\uD504\uB9AC\uB79C\uC11C\s*3\.3\s*\uC138\uAE08\s*\uACC4\uC0B0|\uD1F4\uC9C1\uAE08\s*\uC138\uD6C4\s*\uACC4\uC0B0|4\uB300\uBCF4\uD5D8\uB8CC\s*\uC694\uC728\s*\uACC4\uC0B0|\uC138\uAE08\s*\uACF5\uC81C|\uC694\uC728\uD45C|\uC5D1\uC140\s*\uC591\uC2DD)/u;

function cacheDerivedIntentToAppend(seed: string, intent: string): string {
  const clean = normalizeKeyword(seed);
  let cleanIntent = normalizeKeyword(intent);
  if (!clean || !cleanIntent) return '';
  if (!keywordAlreadyHasIntent(clean, cleanIntent)) return cleanIntent;
  if (clean.replace(/\s+/g, '').includes(cleanIntent.replace(/\s+/g, ''))) return '';
  if (!CACHE_DERIVED_FORCE_PARTIAL_INTENT_RE.test(cleanIntent)) return '';
  if (/\uC2E0\uCCAD/u.test(clean) && /^\uC2E0\uCCAD\s+/u.test(cleanIntent)) {
    cleanIntent = cleanIntent.replace(/^\uC2E0\uCCAD\s+/u, '').trim();
  }
  if (/\uC790\uACA9/u.test(clean) && /^\uC790\uACA9\s+/u.test(cleanIntent)) {
    cleanIntent = cleanIntent.replace(/^\uC790\uACA9\s+/u, '').trim();
  }
  if (/\uC870\uAC74/u.test(clean) && /\uC870\uAC74$/u.test(cleanIntent)) return '';
  if (/\uC9C0\uAE09\uC77C/u.test(clean) && /^\uC9C0\uAE09\uC77C\s+/u.test(cleanIntent)) {
    cleanIntent = cleanIntent.replace(/^\uC9C0\uAE09\uC77C\s+/u, '').trim();
  }
  if (/\uC0AC\uC6A9\uCC98/u.test(clean) && /^\uC0AC\uC6A9\uCC98\s+/u.test(cleanIntent)) {
    cleanIntent = cleanIntent.replace(/^\uC0AC\uC6A9\uCC98\s+/u, '').trim();
  }
  if (!cleanIntent || clean.replace(/\s+/g, '').includes(cleanIntent.replace(/\s+/g, ''))) return '';
  return cleanIntent;
}

function isCacheDerivedCompoundIntentCompatible(seed: string, intent: string, categoryId: string): boolean {
  const clean = normalizeKeyword(seed);
  const cleanIntent = normalizeKeyword(intent);
  const category = normalizeKeyword(categoryId || 'all') || 'all';
  if (!clean || !cleanIntent) return false;
  const policyLikeBase = CACHE_DERIVED_POLICY_RE.test(clean)
    || CACHE_DERIVED_POLICY_CONTEXT_RE.test(clean)
    || CACHE_DERIVED_POLICY_CALCULATOR_CONTEXT_RE.test(clean);
  if (
    CACHE_DERIVED_POLICY_COMMERCE_INTENT_RE.test(cleanIntent)
    && policyLikeBase
    && !CACHE_DERIVED_TRUE_COMMERCE_BASE_RE.test(clean)
  ) return false;
  if (
    /(?:\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\s*\uC628\uB77C\uC778|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778)/u.test(clean)
    && CACHE_DERIVED_POLICY_COMMERCE_INTENT_RE.test(cleanIntent)
  ) return false;
  if (
    CACHE_DERIVED_POLICY_CALCULATOR_CONTEXT_RE.test(clean)
    && CACHE_DERIVED_CALCULATOR_RE.test(clean)
    && !CACHE_DERIVED_TRUE_PAYROLL_CALCULATOR_RE.test(clean)
    && /(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uC77C\uC6A9\uC9C1|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uD1F4\uC9C1\uAE08|4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC|3\.3|\uC138\uD6C4|\uC8FC\uD734\uC218\uB2F9)/u.test(cleanIntent)
  ) return false;
  if (
    CACHE_DERIVED_POLICY_INTENT_RE.test(cleanIntent)
    && !CACHE_DERIVED_CALCULATOR_RE.test(clean)
    && (!CACHE_DERIVED_POLICY_CONTEXT_RE.test(clean) || /(?:꿀팁|맛집|카페거리|가볼만한곳|아웃백|하이디라오|훠궈)/u.test(clean))
  ) return false;
  if (FINANCE_USAGE_PLACE_TAIL_RE.test(`${clean} ${cleanIntent}`)) return false;
  if (/\uC0AC\uC6A9\uCC98/u.test(clean) && !/(?:\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC870\uD68C)$/u.test(cleanIntent)) return false;
  if (/(?:\uC9C0\uAE09\uC77C|\uD658\uAE09\uC77C)/u.test(clean) && /(?:\uC18C\uB4DD\uAE30\uC900|\uC790\uACA9|\uC2E0\uCCAD\s*\uB300\uC0C1|\uD544\uC694\s*\uC11C\uB958)/u.test(cleanIntent)) return false;
  if (
    /(?:구매처\s*추천|할인\s*쿠폰|최저가\s*비교|비용\s*비교)/u.test(cleanIntent)
    && (CACHE_DERIVED_LOCAL_PLACE_RE.test(clean) || /travel|food/.test(category))
    && !/(?:렌터카|렌트카|항공권|숙소|호텔|여행자보험|입장권|티켓)/u.test(clean)
  ) return false;
  if (
    /(?:맛집|카페거리|당일치기)/u.test(clean)
    && /(?:아이랑\s*코스|뚜벅이\s*코스|당일치기\s*준비물)/u.test(cleanIntent)
  ) return false;
  if (
    /(?:구제신청|부당해고)/u.test(clean)
    && /(?:최저가\s*비교|구매처\s*추천|할인\s*쿠폰|비용\s*비교|선택\s*가이드|1인\s*가구\s*추천|저소음\s*후기|전기요금\s*비교|전기세\s*비교|소음\s*비교|필터\s*교체주기|설치비\s*비교)/u.test(cleanIntent)
  ) return false;
  if (
    /(?:레인부츠|샌들|선크림|패드)/u.test(clean)
    && /(?:1인\s*가구\s*추천|저소음\s*후기|전기요금\s*비교|전기세\s*비교|소음\s*비교|필터\s*교체주기|설치비\s*비교)/u.test(cleanIntent)
  ) return false;
  if (
    CACHE_DERIVED_PRODUCT_MAINTENANCE_INTENT_RE.test(cleanIntent)
    && (
      CACHE_DERIVED_ORGANIZER_NOT_APPLIANCE_RE.test(clean)
      || /(?:후기|구제신청|레인부츠|샌들|선크림|패드|정리)$/u.test(clean)
    )
  ) return false;
  if (CACHE_DERIVED_CALCULATOR_RE.test(clean)) return true;
  return isMeasuredProbeIntentCompatible(clean, cleanIntent, category);
}

function buildCacheDerivedCompoundNeedSeeds(seed: string, categoryId = 'all', limit = 36): string[] {
  const clean = normalizeKeyword(seed);
  if (!clean) return [];
  if (CACHE_DERIVED_TERMINAL_POLICY_TAIL_RE.test(clean) || LOW_VALUE_POLICY_TERMINAL_BASE_RE.test(clean)) return [];
  const category = normalizeKeyword(categoryId);
  const intents: string[] = [];
  const isCalculatorSeed = CACHE_DERIVED_CALCULATOR_RE.test(clean);
  const hasPolicySeedContext = CACHE_DERIVED_POLICY_RE.test(clean) || CACHE_DERIVED_POLICY_CONTEXT_RE.test(clean);
  const canExpandPolicySeed = hasPolicySeedContext && !CACHE_DERIVED_TERMINAL_POLICY_TAIL_RE.test(clean);
  if (isCalculatorSeed) intents.push(...cacheDerivedCalculatorIntentsForSeed(clean));
  if (!isCalculatorSeed && canExpandPolicySeed) {
    intents.push(...CACHE_DERIVED_POLICY_INTENTS, ...CACHE_DERIVED_POLICY_AUDIENCE_INTENTS);
  }
  if (CACHE_DERIVED_COMMERCE_RE.test(clean) || /shopping|commerce|electronics|beauty|fashion|food|home|travel/.test(category)) {
    intents.push(...CACHE_DERIVED_COMMERCE_INTENTS);
  }
  if (CACHE_DERIVED_TRAVEL_BASE_RE.test(clean) || /travel/.test(category)) intents.push(...CACHE_DERIVED_TRAVEL_INTENTS);
  if (CACHE_DERIVED_HOME_PRODUCT_RE.test(clean) || /shopping|electronics|home/.test(category)) intents.push(...CACHE_DERIVED_HOME_PRODUCT_INTENTS);

  const out: string[] = [];
  for (const intent of uniqueKeywords(intents, 24)) {
    const appendIntent = cacheDerivedIntentToAppend(clean, intent);
    if (!appendIntent) continue;
    if (!isCacheDerivedCompoundIntentCompatible(clean, intent, category)) continue;
    out.push(`${clean} ${appendIntent}`);
    const compactIntent = appendIntent.replace(/\s+/g, '');
    if (compactIntent && !clean.includes(compactIntent)) out.push(`${clean}${compactIntent}`);
  }
  return uniqueKeywords(out, limit)
    .filter((candidate) => !CERTIFICATE_PAYROLL_MISMATCH_RE.test(normalizeKeyword(candidate)))
    .filter((candidate) => !CALCULATOR_INTENT_MISMATCH_RE.test(normalizeKeyword(candidate)))
    .filter((candidate) => !CALCULATOR_LOW_INTENT_RE.test(normalizeKeyword(candidate)))
    .filter((candidate) => !isOverExpandedLiveCandidate(candidate))
    .filter((candidate) => ultimateIntentFragmentCount(candidate) <= 4)
    .filter((candidate) => !LOW_VALUE_SYNTHETIC_CHAIN_RE.test(candidate));
}

function directCandidateBudget(maxCandidates: number, cycleLimit: number): number {
  const requested = Math.max(1, Math.floor(Number(cycleLimit) || 1));
  const depthBudget = requested >= 60
    ? requested * 18
    : requested * 24;
  return Math.max(
    120,
    Math.min(maxCandidates, LIVE_DIRECT_CANDIDATE_MAX_PER_CYCLE, Math.max(480, depthBudget)),
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

function keywordId(keyword: string): string {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\uAC00-\uD7A3-]/g, '')
    .slice(0, 80) || 'keyword';
}

function keywordCompactId(keyword: string): string {
  return normalizeKeyword(keyword)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\uAC00-\uD7A3]/g, '')
    .slice(0, 80) || keywordId(keyword);
}

function formatRange(value: number | null, kind: 'search' | 'document'): string {
  if (value === null || !Number.isFinite(value)) return 'checking';
  if (value < 20) return kind === 'search' ? 'under 20' : 'under 20';
  if (value < 100) return '20-99';
  if (value < 300) return '100-299';
  if (value < 500) return '300-499';
  if (value < 1000) return '500-999';
  if (value < 2000) return '1k range';
  if (value < 5000) return '2k-5k';
  if (value < 10000) return '5k-10k';
  if (value < 30000) return '10k-30k';
  return kind === 'search' ? '30k+' : '30k+';
}

function keywordClusterKey(keyword: string): string {
  const compact = keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\uAC00-\uD7A3]/g, '')
    .replace(/^(\d{4})(\d{1,2}\uBAA8)/u, '$2');
  if (!compact) return '';

  const isSeasonalContentCluster = SEASONAL_CONTENT_CLUSTER_SUFFIX_RE.test(compact);
  let semantic = compact;
  for (let i = 0; i < 3; i += 1) {
    const next = semantic.replace(SEMANTIC_CLUSTER_SUFFIX_RE, '');
    if (next === semantic || next.length < 3) break;
    semantic = next;
  }
  if (isSeasonalContentCluster) {
    semantic = semantic.replace(/([\uAC00-\uD7A3]{3,})\d{1,2}$/u, '$1');
  }
  return (semantic.length >= 3 ? semantic : compact).slice(0, 12);
}

function liveCandidateDiversityKey(keyword: string): string {
  let clean = normalizeKeyword(keyword)
    .replace(/^\d{1,2}월\s+\d{1,2}일\s+/u, '')
    .replace(/^20\d{2}년\s+\d{1,2}월\s+/u, '')
    .replace(/^(오늘|이번주|이번달|\d{1,2}월)\s+/u, ' ');
  const removable = [
    ...ROBUST_ACTIONABLE_TERMS,
    ...ROBUST_GENERAL_INTENTS,
    ...Object.values(ROBUST_CATEGORY_INTENTS).flat(),
  ]
    .sort((a, b) => b.length - a.length);
  for (const term of removable) {
    clean = clean.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu'), ' ');
  }
  const compact = normalizeKeyword(clean)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
  return compact.slice(0, 18) || keywordClusterKey(keyword);
}

function diversifyLiveCandidates(values: string[], limit: number): string[] {
  const unique = uniqueKeywords(values, limit * 3);
  const selected: string[] = [];
  const counts = new Map<string, number>();
  const pushWithCap = (cap: number): void => {
    for (const keyword of unique) {
      if (selected.length >= limit) return;
      if (selected.some((item) => keywordCompactId(item) === keywordCompactId(keyword))) continue;
      const key = liveCandidateDiversityKey(keyword);
      const count = counts.get(key) || 0;
      if (count >= cap) continue;
      counts.set(key, count + 1);
      selected.push(keyword);
    }
  };
  pushWithCap(18);
  pushWithCap(36);
  pushWithCap(limit);
  return selected.slice(0, limit);
}

function publicPreviewClusterKey(keyword: string): string {
  const clean = normalizeKeyword(keyword);
  if (/로또|복권|당첨번호|당첨지역|판매점/.test(clean)) return 'lottery';
  if (/모의고사|등급컷|답지|수능|기출|6모|9모/.test(clean)) return 'education-exam';
  if (/프로야구|KBO|야구|올스타|중계|경기/.test(clean)) return 'baseball';
  if (/흠뻑쇼|콘서트|팬미팅|컴백/.test(clean)) return 'concert';
  if (/공휴일|지원금|장려금|바우처|정책|환급/.test(clean)) return 'policy';
  return keywordClusterKey(clean);
}

function normalizeLiveSeedText(value: unknown): string {
  let clean = normalizeKeyword(value)
    .replace(/\[(same|up|new|down)\]/gi, ' ')
    .replace(/[!?！？]+/g, ' ')
    .replace(/["'“”‘’]/g, ' ')
    .replace(/[♥★◆◇■□●○]/g, ' ')
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    .replace(/\([^)]{1,40}\)/g, ' ')
    .replace(/[·ㆍ]/g, ' ')
    .replace(/\s*에\s*빠진다\s*$/g, ' ')
    .replace(/\s*빠진다\s*$/g, ' ')
    .replace(/기자\s*・.*$/g, ' ')
    .replace(/\d{4}\.\d{1,2}\.\d{1,2}.*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const commaHead = normalizeKeyword(clean.split(/[,，]/u)[0] || '');
  if (
    commaHead
    && commaHead !== clean
    && commaHead.length >= 2
    && commaHead.length <= 24
    && /[0-9A-Za-z\uAC00-\uD7A3]/u.test(commaHead)
  ) {
    clean = commaHead;
  }
  if (clean.length > 42) {
    clean = normalizeKeyword(clean.split(/[,.!?…]| - | — | \/|:/)[0] || clean);
  }
  return clean;
}

function isNoisyLiveSeed(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  if (isGenericAudienceOnlyKeyword(clean)) return true;
  if (isOverExpandedLiveCandidate(clean)) return true;
  if (LOW_VALUE_SENTENCE_SEED_RE.test(clean) || LOW_VALUE_CRISIS_NEWS_RE.test(clean) || LOW_VALUE_POLICY_FRAGMENT_RE.test(clean)) return true;
  if (clean.length > 34) return true;
  if (/[.!?]{2,}|…/.test(clean)) return true;
  if (/(기자|스타이슈|단독|종합|사진|영상|전문|속보만|무단전재)/.test(clean)) return true;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 7) return true;
  const issueSignal = LIVE_GENERAL_ISSUE_RE.test(clean)
    || LIVE_SPORTS_SIGNAL_RE.test(clean)
    || LIVE_LOTTERY_SIGNAL_RE.test(clean)
    || LIVE_POLICY_SIGNAL_RE.test(clean)
    || LIVE_FINANCE_SIGNAL_RE.test(clean);
  if (!isActionableLiveKeyword(clean) && NEWS_HEADLINE_FRAGMENT_RE.test(clean)) return true;
  if (!isActionableLiveKeyword(clean) && !issueSignal && tokenCount >= 5) return true;
  return false;
}

function expandLiveSeedKeyword(value: unknown): string[] {
  const clean = normalizeLiveSeedText(value);
  if (!clean) return [];
  const plain = normalizeKeyword(clean.replace(/[^0-9A-Za-z가-힣\s]/g, ' '));
  const out: string[] = [clean, plain];
  const tokens = plain
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !/(기자|여사|관련|오늘|이번|속보)/.test(token));
  const action = clean.match(ACTIONABLE_KEYWORD_HINT_RE)?.[0] || '';
  if (tokens.length >= 2) {
    out.push(tokens.slice(0, Math.min(4, tokens.length)).join(' '));
    if (action && !plain.includes(action)) out.push(`${tokens.slice(0, Math.min(3, tokens.length)).join(' ')} ${action}`);
  }
  return uniqueKeywords(out, 4)
    .filter((keyword) => !isNoisyLiveSeed(keyword))
    .filter((keyword) => !isThinProfileIntentKeyword(keyword))
    .filter((keyword) => !isLowValueLiveCandidate(keyword));
}

function normalizeLiveSeeds(values: string[], limit = 28): string[] {
  return uniqueKeywords(values.flatMap(expandLiveSeedKeyword), limit);
}

function mdpResultId(result: MDPResult): string {
  return keywordId(normalizeKeyword(result.keyword));
}

function isNovelMdpResult(
  result: MDPResult,
  existingIds: Set<string>,
  existingClusters: Set<string>,
): boolean {
  const keyword = normalizeKeyword(result.keyword);
  const id = keywordId(keyword);
  const cluster = keywordClusterKey(keyword);
  return !existingIds.has(id) && (!cluster || !existingClusters.has(cluster));
}

function appendUniqueMdpResults(
  out: MDPResult[],
  candidates: MDPResult[],
  seen: Set<string>,
  limit: number,
  predicate?: (item: MDPResult) => boolean,
): void {
  for (const item of candidates) {
    if (out.length >= limit) return;
    if (predicate && !predicate(item)) continue;
    const id = mdpResultId(item);
    const compactId = keywordCompactId(normalizeKeyword(item.keyword));
    if (!id || seen.has(`id:${id}`) || seen.has(`compact:${compactId}`)) continue;
    seen.add(`id:${id}`);
    seen.add(`compact:${compactId}`);
    out.push(item);
  }
}

function rotateItems<T>(items: T[], offset: number): T[] {
  if (items.length <= 1) return items;
  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function keywordLongTailScore(keyword: string): number {
  const clean = normalizeKeyword(keyword);
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const lengthScore = compactLength >= 10 && compactLength <= 28
    ? 16
    : compactLength >= 7 && compactLength <= 34
      ? 10
      : 0;
  const tokenScore = tokenCount >= 4
    ? 18
    : tokenCount === 3
      ? 14
      : tokenCount === 2
        ? 8
        : 0;
  return lengthScore + tokenScore;
}

function keywordNeedScore(keyword: string, intent: string): number {
  const clean = `${normalizeKeyword(keyword)} ${normalizeKeyword(intent)}`;
  if (/(신청|대상|자격|지급일|조회|예매|예약|가격|비교|추천|후기|방법|준비물|서류|마감|오류|설정|사용법|답지|등급컷|당첨번호|중계|라인업|출연진|몇부작|결말|쿠키영상|관련주|전망|주가)/.test(clean)) {
    return 30;
  }
  if (ACTIONABLE_KEYWORD_HINT_RE.test(clean)) return 18;
  return 0;
}

function volumeOpportunityScore(volume: number): number {
  if (volume >= 30_000) return 64;
  if (volume >= 10_000) return 56;
  if (volume >= 5_000) return 48;
  if (volume >= 2_000) return 40;
  if (volume >= 1_000) return 32;
  if (volume >= 500) return 22;
  if (volume >= 300) return 14;
  return 0;
}

function documentScarcityScore(documents: number | null): number {
  if (documents === null) return 0;
  if (documents <= 100) return 70;
  if (documents <= 300) return 62;
  if (documents <= 1_000) return 54;
  if (documents <= 3_000) return 46;
  if (documents <= 5_000) return 36;
  if (documents <= 10_000) return 22;
  if (documents <= 30_000) return 8;
  return -20;
}

function ratioOpportunityScore(ratio: number): number {
  if (ratio >= 50) return 92;
  if (ratio >= 25) return 82;
  if (ratio >= 10) return 72;
  if (ratio >= 5) return 58;
  if (ratio >= 3) return 42;
  if (ratio >= 2) return 26;
  return 0;
}

function boardScore(item: MobileLiveGoldenBoardItem): number {
  const grade = GRADE_WEIGHT[item.grade] || 0;
  const measured = item.isMeasured ? 30 : 0;
  const exactAutocomplete = (item.evidence || []).includes('autocomplete-exact-measured') ? 65 : 0;
  const volume = Math.max(0, item.totalSearchVolume || 0);
  const documents = item.documentCount;
  const ratio = Math.max(0, item.goldenRatio || (
    volume > 0 && documents && documents > 0 ? volume / documents : 0
  ));
  const longTail = keywordLongTailScore(item.keyword);
  const need = keywordNeedScore(item.keyword, item.intent);
  const virality = scoreGoldenKeywordVirality({
    keyword: item.keyword,
    grade: item.grade,
    score: item.score,
    searchVolume: item.totalSearchVolume,
    totalSearchVolume: item.totalSearchVolume,
    documentCount: item.documentCount,
    goldenRatio: ratio,
    cpc: (item as { cpc?: number | null }).cpc ?? null,
    category: item.category,
    source: item.source,
    intent: item.intent,
    evidence: item.evidence,
  });
  const viralLift = virality >= 78
    ? 72
    : virality >= 65
      ? 48
      : virality >= 50
        ? 26
        : virality < 25
          ? -54
          : 0;
  const monsterOpportunity = volume >= 30_000 && documents !== null && documents <= 1_000 && ratio >= 20
    ? 150
    : volume >= 10_000 && documents !== null && documents <= 2_000 && ratio >= 10
      ? 110
      : volume >= 5_000 && documents !== null && documents <= 3_000 && ratio >= 5
        ? 82
        : volume >= 1_000 && documents !== null && documents <= 5_000 && ratio >= 5
          ? 58
          : volume >= 500 && documents !== null && documents <= 10_000 && ratio >= 3
            ? 34
            : 0;
  const firstMoverScarcity = documents !== null && volume >= 1_000
    ? documents <= 300
      ? 58
      : documents <= 1_000
        ? 42
        : documents <= 3_000
          ? 26
          : 0
    : 0;
  const longTailNeedSynergy = longTail >= 24 && need >= 18 && volume >= 500 && documents !== null && documents <= 10_000
    ? 54
    : longTail >= 18 && need >= 18 && volume >= 300
      ? 30
      : 0;
  const broadHeadPenalty = isBroadHeadSssKeyword(item.keyword) ? -260 : 0;
  const writerReadyLift = !isBroadHeadSssKeyword(item.keyword) && hasWriterReadySpecificity(item.keyword)
    ? 58
    : 0;
  const monsterBonus = volume >= 1_000 && documents !== null && documents <= 5_000 && ratio >= 5
    ? 48
    : volume >= 500 && documents !== null && documents <= 10_000 && ratio >= 3
      ? 24
      : 0;
  return grade
    + measured
    + volumeOpportunityScore(volume)
    + documentScarcityScore(documents)
    + ratioOpportunityScore(ratio)
    + longTail
    + need
    + monsterOpportunity
    + firstMoverScarcity
    + longTailNeedSynergy
    + monsterBonus
    + broadHeadPenalty
    + writerReadyLift
    + virality * 1.35
    + viralLift
    + exactAutocomplete
    + adsenseReadinessScore(item) * 3
    + (item.score || 0) * 0.12;
}

function ageMsFrom(updatedAt: string, nowMs: number): number {
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - updatedMs);
}

function boardSortScore(item: MobileLiveGoldenBoardItem, nowMs: number): number {
  const ageMs = ageMsFrom(item.updatedAt, nowMs);
  const recency = ageMs < 90 * 60 * 1000
    ? 32
    : ageMs < 12 * 60 * 60 * 1000
      ? 22
      : ageMs < 24 * 60 * 60 * 1000
        ? 14
        : ageMs < 48 * 60 * 60 * 1000
          ? 6
          : ageMs > 5 * 24 * 60 * 60 * 1000
            ? -80
            : -28;
  return boardScore(item) + recency;
}

function freshnessFrom(updatedAt: string, nowMs: number): MobileLiveGoldenFreshness {
  const ageMs = nowMs - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 90 * 60 * 1000) return 'live';
  if (ageMs < 12 * 60 * 60 * 1000) return 'warm';
  return 'aging';
}

function publicReason(item: MobileKeywordMetric): string {
  const parts: string[] = [];
  if (item.grade === 'SSS' || item.grade === 'SS') parts.push(`${item.grade} 후보`);
  if (item.goldenRatio !== null && item.goldenRatio >= 5) parts.push('문서 대비 수요 우세');
  if (item.intent) parts.push(item.intent.replace(/[-_]/g, ' '));
  return parts.slice(0, 2).join(' · ') || '실시간 검증 통과 후보';
}

const ACTIONABLE_KEYWORD_HINT_RE = /(일정|답지|등급컷|당첨번호|당첨지역|중계|올스타전|공휴일|신청|대상|자격|지급일|조회|후기|가격|비교|추천|예약|예매|출연진|몇부작|다시보기|결말|쿠키영상|사용법|오류|설정|업데이트|준비물|조건|서류|마감|발표|라인업|하이라이트|공식입장|기자회견|회동|발언|입장|논란|정리|현재\s*상황|이유|합의|예상|비주얼|공개|MVP|급락|관련주|전망|주가|소식|악수|방한|연기|참석|별세|끝내기|안타|방문|체결|인상|인하|파업|수사|구속|출시|발매|확정|취소|변경|개편|오픈|폐지)/;
const SPECIFIC_LIVE_KEYWORD_HINT_RE = /(\d{4}|\d+회|\d+월|오늘|이번주|이번달|상반기|하반기|일정|답지|등급컷|올스타전|공휴일|신청|지급일|접수|마감|예매|예약|방송시간|몇부작|출연진|결말|쿠키영상|준비물|후기|가격|비교|추천|주차|라인업|하이라이트|공식입장|기자회견|회동|발언|논란|정리|현재\s*상황|이유|합의|예상|비주얼|공개|MVP|급락|관련주|전망|주가|소식|악수|방한|연기|참석|별세|끝내기|안타|방문|체결|인상|인하|파업|수사|구속|출시|발매|확정|취소|변경|개편|오픈|폐지)/;
const LIVE_SPORTS_SIGNAL_RE = /(KIA|LG|두산|롯데|한화|삼성|SSG|NC|KT|키움|KBO|프로야구|야구|축구|농구|배구|FIFA|월드컵|K리그|EPL|연패|연승|탈출|역전골|안타|경기|감독|선수|이적|우승|준우승)/i;
const LIVE_LOTTERY_SIGNAL_RE = /(로또|복권|당첨\s*\d+명|당첨번호|당첨지역|판매점|실수령액)/;
const LIVE_POLICY_SIGNAL_RE = /(지원금|환급|보조금|정부|정책|신청|대상|자격|지급|복지|청년|소상공인|부모가|온라인\s*신청|에너지캐시백)/;
const LIVE_BROADCAST_SIGNAL_RE = /(드라마|예능|방송|시즌|신세계|하트시그널|하트\s*시그널|참교육|신입사원|출연진|시청률|다시보기|몇부작|결말)/;
const LIVE_FINANCE_SIGNAL_RE = /(주가|증시|코스피|코스닥|환율|금리|공모주|청약|실적|배당|관련주|급락|급등|상장|온누리상품권)/;
const STOCK_MARKET_CONTEXT_RE = /(증시|코스피|코스닥|환율|금리|공모주|청약|실적|배당|급락|급등|상장|주식|종목|코인|비트코인|삼성전자|현대차|LG|SK하이닉스|네이버|카카오|테슬라|엔비디아|온누리상품권)/;
const LIVE_GENERAL_ISSUE_RE = /(합의|예상|심경|구형|사고|논란|수사|구속|체포|방문|회동|발언|입장|공식입장|사과|중단|침수|파업|인상|인하|확정|취소|변경|폐지)/;
const THIN_PROFILE_INTENT_RE = /(프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대)$/i;
const PROFILE_INTENT_TOKEN_RE = /(프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대|작품활동|필모그래피)/i;
const PROFILE_INTENT_EXEMPT_RE = /(카카오톡|카톡|인스타그램|블로그|프로필\s*(사진|설정|변경|꾸미기|삭제|비공개|차단)|사용법|오류|업데이트|방법|신청|조회|대상|자격|지급일|일정|예매|예약|중계|등급컷|답지|당첨번호|주가|전망)/i;
const RICH_PROFILE_CONTEXT_RE = /(공식입장|해명|논란|기자회견|회동|발언|입장|출연진|방송시간|몇부작|다시보기|결말|하이라이트|라인업|MVP|소식|공개|비주얼)/i;
const LOTTO_FIRST_DRAW_AT_KST_MS = Date.UTC(2002, 11, 7, 11, 35, 0);
const LOTTO_DRAW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LOTTO_ROUND_RE = /(?:로또\s*)?(\d{3,5})\s*회|(\d{3,5})\s*회\s*(?:로또|복권)/;
const VOLATILE_EXAM_ANSWER_RE = /(?:\d{4}\s*)?(?:6모|9모|모의고사|모평|수능|기출).{0,10}(?:등급컷|답지|정답|해설)|(?:등급컷|답지|정답|해설).{0,10}(?:6모|9모|모의고사|모평|수능|기출)/;

function currentLottoRound(now: Date = new Date()): number {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || nowMs <= LOTTO_FIRST_DRAW_AT_KST_MS) return 1;
  return Math.floor((nowMs - LOTTO_FIRST_DRAW_AT_KST_MS) / LOTTO_DRAW_INTERVAL_MS) + 1;
}

function robustLottoRound(keyword: string): number | null {
  const match = normalizeKeyword(keyword).match(ROBUST_LOTTO_ROUND_RE);
  if (!match) return null;
  const round = Number(match[1] || match[2]);
  return Number.isFinite(round) ? round : null;
}

function isRobustLottoKeyword(keyword: string): boolean {
  return /로또|복권|당첨번호|당첨지역|판매점/u.test(normalizeKeyword(keyword));
}

function isRobustSpecificLiveKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (isLowValueLiveCandidate(clean)) return false;
  if (hasLiveUltimateNeedIntent(clean)) return true;
  return /\d{3,5}\s*회|20\d{2}|오늘|이번주|일정|신청|대상|자격|조회|발표|예매|중계|하이라이트|라인업|몇부작|출연진|방송시간|다시보기|결말|쿠키영상|공식영상|가격비교|후기|추천|현재 상황|공식입장|합의|예상|전망|소식|관련주/u.test(clean);
}

function hasRobustActionableIntent(keyword: string): boolean {
  return includesAnyTerm(keyword, ROBUST_ACTIONABLE_TERMS);
}

const WRITER_READY_SEARCHAD_PROBE_INTENT_RE = /(?:\uC608\uC57D(?:\s*\uBC29\uBC95)?|\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uAD6C\uB9E4\uCC98\s*\uCD94\uCC9C|\uCD5C\uC800\uAC00\s*\uBE44\uAD50|\uC6D0\uB8F8\s*\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50|\uC790\uCDE8\uBC29\s*\uC18C\uC74C\s*\uBE44\uAD50|\uC8FC\uD734\uC218\uB2F9\s*\uACC4\uC0B0|4\uB300\uBCF4\uD5D8\uB8CC\s*\uC694\uC728\s*\uACC4\uC0B0|\uD1F4\uC9C1\uAE08\s*\uC138\uD6C4\s*\uACC4\uC0B0|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uC628\uB77C\uC778\s*\uC2E0\uCCAD|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C\s*\uD655\uC778)/u;
const SEARCHAD_UNNATURAL_AUDIENCE_COMPOUND_RE = /(?:(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uBB34\uC9C1\uC790|\uB9DE\uBC8C\uC774|\uD55C\uBD80\uBAA8|\uB300\uD559\uC0DD|\uD1F4\uC0AC\uC790|\uC9C1\uC7A5\uC778|\uC0AC\uD68C\uCD08\uB144\uC0DD).{0,12}(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uC870\uAC74|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uC6D0\s*\uB300\uC0C1|\uC18C\uB4DD\uAE30\uC900(?:\s*\uACC4\uC0B0)?|\uD544\uC694\s*\uC11C\uB958)|(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uC870\uAC74|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uC6D0\s*\uB300\uC0C1|\uC18C\uB4DD\uAE30\uC900(?:\s*\uACC4\uC0B0)?|\uD544\uC694\s*\uC11C\uB958).{0,12}(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uBB34\uC9C1\uC790|\uB9DE\uBC8C\uC774|\uD55C\uBD80\uBAA8|\uB300\uD559\uC0DD|\uD1F4\uC0AC\uC790|\uC9C1\uC7A5\uC778|\uC0AC\uD68C\uCD08\uB144\uC0DD))/u;
const SEARCHAD_OVERCOMPOUND_EVENT_UTILITY_RE = /(?:(?:KBO|\uD504\uB85C\uC57C\uAD6C|\uC62C\uC2A4\uD0C0\uC804).{0,24}(?:\uC608\uB9E4|\uD2F0\uCF13\uD305|\uC77C\uC815|\uB77C\uC778\uC5C5|\uD558\uC774\uB77C\uC774\uD2B8|\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uC6B4\uC601\uC2DC\uAC04|\uC88C\uC11D\uBC30\uCE58\uB3C4).{0,24}(?:\uC608\uB9E4|\uD2F0\uCF13\uD305|\uC77C\uC815|\uB77C\uC778\uC5C5|\uD558\uC774\uB77C\uC774\uD2B8|\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uC6B4\uC601\uC2DC\uAC04|\uC88C\uC11D\uBC30\uCE58\uB3C4))/iu;
const SEARCHAD_BROAD_POLICY_BASE_RE = /(?:\uC2E4\uC5C5\uAE09\uC5EC|\uAD6D\uBBFC\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC|\uB0B4\uC77C\uBC30\uC6C0\uCE74\uB4DC|\uAD6D\uBBFC\uD589\uBCF5\uCE74\uB4DC|\uCCAD\uB144\uBBF8\uB798\uC801\uAE08|\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C|\uCCAD\uB144\uB0B4\uC77C\uC800\uCD95\uACC4\uC88C|\uADFC\uB85C\uC7A5\uB824\uAE08|\uC790\uB140\uC7A5\uB824\uAE08|\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC|\uD3C9\uC0DD\uAD50\uC721\uBC14\uC6B0\uCC98|\uAE30\uC800\uADC0\uBC14\uC6B0\uCC98|\uCCAB\uB9CC\uB0A8\uC774\uC6A9\uAD8C|\uB2E4\uC790\uB140\uD61C\uD0DD|\uC804\uAE30\uC694\uAE08\s*\uBCF5\uC9C0\uD560\uC778|\uC18C\uC0C1\uACF5\uC778(?:\uC815\uCC45\uC790\uAE08|\uD3D0\uC5C5\uC9C0\uC6D0\uAE08|\uC9C0\uC6D0\uAE08|\uC9C0\uC6D0|\uB300\uCD9C)?)/u;
const SEARCHAD_BROAD_POLICY_GENERIC_INTENT_RE = /(?:\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|(?:\uC9C0\uC6D0\s*)?\uB300\uC0C1|\uC870\uD68C\s*\uBC29\uBC95|\uC18C\uB4DD\uAE30\uC900|\uC870\uAC74|\uD61C\uD0DD)$/u;
const SEARCHAD_POLICY_DETAIL_QUALIFIER_RE = /(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uC77C\uC6A9\uC9C1|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uBB34\uC9C1\uC790|\uB9DE\uBC8C\uC774|\uD1F4\uC0AC\uC790|\uC9C1\uC7A5\uC778|\uC9C0\uC5ED\uAC00\uC785\uC790|\uC11C\uC6B8|\uBD80\uC0B0|\uB300\uAD6C|\uC778\uCC9C|\uAD11\uC8FC|\uB300\uC804|\uC6B8\uC0B0|\uACBD\uAE30|\uC81C\uC8FC|\uAC15\uC6D0|\uCDA9\uBD81|\uCDA9\uB0A8|\uC804\uBD81|\uC804\uB0A8|\uACBD\uBD81|\uACBD\uB0A8|\uC138\uC885|\uC628\uB77C\uC778|\uBAA8\uBC14\uC77C|\uBCF5\uC9C0\uB85C|\uD648\uD398\uC774\uC9C0|\uC794\uC561|\uAC00\uB9F9\uC810|\uD3D0\uC5C5|\uC9C1\uC811\uB300\uCD9C|\uB300\uB9AC\uB300\uCD9C|\uBC18\uAE30|\uC815\uAE30|\uAE30\uD55C\uD6C4|\uC2E4\uC218\uB839\uC561|\uC790\uB3D9\uACC4\uC0B0|\uACC4\uC0B0\uBC29\uBC95|\uC694\uC728|\uC138\uD6C4|3\.3)/u;

function isBroadGenericPolicySearchAdProbe(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (!SEARCHAD_BROAD_POLICY_BASE_RE.test(clean)) return false;
  if (!SEARCHAD_BROAD_POLICY_GENERIC_INTENT_RE.test(clean)) return false;
  if (/\uC18C\uC0C1\uACF5\uC778\s*\uD3D0\uC5C5\uC9C0\uC6D0\uAE08.*\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)$/u.test(clean)) return true;
  return !SEARCHAD_POLICY_DETAIL_QUALIFIER_RE.test(clean);
}

function hasWriterReadySearchAdProbeIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return WRITER_READY_SEARCHAD_PROBE_INTENT_RE.test(clean);
}

function hasNaturalSearchAdProbeShape(keyword: string, categoryId: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (/洹.*議/u.test(clean)) return true;
  if (SEARCHAD_UNNATURAL_AUDIENCE_COMPOUND_RE.test(clean)) return false;
  if (SEARCHAD_OVERCOMPOUND_EVENT_UTILITY_RE.test(clean)) return false;
  if (/(?:KBO|\uD504\uB85C\uC57C\uAD6C|\uC62C\uC2A4\uD0C0\uC804).{0,24}(?:\uD2F0\uCF13\uD305|\uC608\uB9E4).{0,24}(?:\uC77C\uC815|\uBC29\uBC95|\uC8FC\uCC28|\uC785\uC7A5\uB8CC|\uC6B4\uC601\uC2DC\uAC04|\uC88C\uC11D\uBC30\uCE58\uB3C4|\uB77C\uC778\uC5C5|\uD558\uC774\uB77C\uC774\uD2B8)/iu.test(clean)) return false;
  if (/(?:\uAD11\uBCF5\uC808|\uC81C\uD5CC\uC808|\uAC1C\uCC9C\uC808|\uD55C\uAE00\uB0A0|\uB300\uCCB4\uACF5\uD734\uC77C|\uACF5\uD734\uC77C).{0,24}(?:\uC2E0\uCCAD|\uC2E0\uCCAD\uAE30\uAC04|\uC2E0\uCCAD\uBC29\uBC95|\uD544\uC694\uC11C\uB958|\uC900\uBE44\uBB3C)/u.test(clean)) return false;
  if (/(?:\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98).{0,12}\uC18C\uB4DD\uAE30\uC900|\uC18C\uB4DD\uAE30\uC900.{0,12}(?:\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98)/u.test(clean)) return false;
  if (/(\uADFC\uB85C\uC7A5\uB824\uAE08|\uC18C\uC0C1\uACF5\uC778|\uC2E4\uC5C5\uAE09\uC5EC|\uBC14\uC6B0\uCC98|\uC9C0\uC6D0\uAE08|\uC2E0\uCCAD)(?:\s*\S+){0,4}\s*\1/u.test(clean.replace(/\s+/g, ' '))) return false;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const fragments = ultimateIntentFragmentCount(clean);
  const category = inferLiveCategory(clean, categoryId || 'all');
  const compact = clean.replace(/\s+/g, '');
  const calculatorLike = CACHE_DERIVED_CALCULATOR_RE.test(clean);
  const knownPolicyNeed = isKnownPolicyProductNeedKeyword(clean) || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean);
  const policyOrFinance = category === 'policy' || category === 'finance'
    || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || SEARCHAD_FINANCE_BASE_RE.test(clean);

  if (fragments >= 3 && !calculatorLike && !(knownPolicyNeed && tokenCount <= 3 && compact.length <= 18)) return false;
  if (tokenCount >= 5 && !calculatorLike) return false;
  if (
    tokenCount >= 4
    && policyOrFinance
    && /(?:\uC2E0\uCCAD\s*\uB300\uC0C1|\uC790\uACA9\s*\uC870\uAC74|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uD544\uC694\s*\uC11C\uB958)/u.test(clean)
    && !/(?:\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC794\uC561\uC870\uD68C|\uC138\uD6C4\s*\uACC4\uC0B0)/u.test(clean)
  ) return false;
  if (compact.length > 24 && !calculatorLike && !/(?:\uC9C0\uAE09\uC77C\uC870\uD68C|\uC0AC\uC6A9\uCC98\uC870\uD68C|\uC794\uC561\uC870\uD68C|\uC138\uD6C4\uACC4\uC0B0)$/u.test(compact)) return false;
  return true;
}

function isSearchAdMeasurableLiveCandidate(keyword: string, categoryId: string, now: Date = new Date()): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (isBroadGenericPolicySearchAdProbe(clean)) return false;
  if (/洹.*議/u.test(clean)) return true;
  if (isSemanticallyMismatchedMeasuredProbe(clean)) return false;
  if (isInvalidNonProductCommerceExpansion(clean)) return false;
  if (isSyntheticNoEffectLiveProbe(clean)) return false;
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const policyProductAction = isPolicyProductActionKeyword(clean);
  const knownPolicyNeed = isKnownPolicyProductNeedKeyword(clean);
  const highNeedIntent = hasLiveUltimateNeedIntent(clean);
  const knownPolicyProduct = SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean);
  const knownFinanceBase = SEARCHAD_FINANCE_BASE_RE.test(clean);
  const normalizedCategory = normalizeKeyword(categoryId);
  const writerReadyProbeIntent = hasWriterReadySearchAdProbeIntent(clean);
  if (!hasNaturalSearchAdProbeShape(clean, categoryId)) return false;
  const knownTravelNeed = highNeedIntent
    && (
      normalizedCategory === 'travel_domestic'
      || normalizedCategory === 'travel_overseas'
      || VENUE_TRAVEL_BASE_RE.test(clean)
      || /(?:여행|당일치기|근교|렌터카|렌트카|숙소|항공권)/u.test(clean)
    );
  if (compactLength < LIVE_SEARCHAD_CANDIDATE_MIN_CHARS || compactLength > LIVE_SEARCHAD_CANDIDATE_MAX_CHARS) return false;
  if (tokenCount > LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS) return false;
  if (tokenCount >= LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS && !knownPolicyNeed && !knownFinanceBase && !knownTravelNeed && !writerReadyProbeIntent) return false;
  if (isMalformedLiveKeyword(clean) || isStaleOrFutureLiveKeyword(clean, now)) return false;
  if ((LOW_VALUE_EVENT_TOPIC_RE.test(clean) && !isActionableSportsLiveEventKeyword(clean)) || isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean)) return false;
  if (isMismatchedLiveEventIntent(clean)) return false;
  if (/관리급여/u.test(clean) || LOW_VALUE_POLICY_WORD_SALAD_RE.test(clean) || LIVE_MEASURED_PROBE_HEALTH_POLICY_MIX_RE.test(clean)) return false;
  if (!policyProductAction && isLowValueLiveCandidate(clean) && !writerReadyProbeIntent) return false;
  if (!policyProductAction && isOverExpandedLiveCandidate(clean) && !writerReadyProbeIntent) return false;
  if (isOverChainedPolicyIntent(clean)) return false;
  if (isNoisyLiveSeed(clean) && !(policyProductAction || knownPolicyNeed || (highNeedIntent && (knownPolicyProduct || knownFinanceBase)))) return false;
  if (ultimateIntentFragmentCount(clean) >= 3 && !(policyProductAction || knownPolicyNeed)) return false;

  const inferred = inferLiveCategory(clean, categoryId || 'all');
  const policyLike = inferred === 'policy' || normalizedCategory === 'policy' || LIVE_POLICY_SIGNAL_RE.test(clean);
  const financeLike = inferred === 'finance' || normalizedCategory === 'finance' || LIVE_FINANCE_SIGNAL_RE.test(clean);

  if (policyLike) {
    if (SEARCHAD_PRESS_ACTIVITY_RE.test(clean) && !knownPolicyProduct) return false;
    if (!knownPolicyProduct && tokenCount >= 4 && !highNeedIntent) return false;
  }

  if (financeLike) {
    if (SEARCHAD_PRESS_ACTIVITY_RE.test(clean) && !knownFinanceBase) return false;
    if (!knownFinanceBase && tokenCount >= 4 && !highNeedIntent) return false;
  }

  return highNeedIntent
    || policyProductAction
    || knownPolicyNeed
    || hasRobustActionableIntent(clean)
    || isActionableGoldenKeyword(clean)
    || writerReadyProbeIntent;
}

function debugSearchAdMeasurableLiveCandidate(keyword: string, categoryId: string, now: Date = new Date()): Record<string, unknown> {
  const clean = normalizeKeyword(keyword);
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const policyProductAction = isPolicyProductActionKeyword(clean);
  const knownPolicyNeed = isKnownPolicyProductNeedKeyword(clean);
  const highNeedIntent = hasLiveUltimateNeedIntent(clean);
  const knownPolicyProduct = SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean);
  const knownFinanceBase = SEARCHAD_FINANCE_BASE_RE.test(clean);
  return {
    clean,
    compactLength,
    tokenCount,
    policyProductAction,
    knownPolicyNeed,
    highNeedIntent,
    knownPolicyProduct,
    knownFinanceBase,
    malformed: isMalformedLiveKeyword(clean),
    stale: isStaleOrFutureLiveKeyword(clean, now),
    lowValue: isLowValueLiveCandidate(clean),
    overExpanded: isOverExpandedLiveCandidate(clean),
    mismatchedLiveEventIntent: isMismatchedLiveEventIntent(clean),
    overChainedPolicyIntent: isOverChainedPolicyIntent(clean),
    noisy: isNoisyLiveSeed(clean),
    intentFragments: ultimateIntentFragmentCount(clean),
    robustAction: hasRobustActionableIntent(clean),
    actionableGolden: isActionableGoldenKeyword(clean),
    result: isSearchAdMeasurableLiveCandidate(clean, categoryId, now),
  };
}

function isPolicyProductActionKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  return SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    && hasConcretePolicyProductAction(clean)
    && compactLength >= LIVE_SEARCHAD_CANDIDATE_MIN_CHARS
    && compactLength <= LIVE_SEARCHAD_CANDIDATE_MAX_CHARS
    && tokenCount <= LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS
    && ultimateIntentFragmentCount(clean) <= 2
    && !isStaleOrFutureLiveKeyword(clean);
}

function hasConcretePolicyProductAction(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  return CONCRETE_PUBLISH_ACTION_RE.test(clean)
    || /(?:\uC0AC\uC6A9\uCC98|\uAE08\uC561|\uD61C\uD0DD|\uC120\uC815\uAE30\uC900)/u.test(clean);
}

function isKnownPolicyProductNeedKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (isPolicyProductActionKeyword(clean)) return true;
  if (!SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)) return false;
  if (!hasConcretePolicyProductAction(clean)) return false;
  if (!hasLiveUltimateNeedIntent(clean) && !hasRobustActionableIntent(clean)) return false;
  if (isUltimateLowValueLookupKeyword(clean) || isOverExpandedLiveCandidate(clean)) return false;
  return true;
}

function isStaleOrFutureLiveKeyword(keyword: string, now: Date = new Date()): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  if (BARE_ROUND_ONLY_RE.test(clean)) return true;
  if (VOLATILE_EXAM_ANSWER_RE.test(clean) || ROBUST_EXAM_STALE_RE.test(clean)) return true;
  const futureExamSession = clean.match(FUTURE_EXAM_SESSION_RE);
  if (futureExamSession) {
    const examYear = Number(futureExamSession[1]);
    if (Number.isFinite(examYear) && examYear > now.getFullYear()) return true;
  }
  if (LIVE_LOTTERY_SIGNAL_RE.test(clean) || isRobustLottoKeyword(clean)) {
    const roundMatch = clean.match(LOTTO_ROUND_RE);
    const round = roundMatch ? Number(roundMatch[1] || roundMatch[2]) : robustLottoRound(clean);
    if (round !== null && Number.isFinite(round) && round !== currentLottoRound(now)) {
      return true;
    }
  }
  return false;
}

function isMalformedLiveKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  const compact = clean.replace(/\s+/g, '');
  if (/^[가-힣]+[0-9]+[가-힣0-9]+$/.test(compact) && !/\s/.test(clean)) return true;
  if (/^[a-z0-9\s_-]+$/i.test(clean) && !/[가-힣]/.test(clean)) return true;
  return false;
}

function isActionableLiveKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (isLowValueLiveCandidate(clean)) return false;
  return hasLiveUltimateNeedIntent(clean);
}

function isThinProfileIntentKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || PROFILE_INTENT_EXEMPT_RE.test(clean)) return false;
  const compact = clean.replace(/\s+/g, '');
  const hasThinEnding = THIN_PROFILE_INTENT_RE.test(compact);
  const hasProfileToken = PROFILE_INTENT_TOKEN_RE.test(clean);
  if (!hasThinEnding && !hasProfileToken) return false;
  const withoutProfileIntent = clean.replace(PROFILE_INTENT_TOKEN_RE, ' ');
  if (RICH_PROFILE_CONTEXT_RE.test(withoutProfileIntent)) return false;
  if (hasThinEnding) return true;
  return !ACTIONABLE_KEYWORD_HINT_RE.test(withoutProfileIntent);
}

function maxThinProfileBoardCount(boardTarget: number): number {
  return 0;
}

function maxCategoryBoardCount(boardTarget: number): number {
  return Math.min(
    LIVE_BOARD_CATEGORY_ABSOLUTE_MAX,
    Math.max(3, Math.ceil(Math.max(1, boardTarget) * LIVE_BOARD_CATEGORY_SHARE_CAP)),
  );
}

function maxEpisodeLookupBoardCount(boardTarget: number): number {
  return Math.min(
    LIVE_BOARD_EPISODE_LOOKUP_ABSOLUTE_MAX,
    Math.max(2, Math.ceil(Math.max(1, boardTarget) * LIVE_BOARD_EPISODE_LOOKUP_SHARE_CAP)),
  );
}

function maxContentLookupBoardCount(boardTarget: number): number {
  return Math.min(
    LIVE_BOARD_CONTENT_LOOKUP_ABSOLUTE_MAX,
    Math.max(3, Math.ceil(Math.max(1, boardTarget) * LIVE_BOARD_CONTENT_LOOKUP_SHARE_CAP)),
  );
}

function isEpisodeLookupKeyword(keyword: string): boolean {
  return EPISODE_LOOKUP_INTENT_RE.test(normalizeKeyword(keyword));
}

function isContentLookupKeyword(keyword: string): boolean {
  return CONTENT_LOOKUP_INTENT_RE.test(normalizeKeyword(keyword));
}

function hasCompleteLiveGoldenMetrics(item: {
  totalSearchVolume?: number | null;
  documentCount?: number | null;
  isMeasured?: boolean;
}): boolean {
  const volume = finiteNumber(item.totalSearchVolume);
  const documents = finiteNumber(item.documentCount);
  return item.isMeasured !== false
    && volume !== null
    && documents !== null
    && volume > 0
    && documents > 0;
}

function boardCategoryKey(item: MobileLiveGoldenBoardItem): string {
  return normalizeKeyword(item.category) || inferLiveCategory(item.keyword, 'live');
}

function selectLiveBoardItems<T extends MobileLiveGoldenBoardItem>(
  sorted: T[],
  boardTarget: number,
  now: Date = new Date(),
): T[] {
  const target = Math.max(1, Math.floor(boardTarget));
  const measuredSssReady = sorted
    .filter((item) => isMeasuredSssBoardCandidate(item, now));
  const measuredSssSelected = selectLiveBoardItemsFromPool(
    measuredSssReady,
    target,
    (item) => isMeasuredSssBoardCandidate(item, now),
  );
  if (measuredSssSelected.length >= target) return measuredSssSelected;
  const selectedIds = new Set(measuredSssSelected.map((item) => item.id));
  const strictReady = sorted
    .filter((item) => !selectedIds.has(item.id))
    .filter(isStrictReadyLiveBoardItem);
  const strictSelected = selectLiveBoardItemsFromPool(
    [...measuredSssSelected, ...strictReady],
    target,
    (item) => selectedIds.has(item.id) || isStrictReadyLiveBoardItem(item),
  );
  if (strictSelected.length >= target) return strictSelected;
  const strictIds = new Set(strictSelected.map((item) => item.id));
  const nearReady = sorted
    .filter((item) => !strictIds.has(item.id))
    .filter(isNearUltimateLiveBoardItem);
  const nearSelected = selectLiveBoardItemsFromPool(
    [...strictSelected, ...nearReady],
    target,
    (item) => strictIds.has(item.id) || isStrictReadyLiveBoardItem(item) || isNearUltimateLiveBoardItem(item),
  );
  if (nearSelected.length >= target) return nearSelected;

  const expandedSelectedIds = new Set(nearSelected.map((item) => item.id));
  const writerReady = sorted
    .filter((item) => !expandedSelectedIds.has(item.id))
    .filter((item) => isMeasuredWriterReadyBoardMetric(item, now));
  const writerReadySelected = selectLiveBoardItemsFromPool(
    [...nearSelected, ...writerReady],
    target,
    (item) => expandedSelectedIds.has(item.id)
      || isStrictReadyLiveBoardItem(item)
      || isNearUltimateLiveBoardItem(item)
      || isMeasuredWriterReadyBoardMetric(item, now),
  );
  if (writerReadySelected.length >= target) return writerReadySelected;

  const writerReadySelectedIds = new Set(writerReadySelected.map((item) => item.id));
  const measuredReady = sorted
    .filter((item) => !writerReadySelectedIds.has(item.id))
    .filter((item) => isMeasuredProBoardItem(item, now));
  return selectLiveBoardItemsFromPool(
    [...writerReadySelected, ...measuredReady],
    target,
    (item) => isStrictReadyLiveBoardItem(item)
      || isNearUltimateLiveBoardItem(item)
      || isMeasuredWriterReadyBoardMetric(item, now)
      || isMeasuredProBoardItem(item, now),
  );
}

function selectMeasuredPublishableFallbackItems<T extends MobileLiveGoldenBoardItem>(
  sorted: T[],
  boardTarget: number,
  now: Date,
): T[] {
  const target = Math.max(1, Math.floor(boardTarget));
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const selectedCompactIds = new Set<string>();
  for (const item of sorted) {
    if (selected.length >= target) break;
    const compactId = keywordCompactId(item.keyword);
    if (selectedIds.has(item.id) || selectedCompactIds.has(compactId)) continue;
    if (
      (isPublishableLiveResultMetric(item, now) || isMeasuredProBoardFallbackMetric(item, now))
      && hasMeasuredPcMobileSplit(item)
      && hasTrustedSearchVolumeMeasurement(item)
      && hasTrustedDocumentCountMeasurement(item)
    ) {
      selected.push(item);
      selectedIds.add(item.id);
      selectedCompactIds.add(compactId);
    }
  }
  return selected;
}

function appendMeasuredPublishableFallbackItems<T extends MobileLiveGoldenBoardItem>(
  selected: T[],
  sorted: T[],
  boardTarget: number,
  now: Date,
): T[] {
  const target = Math.max(1, Math.floor(boardTarget));
  if (selected.length >= target) return selected;
  const selectedIds = new Set(selected.map((item) => item.id));
  const merged = [...selected];
  const fallback = selectMeasuredPublishableFallbackItems(sorted, target, now);
  for (const item of fallback) {
    if (merged.length >= target) break;
    if (selectedIds.has(item.id)) continue;
    selectedIds.add(item.id);
    merged.push(item);
  }
  return merged;
}

const SSS_READY_NEED_INTENT_RE = /(?:\uACC4\uC0B0\uAE30|\uACF5\uD734\uC77C|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC608\uC57D|\uC608\uB9E4|\uC2E0\uCCAD|\uC9C0\uAE09\uC77C|\uB300\uC0C1|\uC790\uACA9|\uC870\uAC74|\uC870\uD68C|\uC0AC\uC6A9\uCC98|\uAC00\uACA9\uBE44\uAD50|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uAD6C\uB9E4\uCC98|\uCD94\uCC9C|\uD6C4\uAE30|\uBE44\uC6A9|\uBCF4\uD5D8|\uC900\uBE44\uBB3C|\uC6B4\uC601\uC2DC\uAC04|\uC77C\uC815|\uB9C8\uAC10\uC77C|\uC11C\uB958|\uC2E4\uC218\uB839\uC561|\uC138\uAE08|\uD658\uAE09\uC77C)/u;
const SSS_SPECIFIC_MODIFIER_RE = /(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uC77C\uC6A9\uC9C1|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uC2E4\uC218\uB839\uC561|\uC790\uB3D9\uACC4\uC0B0|\uC694\uC728|\uACF5\uC81C|\uC608\uB9E4|\uC608\uC57D|\uD2F0\uCF13\uD305|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC88C\uC11D|\uC900\uBE44\uBB3C|\uD560\uC778|\uCFE0\uD3F0|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uAC00\uACA9\uBE44\uAD50|\uD6C4\uAE30|\uBE44\uC6A9|\uB80C\uD0C8|\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC870\uAC74|\uC9C0\uAE09\uC77C|\uC870\uD68C|\uC0AC\uC6A9\uCC98|\uB9C8\uAC10\uC77C|\uC11C\uB958|\uC18C\uB4DD\uAE30\uC900|\uD658\uAE09\uC77C|\uACF5\uD734\uC77C)/u;
const CONCRETE_ACTION_COMPOUND_RE = /[\uAC00-\uD7A3]{2,}(?:\uC608\uC57D|\uC608\uB9E4|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC88C\uC11D|\uD2F0\uCF13\uD305|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uD6C4\uAE30|\uC2E0\uCCAD\uBC29\uBC95|\uC9C0\uAE09\uC77C|\uC0AC\uC6A9\uCC98|\uB9C8\uAC10\uC77C|\uC11C\uB958|\uD658\uAE09\uC77C)$/u;
const WRITER_READY_SPECIFICITY_RE = /(?:\uD504\uB9AC\uB79C\uC11C|\uC54C\uBC14|\uC77C\uC6A9\uC9C1|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uBB34\uC9C1\uC790|\uB9DE\uBC8C\uC774|\uD55C\uBD80\uBAA8|\uB300\uD559\uC0DD|\uC9C1\uC7A5\uC778|\uC0AC\uD68C\uCD08\uB144\uC0DD|\uD1F4\uC9C1\uC790|\uC2E0\uD63C\uBD80\uBD80|1\uC778\uAC00\uAD6C|\uC6D0\uB8F8|\uC790\uCDE8\uBC29|\uC7A5\uB9C8\uCCA0|\uC800\uC18C\uC74C|\uC18C\uD615|\uAC00\uC131\uBE44|\uC544\uC774\uB791|\uAC00\uC871|\uB69C\uBC85\uC774|\uB2F9\uC77C\uCE58\uAE30|\uCD08\uBCF4|\uC785\uBB38\uC6A9|\uBB34\uB8CC|\uBE14\uB85C\uAC70|\uC2E4\uBE44|\uBCF4\uD5D8|\uC644\uC804\uC790\uCC28|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C|\uD544\uD130|\uAD50\uCCB4|\uBB3C\uAC78\uB808|\uD761\uC785\uB825|\uBB38\uD131|\uD658\uAE09\uC77C|\uC138\uC561\uACF5\uC81C|\uC218\uC218\uB8CC|\uC18C\uB4DD\uAE30\uC900|\uC0AC\uC6A9\uCC98|\uC9C0\uAE09\uC77C|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uCD5C\uC800\uAC00|\uAC00\uACA9\uBE44\uAD50|\uD560\uC778|\uCFE0\uD3F0|\uAD6C\uB9E4\uCC98|\uBE44\uAD50|\uD6C4\uAE30|\uC900\uBE44\uBB3C|\uC9C1\uC811\uB300\uCD9C|\uB300\uB9AC\uB300\uCD9C|\uC794\uC561\uC870\uD68C|\uB9CC\uAE30|\uD574\uC9C0|\uBD80\uC791\uC6A9|\uC8FC\uC758\uC0AC\uD56D)/u;

function hasSssReadyNeedIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return SSS_READY_NEED_INTENT_RE.test(clean) || SSS_READY_NEED_INTENT_RE.test(clean.replace(/\s+/g, ''));
}

function isBroadHeadSssKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  const compact = clean.replace(/\s+/g, '');
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  if (tokenCount >= 2) return false;
  if (compact.length >= 7 && CONCRETE_ACTION_COMPOUND_RE.test(compact)) return false;
  if (compact.length >= 9 && SSS_SPECIFIC_MODIFIER_RE.test(clean)) return false;
  if (compact.length > 14) return false;
  return hasSssReadyNeedIntent(clean) || hasHighValueNeedIntent(clean) || hasAdsenseNeedIntent(clean);
}

function hasWriterReadySpecificity(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return WRITER_READY_SPECIFICITY_RE.test(clean)
    || ultimateIntentFragmentCount(clean) >= 2
    || keywordLongTailScore(clean) >= 24;
}

function hasWriterReadyOpportunityIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return hasSssReadyNeedIntent(clean)
    || hasHighValueNeedIntent(clean)
    || hasAdsenseNeedIntent(clean)
    || hasWriterReadySearchAdProbeIntent(clean)
    || hasWriterReadySpecificity(clean);
}

function isMeasuredWriterReadyBoardMetric(
  item: Partial<MobileKeywordMetric> & { keyword?: string },
  now: Date = new Date(),
): boolean {
  const keyword = normalizeKeyword(item.keyword);
  if (!keyword || !hasCompleteLiveGoldenMetrics(item)) return false;
  const metric = { ...item, keyword } as MobileKeywordMetric;
  if (!hasTrustedSearchVolumeMeasurement(metric) || !hasTrustedDocumentCountMeasurement(metric)) return false;
  if (!hasMeasuredPcMobileSplit(metric)) return false;
  if (isMalformedLiveKeyword(keyword) || isStaleOrFutureLiveKeyword(keyword, now)) return false;
  if (isInvalidNonProductCommerceExpansion(keyword)) return false;
  if (isThinProfileIntentKeyword(keyword) || isNoisyLiveSeed(keyword) || isOverExpandedLiveCandidate(keyword)) return false;
  if (isLottoLookupKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
  if (isBroadHeadSssKeyword(keyword)) return false;
  if (!hasWriterReadyOpportunityIntent(keyword)) return false;

  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
  const longTail = keywordLongTailScore(keyword);
  const intentFragments = ultimateIntentFragmentCount(keyword);
  const maxDocs = ratio >= 5
    ? 30_000
    : ratio >= 3
      ? 20_000
      : 15_000;
  if (volume < 300 || docs <= 0 || docs > maxDocs || ratio < 1.5) return false;
  if (longTail < 12 && intentFragments < 1 && !hasWriterReadySearchAdProbeIntent(keyword)) return false;
  if (isOverbroadNoEffectBoardKeyword(item) && !hasWriterReadySpecificity(keyword)) return false;

  const judged = applyKeywordAiJudge(metric, { now, downgradeExcluded: false });
  const ai = judged.aiJudge;
  if (!ai || ai.verdict === 'exclude' || ai.spamRisk === 'high') return false;
  if (ai.needIntent === 'weak' && ratio < 5 && !hasAdsenseNeedIntent(keyword)) return false;
  return true;
}

function isApexWriterReadyBoardMetric(item: Partial<MobileKeywordMetric> & { keyword?: string }): boolean {
  const keyword = normalizeKeyword(item.keyword);
  if (!keyword) return false;
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
  if (isBroadHeadSssKeyword(keyword)) return false;
  if (!hasWriterReadySpecificity(keyword)) {
    if (volume >= 10_000) return false;
    if (docs >= 5_000 && ratio < 8) return false;
  }
  return true;
}

function isOverbroadNoEffectBoardKeyword(item: Partial<MobileKeywordMetric> & { keyword?: string }): boolean {
  const keyword = normalizeKeyword(item.keyword);
  if (!keyword) return true;
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const longTail = keywordLongTailScore(keyword);
  const intentFragments = ultimateIntentFragmentCount(keyword);
  if (isBroadHeadSssKeyword(keyword)) return true;
  if (volume >= 30_000 && longTail <= 18 && intentFragments < 2 && !hasWriterReadySpecificity(keyword)) return true;
  if (volume >= 20_000 && intentFragments < 2 && !hasWriterReadySpecificity(keyword)) return true;
  if (volume >= 10_000 && docs > 5_000 && longTail < 14 && intentFragments < 2) return true;
  return false;
}

function isBlogActionableBoardMetric(item: Partial<MobileKeywordMetric> & { keyword?: string }): boolean {
  if (isMeasuredWriterReadyBoardMetric(item)) return true;
  if (isOverbroadNoEffectBoardKeyword(item)) return false;
  const keyword = normalizeKeyword(item.keyword);
  if (!isApexWriterReadyBoardMetric(item)) return false;
  return ultimateIntentFragmentCount(keyword) >= 2
    || keywordLongTailScore(keyword) >= 18
    || SSS_SPECIFIC_MODIFIER_RE.test(keyword);
}

function isMeasuredSssBoardCandidate(item: MobileLiveGoldenBoardItem, now: Date): boolean {
  const keyword = normalizeKeyword(item.keyword);
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
  if (!keyword || !hasCompleteLiveGoldenMetrics(item)) return false;
  if (!hasTrustedSearchVolumeMeasurement(item) || !hasTrustedDocumentCountMeasurement(item)) return false;
  if (!isLiveRadarUsableMetric(item, now) && !isMeasuredProExactKeywordMetric(item, now)) return false;
  if (isLottoLookupKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
  if (volume < 1000 || docs <= 0 || docs > 5000 || ratio < 5) return false;
  if (isBroadHeadSssKeyword(keyword)) return false;
  if (!isApexWriterReadyBoardMetric(item)) return false;
  if (!isBlogActionableBoardMetric(item)) return false;
  if (!hasWriterReadyOpportunityIntent(keyword)) return false;
  const judged = applyKeywordAiJudge(item, { now, downgradeExcluded: false });
  const ai = judged.aiJudge;
  if (!ai || ai.verdict === 'exclude' || ai.spamRisk === 'high') return false;
  return true;
}

function isStrictReadyLiveBoardItem(item: MobileLiveGoldenBoardItem): boolean {
  const keyword = normalizeKeyword(item.keyword);
  return hasCompleteLiveGoldenMetrics(item)
    && hasTrustedSearchVolumeMeasurement(item)
    && hasTrustedDocumentCountMeasurement(item)
    && hasMeasuredPcMobileSplit(item)
    && isBlogActionableBoardMetric(item)
    && liveBoardOpportunityScore(item) >= 98
    && !isLottoLookupKeyword(keyword)
    && !isLowAdsenseLookupKeyword(keyword)
    && !isBrandSafetyNewsKeyword(keyword)
    && isUltimateGoldenKeywordCandidate(item, {
      requirePcMobileSplit: true,
      requireMeasurementProvenance: true,
      minAiScore: 98,
      minTotalSearchVolume: 300,
      maxDocumentCount: 8000,
      minGoldenRatio: 5,
    });
}

function maxDocumentCountForNearUltimate(item: {
  totalSearchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
}): number {
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
  if (volume >= 100_000 && ratio >= 5) return 30_000;
  if (volume >= 30_000 && ratio >= 3) return 30_000;
  if (volume >= 10_000 && ratio >= 2.5) return 25_000;
  return 15_000;
}

function isNearUltimateLiveBoardItem(item: MobileLiveGoldenBoardItem): boolean {
  const keyword = normalizeKeyword(item.keyword);
  const maxDocumentCount = maxDocumentCountForNearUltimate(item);
  return hasCompleteLiveGoldenMetrics(item)
    && hasTrustedSearchVolumeMeasurement(item)
    && hasTrustedDocumentCountMeasurement(item)
    && hasMeasuredPcMobileSplit(item)
    && isBlogActionableBoardMetric(item)
    && liveBoardOpportunityScore(item) >= 75
    && !isLottoLookupKeyword(keyword)
    && !isLowAdsenseLookupKeyword(keyword)
    && !isBrandSafetyNewsKeyword(keyword)
    && isUltimateGoldenKeywordCandidate(item, {
      requirePcMobileSplit: true,
      requireMeasurementProvenance: true,
      minAiScore: 98,
      minTotalSearchVolume: 300,
      maxDocumentCount,
      minGoldenRatio: 2,
    });
}

function isMeasuredProBoardItem(item: MobileLiveGoldenBoardItem, now: Date = new Date()): boolean {
  return measuredProBoardFallbackRejectReason(item, now) === 'ok';
}

function selectLiveBoardItemsFromPool<T extends MobileLiveGoldenBoardItem>(
  sorted: T[],
  boardTarget: number,
  isEligible: (item: T) => boolean = isStrictReadyLiveBoardItem,
): T[] {
  const target = Math.max(1, Math.floor(boardTarget));
  const maxProfileCount = maxThinProfileBoardCount(target);
  const maxPerCategory = maxCategoryBoardCount(target);
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const selectedCompactIds = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const clusterCounts = new Map<string, number>();
  let profileCount = 0;
  let episodeLookupCount = 0;
  let contentLookupCount = 0;
  const maxEpisodeLookupCount = maxEpisodeLookupBoardCount(target);
  const maxContentLookupCount = maxContentLookupBoardCount(target);

  const push = (item: T, options: { respectCategory?: boolean; respectCluster?: boolean } = {}): boolean => {
    if (selected.length >= target || selectedIds.has(item.id)) return false;
    const compactId = keywordCompactId(item.keyword);
    if (selectedCompactIds.has(compactId)) return false;
    if (!hasCompleteLiveGoldenMetrics(item)) return false;
    if (!isEligible(item)) return false;
    const isProfileIntent = isThinProfileIntentKeyword(item.keyword);
    if (isProfileIntent && profileCount >= maxProfileCount) return false;
    const isEpisodeLookup = isEpisodeLookupKeyword(item.keyword);
    const isContentLookup = isContentLookupKeyword(item.keyword);
    if (isEpisodeLookup && episodeLookupCount >= maxEpisodeLookupCount) return false;
    if (isContentLookup && contentLookupCount >= maxContentLookupCount) return false;
    const category = boardCategoryKey(item);
    const cluster = publicPreviewClusterKey(item.keyword);
    if (
      options.respectCategory
      && category
      && (categoryCounts.get(category) || 0) >= maxPerCategory
    ) {
      return false;
    }
    if (
      options.respectCluster
      && cluster
      && (clusterCounts.get(cluster) || 0) >= LIVE_BOARD_CLUSTER_MAX
    ) {
      return false;
    }
    selected.push(item);
    selectedIds.add(item.id);
    selectedCompactIds.add(compactId);
    if (isProfileIntent) profileCount++;
    if (isEpisodeLookup) episodeLookupCount++;
    if (isContentLookup) contentLookupCount++;
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    if (cluster) clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
    return true;
  };

  for (const item of sorted) {
    if (selected.length >= target) break;
    push(item, { respectCategory: true, respectCluster: true });
  }

  for (const item of sorted) {
    if (selected.length >= target) break;
    push(item, { respectCategory: true });
  }

  for (const item of sorted) {
    if (selected.length >= target) break;
    push(item, { respectCluster: true });
  }

  return selected;
}

function isLiveRadarUsableKeyword(
  keyword: string,
  volume: number | null,
  documents: number | null,
  now: Date = new Date(),
): boolean {
  if (isMalformedLiveKeyword(keyword)) return false;
  const clean = normalizeKeyword(keyword);
  const knownPolicyNeed = isKnownPolicyProductNeedKeyword(clean);
  if (isStaleOrFutureLiveKeyword(clean, now)) return false;
  if (isInvalidNonProductCommerceExpansion(clean)) return false;
  if (isThinProfileIntentKeyword(clean)) return false;
  if (!knownPolicyNeed && isLowValueLiveCandidate(clean)) return false;
  if (!knownPolicyNeed && isOverExpandedLiveCandidate(clean)) return false;
  if (!knownPolicyNeed && isBroadBenefitProductKeyword(clean)) return false;
  if (!knownPolicyNeed && isGenericAudienceOnlyKeyword(clean)) return false;
  if (LOW_VALUE_SENTENCE_SEED_RE.test(clean) || LOW_VALUE_CRISIS_NEWS_RE.test(clean) || LOW_VALUE_POLICY_FRAGMENT_RE.test(clean)) return false;
  const writerReadyNeed = !isBroadHeadSssKeyword(clean)
    && (
      hasSssReadyNeedIntent(clean)
      || hasHighValueNeedIntent(clean)
      || hasAdsenseNeedIntent(clean)
      || hasWriterReadySearchAdProbeIntent(clean)
      || hasWriterReadySpecificity(clean)
    );
  if (!knownPolicyNeed && !hasLiveUltimateNeedIntent(clean) && !writerReadyNeed) return false;
  if (/(관련주|주가)/.test(clean) && !STOCK_MARKET_CONTEXT_RE.test(clean)) return false;
  const specific = SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean) || isRobustSpecificLiveKeyword(clean);
  if (volume !== null && volume >= BROAD_KEYWORD_VOLUME_CEILING) return false;
  if (documents !== null && documents >= BROAD_KEYWORD_DOCUMENT_CEILING) return false;
  if (volume !== null && documents !== null && volume >= 300_000 && documents >= 50_000) return false;
  if (!specific && volume !== null && volume >= 250_000) return false;
  if (!specific && !writerReadyNeed && documents !== null && documents >= 30_000) return false;
  if (!isActionableLiveKeyword(clean) && !specific && !writerReadyNeed) {
    return false;
  }
  return true;
}

function isStrongLiveIssueSeed(seed: string): boolean {
  const clean = normalizeKeyword(seed);
  if (!clean || isNoisyLiveSeed(clean) || isThinProfileIntentKeyword(clean)) return false;
  if (isLowValueLiveCandidate(clean)) return false;
  if (hasLiveUltimateNeedIntent(clean)) return true;
  return LIVE_POLICY_SIGNAL_RE.test(clean)
    || LIVE_FINANCE_SIGNAL_RE.test(clean)
    || isActionableLiveKeyword(clean)
    || isRobustSpecificLiveKeyword(clean);
}

function isLowValueLiveSourceCategory(categoryId: string): boolean {
  return LOW_VALUE_LIVE_SIGNAL_CATEGORY_RE.test(normalizeKeyword(categoryId));
}

function shouldUseLiveSourceSignalForGoldenBoard(
  keyword: string,
  signalCategory: string,
  requestedCategory: string,
): boolean {
  const clean = normalizeKeyword(keyword);
  const sportsEventSeed = isSportsLiveEventSeed(clean);
  if (!clean || isNoisyLiveSeed(clean) || (isLowValueLiveCandidate(clean) && !sportsEventSeed)) return false;
  const inferred = inferLiveCategory(clean, signalCategory || requestedCategory || 'all');
  if (isLowValueLiveSourceCategory(signalCategory) || isLowValueLiveSourceCategory(inferred)) {
    return LIVE_POLICY_SIGNAL_RE.test(clean)
      || LIVE_FINANCE_SIGNAL_RE.test(clean)
      || PRODUCT_BASE_SIGNAL_RE.test(clean)
      || VENUE_TRAVEL_BASE_RE.test(clean)
      || sportsEventSeed;
  }
  if (requestedCategory !== 'all' && inferred !== requestedCategory && signalCategory !== requestedCategory) {
    return false;
  }
  return isStrongLiveIssueSeed(clean)
    || hasLiveUltimateNeedIntent(clean)
    || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean)
    || sportsEventSeed;
}

function isPublishableLiveResultMetric(metric: MobileKeywordMetric, now: Date): boolean {
  const judged = applyKeywordAiJudge(metric, { now });
  if (!isBlogActionableBoardMetric(judged)) return false;
  const maxDocumentCount = maxDocumentCountForNearUltimate(judged);
  return isUltimateGoldenKeywordCandidate(judged, {
    now,
    requirePcMobileSplit: true,
    requireMeasurementProvenance: true,
    minAiScore: 98,
    minTotalSearchVolume: 300,
    maxDocumentCount,
    minGoldenRatio: 2,
  });
}

function measuredProBoardFallbackRejectReason(metric: MobileLiveGoldenBoardItem, now: Date): string {
  const keyword = normalizeKeyword(metric.keyword);
  if (!keyword) return 'empty-keyword';
  if (!hasCompleteLiveGoldenMetrics(metric)) return 'incomplete-metrics';
  if (!isLiveRadarUsableMetric(metric, now) && !isMeasuredProExactKeywordMetric(metric, now)) {
    return 'not-live-radar-usable';
  }
  if (!hasMeasuredPcMobileSplit(metric)) return 'missing-pc-mobile-split';
  if (!hasTrustedSearchVolumeMeasurement(metric)) return 'untrusted-search-volume';
  if (!hasTrustedDocumentCountMeasurement(metric)) return 'untrusted-document-count';
  if (isLottoLookupKeyword(keyword)) return 'lotto-lookup';
  if (isLowAdsenseLookupKeyword(keyword)) return 'low-adsense-lookup';
  if (isBrandSafetyNewsKeyword(keyword)) return 'brand-safety-news';
  if (ROBUST_EXAM_STALE_RE.test(keyword)) return 'exam-stale';
  if (LOW_VALUE_EVENT_TOPIC_RE.test(keyword) && !isActionableSportsLiveEventKeyword(keyword)) return 'low-value-event';

  const volume = finiteNumber(metric.totalSearchVolume) || 0;
  const docs = finiteNumber(metric.documentCount) || 0;
  const ratio = finiteNumber(metric.goldenRatio) || (docs > 0 ? volume / docs : 0);
  const category = boardCategoryKey(metric);
  const productBoardSeed = PRODUCT_BASE_SIGNAL_RE.test(keyword)
    && PRODUCT_FRIENDLY_CATEGORIES.has(category)
    && volume >= 2500
    && docs > 0
    && docs <= 30_000
    && ratio >= 3;
  const writerReadyMeasuredSeed = isMeasuredWriterReadyBoardMetric(metric, now);
  if ((GRADE_RANK[metric.grade] || 0) < GRADE_RANK.S && !productBoardSeed && !writerReadyMeasuredSeed) return `grade-too-low:${metric.grade}`;
  const promotionBonus = livePromotionPriorityBonus(keyword, metric.category || 'all');
  const strategicMeasuredIntent = promotionBonus >= 260
    && !LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE.test(keyword);
  const strongNeedKeyword = isStrongMeasuredNeedKeyword(keyword);
  const maxDocs = strongNeedKeyword
    ? Math.min(BROAD_KEYWORD_DOCUMENT_CEILING, LIVE_CACHE_PROMOTION_STRONG_NEED_DOCUMENT_CEILING)
    : BROAD_KEYWORD_DOCUMENT_CEILING;
  const minRatio = strongNeedKeyword
    ? LIVE_CACHE_PROMOTION_STRONG_NEED_MIN_RATIO
    : LIVE_CACHE_PROMOTION_MIN_RATIO;
  if (volume < 100) return 'volume-too-low';
  if (docs <= 0 || docs > maxDocs) return 'document-count-out-of-range';
  if (ratio < minRatio) return 'ratio-too-low';
  const longTail = keywordLongTailScore(keyword);
  const broadHead = isBroadHeadSssKeyword(keyword);
  const intentFragments = ultimateIntentFragmentCount(keyword);
  if (broadHead && longTail < 18 && !writerReadyMeasuredSeed) return 'broad-head-without-longtail';
  if (volume >= 30_000 && longTail < 18 && intentFragments < 2 && !productBoardSeed && !writerReadyMeasuredSeed) return 'broad-high-volume-without-longtail';
  if (volume >= 10_000 && longTail < 14 && intentFragments < 2 && !productBoardSeed && !writerReadyMeasuredSeed) return 'broad-mid-volume-without-longtail';
  if (!isBlogActionableBoardMetric(metric) && !productBoardSeed && !writerReadyMeasuredSeed) return 'not-blog-actionable-longtail';
  if (docs > 20_000 && ratio < 3) return 'broad-document-field';
  if (docs > 10_000 && longTail < 14 && ratio < 5 && !productBoardSeed) return 'broad-low-specificity';

  const judged = applyKeywordAiJudge(metric, { now, downgradeExcluded: false });
  const ai = judged.aiJudge;
  if (!ai) return 'missing-ai-judge';
  if (ai.verdict === 'exclude') return 'ai-exclude';
  if (ai.spamRisk === 'high') return 'spam-risk-high';
  if (ai.freshnessRisk === 'high' && ratio < 2) return 'freshness-risk-high';
  if (ai.verdict === 'conditional' && ai.score < 78 && !strategicMeasuredIntent && !writerReadyMeasuredSeed) return `conditional-low-score:${ai.score}`;
  if (ai.score < 70 && !hasAdsenseNeedIntent(keyword) && !strategicMeasuredIntent && !writerReadyMeasuredSeed) return `ai-score-low:${ai.score}`;
  if (ai.needIntent === 'weak' && !hasAdsenseNeedIntent(keyword) && !strategicMeasuredIntent && !writerReadyMeasuredSeed) return `weak-need-intent:${ai.score}`;
  return 'ok';
}

function isMeasuredProBoardFallbackMetric(metric: MobileLiveGoldenBoardItem, now: Date): boolean {
  return measuredProBoardFallbackRejectReason(metric, now) === 'ok';
}

function isPublicPreviewCandidate(item: MobileLiveGoldenBoardItem): boolean {
  if (!isLiveRadarUsableMetric(item)) return false;
  if (!isStrictReadyLiveBoardItem(item)) return false;
  if (item.grade === 'B' || item.grade === 'C') return false;
  if (item.totalSearchVolume !== null && item.totalSearchVolume >= PUBLIC_PREVIEW_VOLUME_CEILING) return false;
  if (item.documentCount !== null && item.documentCount >= PUBLIC_PREVIEW_DOCUMENT_CEILING) return false;
  if (item.goldenRatio !== null && item.goldenRatio < 2) return false;
  return true;
}

function isPublicPreviewFallbackCandidate(item: MobileLiveGoldenBoardItem): boolean {
  if (isPublicPreviewCandidate(item)) return true;
  const keyword = normalizeKeyword(item.keyword);
  if (!keyword) return false;
  if (item.grade === 'B' || item.grade === 'C') return false;
  if (!hasCompleteLiveGoldenMetrics(item)) return false;
  if (!isLiveRadarUsableMetric(item)) return false;
  if (!hasMeasuredPcMobileSplit(item)) return false;
  if (!hasTrustedSearchVolumeMeasurement(item)) return false;
  if (!hasTrustedDocumentCountMeasurement(item)) return false;
  if (isThinProfileIntentKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
  if (isSemanticallyMismatchedMeasuredProbe(keyword) || isWeakAutogeneratedProbeCombo(keyword)) return false;
  if (item.totalSearchVolume !== null && item.totalSearchVolume >= PUBLIC_PREVIEW_VOLUME_CEILING) return false;
  if (item.documentCount !== null && item.documentCount >= PUBLIC_PREVIEW_DOCUMENT_CEILING) return false;
  if (item.goldenRatio !== null && item.goldenRatio < 1.2) return false;
  return true;
}

function inferLiveCategoryByRobustRules(keyword: string): string | null {
  const clean = normalizeKeyword(keyword);
  if (VENUE_TRAVEL_BASE_RE.test(clean)) return /항공권|비자|환전|유심/u.test(clean) ? 'travel_overseas' : 'travel_domestic';
  for (const [category, terms] of Object.entries(ROBUST_CATEGORY_TERMS)) {
    if (includesAnyTerm(clean, terms)) return category;
  }
  if (includesAnyTerm(clean, ROBUST_CATEGORY_INTENTS.shopping)) return 'shopping';
  return null;
}

function inferLiveCategory(keyword: string, fallbackCategory: string): string {
  const clean = normalizeKeyword(keyword);
  const robustCategory = inferLiveCategoryByRobustRules(clean);
  if (robustCategory) return robustCategory;
  if (LIVE_LOTTERY_SIGNAL_RE.test(clean)) return 'life_tips';
  if (LIVE_SPORTS_SIGNAL_RE.test(clean)) return 'sports';
  if (LIVE_POLICY_SIGNAL_RE.test(clean)) return 'policy';
  if (LIVE_BROADCAST_SIGNAL_RE.test(clean)) return 'broadcast';
  if (LIVE_FINANCE_SIGNAL_RE.test(clean)) return 'finance';
  if (/로또|복권|당첨번호|당첨지역|판매점/.test(clean)) return 'life_tips';
  if (/모의고사|등급컷|답지|수능|기출|접수|합격자|합격률|시험/.test(clean)) return 'education';
  if (/프로야구|KBO|야구|축구|농구|배구|월드컵|올스타|중계|경기|라인업|하이라이트/.test(clean)) return 'sports';
  if (/공휴일|지원금|장려금|바우처|정책|정부24|환급|보조금|복지|수당/.test(clean)) return 'policy';
  if (/흠뻑쇼|콘서트|컴백|팬미팅|앨범|음원|가수|차트|티저/.test(clean)) return 'music';
  if (/드라마|몇부작|방송시간|인물관계도|재방송|시청률/.test(clean)) return 'drama';
  if (/영화|개봉|쿠키영상|관람평|상영관|결말/.test(clean)) return 'movie';
  const primary = normalizeKeyword(classifyKeyword(clean).primary);
  if (primary && primary !== 'default' && primary !== 'all') return primary;
  return normalizeKeyword(fallbackCategory) || 'live';
}

function isLiveRadarUsableMetric(item: MobileKeywordMetric, now: Date = new Date()): boolean {
  return isLiveRadarUsableKeyword(item.keyword, item.totalSearchVolume, item.documentCount, now);
}

function isLiveRadarUsableMdpResult(item: MDPResult): boolean {
  return isLiveRadarUsableKeyword(
    item.keyword,
    finiteNumber(item.searchVolume),
    finiteNumber(item.documentCount),
  );
}

function isLiveRadarQualityResult(item: MDPResult): boolean {
  if (!isLiveRadarUsableMdpResult(item)) return false;
  if (isQualityGoldenDiscoveryResult(item, { requireActionableIntent: true })) return true;
  const keyword = normalizeKeyword(item.keyword);
  const specific = SPECIFIC_LIVE_KEYWORD_HINT_RE.test(keyword);
  const writerReadyNeed = !isBroadHeadSssKeyword(keyword)
    && (
      isStrongMeasuredNeedKeyword(keyword)
      || hasWriterReadySearchAdProbeIntent(keyword)
      || hasWriterReadySpecificity(keyword)
    );
  if (!isActionableGoldenKeyword(item.keyword) && !specific && !writerReadyNeed) return false;
  const volume = finiteNumber(item.searchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (docs > 0 ? volume / docs : 0);
  if (
    writerReadyNeed
    && volume >= 300
    && docs > 0
    && docs <= 15_000
    && ratio >= 1.5
    && keywordLongTailScore(keyword) >= 12
  ) return true;
  if (specific && volume >= 500 && docs > 0 && docs <= 20_000 && ratio >= 1.5) return true;
  if (volume >= 300 && docs > 0 && docs <= 30_000 && ratio >= 2) return true;
  return volume >= 100
    && docs > 0
    && docs <= 10_000
    && ratio >= 1.2
    && keywordLongTailScore(item.keyword) >= 18;
}

function getBackfillIntents(categoryId: string): string[] {
  if (categoryId === 'policy') return ['신청방법', '대상', '자격', '지급일', '조회', '마감', '준비서류'];
  if (categoryId === 'sports') return ['중계', '경기일정', '예매', '라인업', '하이라이트', '직관 준비물'];
  if (categoryId === 'drama') return ['출연진', '몇부작', '방송시간', '재방송', '결말 해석'];
  if (categoryId === 'movie') return ['개봉일', '출연진', '쿠키영상', '결말 해석', '예매'];
  if (categoryId === 'broadcast') return ['출연진', '방송시간', '다시보기', '재방송', '공식영상'];
  if (categoryId === 'celeb') return ['공식입장', '근황', '기자회견', '논란 정리', '발언', '출연작', '방송'];
  if (categoryId === 'music') return ['컴백 일정', '콘서트 예매', '팬미팅 일정', '앨범 발매일'];
  if (categoryId === 'education') return ['시험일정', '접수', '준비물', '기출 범위', '발표 일정'];
  if (categoryId === 'life_tips') return ['당첨번호', '당첨지역', '실수령액', '판매점', '추첨시간', '조회'];
  if (categoryId === 'fashion') return ['코디', '브랜드', '사이즈', '후기', '할인'];
  if (categoryId === 'beauty') return ['성분', '피부타입', '후기', '추천', '순서'];
  if (categoryId === 'travel_domestic' || categoryId === 'travel_overseas') return ['일정', '준비물', '예약', '주차', '경비'];
  if (categoryId === 'food') return ['맛집', '메뉴', '예약', '가격', '주차'];
  if (categoryId === 'recipe') return ['황금레시피', '재료', '만드는법', '보관법'];
  if (categoryId === 'it' || categoryId === 'ai_tool') return ['사용법', '설정', '오류 해결', '비교', '추천'];
  if (categoryId === 'live_issue') return ['정리', '현재 상황', '이유', '공식입장', '전망', '일정', '소식'];
  return ['추천', '비교', '후기', '가격', '방법', '일정', '조회', '발표', '기자회견', '논란 정리'];
}

function getLiveSeedBackfillIntents(seed: string, categoryId: string): string[] {
  const inferred = inferLiveCategory(seed, categoryId);
  const clean = normalizeKeyword(seed);
  if (isLowValueLiveCandidate(clean)) return [];
  if (hasLiveUltimateNeedIntent(clean)) {
    return ultimateNeedTemplatesForCategory(inferred || categoryId);
  }
  if (LIVE_LOTTERY_SIGNAL_RE.test(clean)) return getBackfillIntents('life_tips');
  if (LIVE_SPORTS_SIGNAL_RE.test(clean)) return getBackfillIntents('sports');
  if (LIVE_POLICY_SIGNAL_RE.test(clean)) return getBackfillIntents('policy');
  if (LIVE_FINANCE_SIGNAL_RE.test(clean)) return getBackfillIntents('finance');
  if (LIVE_GENERAL_ISSUE_RE.test(clean)) return getBackfillIntents('live_issue');
  if (!isStrongLiveIssueSeed(clean) && (categoryId === 'all' || inferred === 'all' || inferred === 'live' || inferred === 'default')) return [];
  if (inferred === 'policy') return getBackfillIntents('policy');
  if (inferred === 'sports') return getBackfillIntents('sports');
  if (inferred === 'education') return getBackfillIntents('education');
  if (inferred === 'music') return getBackfillIntents('music');
  if (inferred === 'movie') return getBackfillIntents('movie');
  if (
    inferred === 'drama'
    || inferred === 'broadcast'
    || /드라마|예능|방송|시즌|신세계|하트시그널|하트 시그널|참교육|신입사원/.test(clean)
  ) {
    return ['몇부작', '출연진', '다시보기', '방송시간', '재방송', '결말', '인물관계도', '공식영상'];
  }
  if (
    categoryId === 'all'
    || inferred === 'all'
    || inferred === 'live'
    || inferred === 'default'
    || LIVE_GENERAL_ISSUE_RE.test(clean)
  ) {
    return getBackfillIntents('live_issue');
  }
  return uniqueKeywords([
    ...getBackfillIntents(inferred),
    ...getBackfillIntents(categoryId),
    '정리',
    '일정',
    '방법',
    '후기',
    '대상',
    '예매',
  ], 12);
}

function getKstDateParts(now: Date): { year: number; month: number; day: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

function getLiveDateHints(now: Date = new Date()): string[] {
  const { year, month, day } = getKstDateParts(now);
  return uniqueKeywords([
    `${month}월 ${day}일`,
    '오늘',
    '이번주',
    `${month}월`,
    `${year} ${month}월`,
    `${year}`,
    '이번달',
  ], 8);
}

function normalizeLiveSeedForDate(seed: string, now: Date): string {
  const clean = normalizeKeyword(seed);
  if (!clean || isStaleOrFutureLiveKeyword(clean, now)) return '';
  if ((LIVE_LOTTERY_SIGNAL_RE.test(clean) || isRobustLottoKeyword(clean)) && !LOTTO_ROUND_RE.test(clean) && robustLottoRound(clean) === null) {
    return `${currentLottoRound(now)}회 로또`;
  }
  return clean;
}

function normalizeRobustLiveSeedBase(value: unknown, now: Date): string {
  const clean = normalizeKeyword(value)
    .replace(/\[(same|up|new|down)\]/gi, ' ')
    .replace(/[!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || isStaleOrFutureLiveKeyword(clean, now) || isThinProfileIntentKeyword(clean)) return '';
  if (isGenericAudienceOnlyKeyword(clean)) return '';
  if (isRobustLottoKeyword(clean)) return normalizeLiveSeedForDate(clean, now);
  return clean;
}

function currentLottoCandidateKeywords(now: Date): string[] {
  const round = currentLottoRound(now);
  return [
    `${round}회 로또 당첨번호`,
    `로또 ${round}회 당첨번호`,
    `${round}회 로또 당첨지역`,
    `${round}회 로또 판매점`,
    `${round}회 로또 실수령액`,
  ];
}

function isPressReleaseSloganSeed(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || !PRESS_RELEASE_SLOGAN_SEED_RE.test(clean)) return false;
  if (CONCRETE_POLICY_PRODUCT_RE.test(clean) || CONCRETE_PUBLISH_ACTION_RE.test(clean)) return false;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const compactLength = clean.replace(/\s+/g, '').length;
  return tokenCount >= 4 || compactLength >= 14;
}

function isLowValueLiveCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  const actionableSportsEvent = isActionableSportsLiveEventKeyword(clean);
  return (!actionableSportsEvent && isUltimateLowValueLookupKeyword(clean))
    || isPressReleaseSloganSeed(clean)
    || isWeakAutogeneratedProbeCombo(clean)
    || (!actionableSportsEvent && LIVE_LOW_VALUE_TOPIC_RE.test(clean))
    || (!actionableSportsEvent && LIVE_NEWS_ONLY_TOPIC_RE.test(clean))
    || (LOW_VALUE_EVENT_TOPIC_RE.test(clean) && !isActionableSportsLiveEventKeyword(clean))
    || LOW_VALUE_PERSON_COMMERCE_RE.test(clean)
    || /관리급여/u.test(clean)
    || LOW_VALUE_POLICY_WORD_SALAD_RE.test(clean)
    || LOW_VALUE_SYNTHETIC_CHAIN_RE.test(clean)
    || hasTooManyCommerceProductHeads(clean)
    || (BARE_OPAQUE_EVENT_BOOKING_RE.test(clean.replace(/\s+/g, '')) && !EVENT_BOOKING_UTILITY_EXEMPT_RE.test(clean))
    || isIncompatiblePolicyUsageIntent(clean)
    || GENERIC_BENEFIT_INTENT_RE.test(clean)
    || BARE_INTENT_ONLY_RE.test(clean)
    || isCommerceIntentWithoutProductBase(clean)
    || LOW_VALUE_SENTENCE_SEED_RE.test(clean)
    || LOW_VALUE_CRISIS_NEWS_RE.test(clean)
    || LOW_VALUE_POLICY_FRAGMENT_RE.test(clean);
}

function hasLiveUltimateNeedIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || (isLowValueLiveCandidate(clean) && !isActionableSportsLiveEventKeyword(clean))) return false;
  if (hasUltimateHighValueNeedIntent(clean)) return true;
  if (LIVE_ULTIMATE_NEED_INTENT_RE.test(clean)) return true;
  const compact = clean.replace(/\s+/g, '');
  return compact !== clean && LIVE_ULTIMATE_NEED_INTENT_RE.test(compact);
}

const POLICY_ONLY_INTENT_RE = /(?:신청|대상|자격|지급일|환급|서류|마감|사용처|금액\s*조회|지원\s*대상|혜택)/u;
const POLICY_USAGE_COMPATIBLE_BASE_RE = /(?:\uBC14\uC6B0\uCC98|\uCE74\uB4DC|\uC0C1\uD488\uAD8C|\uC774\uC6A9\uAD8C|\uCFE0\uD3F0|\uD3EC\uC778\uD2B8|\uCE90\uC2DC\uBC31)/u;
const POLICY_USAGE_INCOMPATIBLE_BASE_RE = /(?:\uC2E4\uC5C5\uAE09\uC5EC|\uBD80\uBAA8\uAE09\uC5EC|\uC721\uC544\uD734\uC9C1\uAE09\uC5EC|\uC544\uB3D9\uC218\uB2F9|\uC218\uB2F9|\uAE09\uC5EC|\uADFC\uB85C\uC7A5\uB824\uAE08|\uC790\uB140\uC7A5\uB824\uAE08|\uCD9C\uC0B0\uC9C0\uC6D0\uAE08|\uC9C0\uC6D0\uAE08|\uD658\uAE09\uAE08|\uAE30\uCD08\uC5F0\uAE08|\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C|\uCCAD\uB144\uBBF8\uB798\uC801\uAE08|\uC801\uAE08|\uC815\uCC45\uC790\uAE08|\uB300\uCD9C|\uC138\uC561\uACF5\uC81C)/u;
const USAGE_PLACE_INTENT_RE = /\uC0AC\uC6A9\uCC98/u;

function isIncompatiblePolicyUsageIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  return USAGE_PLACE_INTENT_RE.test(clean)
    && POLICY_USAGE_INCOMPATIBLE_BASE_RE.test(clean)
    && !POLICY_USAGE_COMPATIBLE_BASE_RE.test(clean);
}

function hasTooManyCommerceProductHeads(keyword: string): boolean {
  const compact = normalizeKeyword(keyword).replace(/\s+/g, '');
  if (!compact) return false;
  let hits = 0;
  for (const pattern of LIVE_COMMERCE_PRODUCT_HEADS) {
    if (pattern.test(compact)) hits += 1;
  }
  return hits >= 3;
}

const VENUE_TRAVEL_INTENT_RE = /(?:주차|입장료|숙소|항공권|비자|환전|입국|운영시간|코스)/u;
const FOOD_ONLY_INTENT_RE = /(?:메뉴|웨이팅|포장|맛집)/u;
const SPORTS_EVENT_INTENT_RE = /(?:중계|경기\s*일정|예매(?:\s*일정)?|라인업|순위|결과|직관|티켓|좌석)/u;
const PRODUCT_PURCHASE_INTENT_RE = /(?:가격|비교|추천|후기|할인|쿠폰|구매처|최저가|재고|스펙|사이즈|성분|실사용|실착)/u;
const SPORTS_EQUIPMENT_BASE_RE = /(?:라켓|축구화|농구화|러닝화|운동화|골프채|골프공|글러브|배트|유니폼|헬멧|보호대|요가매트|덤벨)/u;
const PRODUCT_BASE_SIGNAL_RE = /(?:아이폰|갤럭시|노트북|태블릿|청소기|에어컨|냉장고|세탁기|모니터|키보드|마우스|이어폰|헤드폰|충전기|보조배터리|선풍기|제습기|가습기|공기청정기|로봇청소기|선크림|화장품|세럼|크림|샴푸|패딩|레인부츠|장화|양산|우산|수영복|샌들|크록스|가방|신발|운동화|라켓|축구화|골프채|골프공|글러브|배트|유니폼|요가매트|덤벨|텐트|캠핑|아이스박스|텀블러|침구|매트리스|의자|책상|유심|렌터카|렌트카|항공권|숙소|호텔|상품권|쿠폰|바우처|카드|보험|대출|청약|AI\s*툴|AI\s*영상|영상툴|생성툴|자동화툴|앱|서비스)/iu;
const TRAVEL_PURCHASE_BASE_RE = /(?:렌터카|렌트카|숙소|호텔|리조트|펜션|캠핑장|항공권|유심|이심|eSIM|환전|비자)/iu;
const KOREAN_PRODUCT_EVENT_TAIL_MISMATCH_RE = /(?:\uC911\uACC4\s*\uC77C\uC815|\uACBD\uAE30\s*\uC77C\uC815|\uC9C1\uAD00\s*\uC900\uBE44\uBB3C|\uB77C\uC778\uC5C5|\uD558\uC774\uB77C\uC774\uD2B8|\uACBD\uAE30\s*\uACB0\uACFC|\uC608\uB9E4\s*\uC77C\uC815|\uD2F0\uCF13\uD305\s*\uC77C\uC815)/u;
const KOREAN_PRODUCT_RANK_CONTEXT_RE = /(?:\uC21C\uC704|\uBE44\uAD50|\uAC00\uC131\uBE44|\uAC00\uACA9|\uCD94\uCC9C|\uD560\uC778|\uCFE0\uD3F0|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uBE0C\uB79C\uB4DC\s*\uBE44\uAD50)/u;
const KOREAN_PRODUCT_TOOL_TAIL_MISMATCH_RE = /(?:\uC624\uB958\s*\uD574\uACB0|\uBB34\uB8CC\s*\uB300\uCCB4|\uC5C5\uB370\uC774\uD2B8|\uC124\uC815|\uAD6C\uB3C5\uB8CC|\uD15C\uD50C\uB9BF|\uC5C5\uBB34\s*\uC790\uB3D9\uD654)/u;
const KOREAN_PROMPT_TAIL_RE = /\uD504\uB86C\uD504\uD2B8/u;
const KOREAN_PROMPT_COMPATIBLE_BASE_RE = /(?:\bAI\b|\uCC57\s*GPT|ChatGPT|GPT|\uD074\uB85C\uB4DC|Claude|\uC0DD\uC131\s*AI|\uC0DD\uC131\uD615\s*AI|\uC774\uBBF8\uC9C0\s*\uC0DD\uC131|\uC601\uC0C1\s*\uC0DD\uC131|\uC790\uB3D9\uD654\s*\uD234)/iu;

function isProductEventOrPromptTailMismatch(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || !PRODUCT_BASE_SIGNAL_RE.test(clean)) return false;
  if (KOREAN_PRODUCT_EVENT_TAIL_MISMATCH_RE.test(clean)) return true;
  if (KOREAN_PRODUCT_RANK_CONTEXT_RE.test(clean) && KOREAN_PRODUCT_TOOL_TAIL_MISMATCH_RE.test(clean)) return true;
  if (KOREAN_PROMPT_TAIL_RE.test(clean) && !KOREAN_PROMPT_COMPATIBLE_BASE_RE.test(clean)) return true;
  return false;
}

const LIVE_COMMERCE_PRODUCT_HEADS = [
  /무선\s*에어건/u,
  /세차\s*송풍기/u,
  /먼지\s*청소기/u,
  /청소기/u,
  /제습기/u,
  /에어컨/u,
  /공기청정기/u,
  /음식물\s*처리기/u,
  /로봇\s*청소기/u,
  /선풍기/u,
];
const VENUE_TRAVEL_BASE_RE = /(?:바다하늘길|둘레길|해수욕장|전망대|수목원|휴양림|공원|축제|박람회|전시|관광|가볼만한곳|입장료|주차장|운영시간|렌터카|렌트카|숙소|호텔|항공권|비자|환전|유심)/u;
const NON_PRODUCT_NEWS_BASE_RE = /(?:KBO|프로야구|올스타전|월드컵|FIFA|흠뻑쇼|콘서트|팬미팅|컴백|라인업|하이라이트|셋리스트|특검|반란|회장|후보|활약|근황|연속\s*안타|발언|논란|출전|작은\s*키|참교육|신입사원)/iu;
const HOLIDAY_CALENDAR_BASE_RE = /(?:공휴일|대체공휴일|광복절|제헌절|개천절|한글날|현충일|추석|설날|어린이날|부처님오신날|성탄절|크리스마스|근로자의날)/u;
const HOLIDAY_CALENDAR_ALLOWED_INTENT_RE = /(?:쉬는날|대체공휴일|연휴|택배|은행|병원|약국|학교|주식시장|관공서|운영|영업|근무|휴무|일정)/u;
const CALENDAR_EVENT_BAD_INTENT_RE = /(?:가격비교|최저가|구매처|렌탈|보험\s*적용|추천\s*후기|할인\s*쿠폰|비용\s*비교|신청(?:기간|방법)?|필요서류|서류|재고)/u;
const LOW_VALUE_PERSON_COMMERCE_RE = /(?:(?:\d{1,2}월\s*\d{1,2}일\s*)?[가-힣]{2,5}(?:\s+[가-힣]{2,5})?\s*(?:활약|근황|특검|반란|회장|후보|연속\s*안타|출전|작은\s*키|발언|논란|프로필).*(?:가격|할인|쿠폰|구매처|최저가|재고|실사용|추천\s*후기)|^\d{1,2}월\s*\d{1,2}일\s+[가-힣]{2,5}(?:\s+[가-힣]{2,5})?\s*(?:가격|할인|쿠폰|구매처|최저가|재고|실사용|추천\s*후기))/u;
const LOW_VALUE_EVENT_TOPIC_RE = /(?:KBO|프로야구|올스타전|월드컵|FIFA|흠뻑쇼|신입사원\s*강회장|참교육\s*몇부작|드라마\s*참교육|로또|당첨번호|\d{3,5}\s*회|등급컷|광복절|제헌절|개천절|한글날)/iu;
const GENERIC_BENEFIT_INTENT_RE = /^(?:지원금|보조금|환급금|장려금|바우처|수당|급여)\s*(?:신청|대상|자격|조건|지급일|조회|마감|환급|서류|사용처|지원)/u;
const BARE_INTENT_ONLY_RE = /^(?:신청|신청방법|대상|자격|조건|지급일|조회|서류|마감|마감일|환급|방법|사용처|금액|준비서류|지원|혜택|가격|비교|추천|후기|할인|쿠폰|구매처|재고|최저가)(?:\s+(?:신청|신청방법|대상|자격|조건|지급일|조회|서류|마감|마감일|환급|방법|사용처|금액|준비서류|지원|혜택|가격|비교|추천|후기|할인|쿠폰|구매처|재고|최저가)){0,2}$/u;
const LOW_VALUE_POLICY_WORD_SALAD_RE = /(?:서류|조건)\s*(?:마감일|소득기준\s*계산|필요\s*서류)|소득기준\s*계산.{0,8}(?:서류|조건|마감일)|마감일\s*(?:서류|조건|소득기준)/u;
const LOW_VALUE_SYNTHETIC_CHAIN_RE = /(?:^\d{1,2}월\s*\d{1,2}일\s+|([가-힣A-Za-z0-9]{2,})\s*신청\s*\1\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)?|^신청\s+[가-힣A-Za-z0-9]{2,}\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)|신청\s*(?:국가)?[가-힣A-Za-z0-9]{2,}\s*신청(?:대상|방법|자격|조건|조회|지급일|서류|문의|안내|하기|현황)?|가입신청\s*(?:신청|금액)|신청\s*신청|구매처\s*(?:구매처|재고)|최저가\s*구매처\s*재고|할인\s*정보\s*(?:추천|할인|구매처|최저가|실사용)|일정\s*콘서트\s*일정|티켓팅\s*방법\s*굿즈|굿즈\s*구매\s*(?:조회|준비물|주의사항|발표|정리)|준비서류\s*(?:신청|대상|자격|조건|지급일|환급|지원|금액|조회|마감)|정리\s*운영시간|현재\s*상황\s*운영시간|정부24\s*(?:지급일|신청|조회|마감)|공식\s*확인(?:\s*경로)?|놓치기\s*쉬운\s*변경사항|변경사항|6월\s*온라인|금액\s*조회\s*(?:신청|대상|자격|지급일|환급)|마감일\s*지급일|신청기간\s*(?:대상|자격|지급일|환급|금액|지원)|내역\s*한눈에|현재\s*상황\s*(?:정리|이유)|총정리|소득기준\s*계산\s*(?:예약|후기|추천|비용|검사|증상|원인|서류)|(?:신청|가입신청).{0,10}소득기준.{0,10}(?:계산|서류|예약)|관리급여.{0,10}소득기준.{0,10}(?:계산|예약))/u;
const NON_PRODUCT_COMMERCE_TAIL_RE = /(?:가격비교|최저가|구매처|할인\s*쿠폰|할인|쿠폰|렌탈|렌트|보험\s*적용\s*비용|비용\s*비교|추천\s*후기|실사용\s*후기)/u;
const NON_PRODUCT_COMMERCE_BASE_RE = /(?:로또|당첨번호|당첨지역|공휴일|대체공휴일|제헌절|광복절|개천절|한글날|추석|설날|근로자의날|지원금|장려금|수당|급여|환급일|정책|KBO|프로야구|올스타전|월드컵|FIFA|입장료|주차|운영시간|티켓팅|예매|좌석배치도|라인업|하이라이트|경기일정|몇부작|등장인물|줄거리|원작|OTT|나무위키|송지호|바다하늘길|축제|공연|콘서트|전시|행사|관광|여행|공원|수목원|박람회|엑스포|페스티벌)/iu;
const VALID_EVENT_UTILITY_TAIL_RE = /(?:예매|티켓팅|좌석|주차|입장료|운영시간|일정|라인업|중계|하이라이트)/u;
const LIVE_MEASURED_PROBE_NEWS_PERSON_BASE_RE = /(?:프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대|작품활동|필모그래피|감독|선수|배우|가수|회장|대표|후보|특검|반란|활약|근황|발언|논란|출전|작은\s*키)/u;
const LIVE_MEASURED_PROBE_BROADCAST_BASE_RE = /(?:드라마|예능|방송|방송시간|출연진|몇부작|등장인물|인물관계도|다시보기|재방송|공식영상|시청률|참교육|신입사원\s*강회장|멋진\s*신세계)/u;
const DUPLICATED_MEASURED_PROBE_INTENT_RE = /(?:방송시간.{0,8}방송시간|출연진.{0,8}출연진|몇부작.{0,8}몇부작|가격비교.{0,8}가격비교|최저가.{0,8}최저가|구매처.{0,8}구매처|추천\s*후기.{0,8}추천\s*후기|중계\s*일정.{0,8}중계\s*일정|경기\s*시간.{0,8}경기\s*시간)/u;

const SPORTS_LIVE_EVENT_TOPIC_RE = /(?:월드컵|북중미\s*월드컵|월드컵\s*예선|FIFA|축구|축구\s*국가대표|국가대표|대표팀|A매치|홍명보|손흥민|김민재|이강인|엔트리|명단|조편성|대진표)/iu;
const SPORTS_LIVE_EVENT_ACTION_INTENT_RE = /(?:중계|경기\s*일정|경기\s*시간|일정|시간|명단|라인업|선발|엔트리|소집|출전|예매|티켓|티켓팅|좌석|조편성|대진표|순위|결과|하이라이트|상대전적|감독|선수|최종명단|조별리그)/u;

function isSportsLiveEventSeed(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return SPORTS_LIVE_EVENT_TOPIC_RE.test(clean);
}

function isActionableSportsLiveEventKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  return isSportsLiveEventSeed(clean) && SPORTS_LIVE_EVENT_ACTION_INTENT_RE.test(clean);
}

function isInvalidNonProductCommerceExpansion(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (isProductEventOrPromptTailMismatch(clean)) return true;
  if (!NON_PRODUCT_COMMERCE_TAIL_RE.test(clean)) return false;
  if (!NON_PRODUCT_COMMERCE_BASE_RE.test(clean)) return false;
  const onlyEventUtility = VALID_EVENT_UTILITY_TAIL_RE.test(clean)
    && !/(?:가격비교|최저가|구매처|할인|쿠폰|렌탈|렌트|보험\s*적용|비용\s*비교|추천\s*후기|실사용\s*후기)/u.test(clean);
  return !onlyEventUtility;
}

function isSemanticallyMismatchedMeasuredProbe(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  const normalized = clean.replace(/\s+/g, ' ');
  if (DUPLICATED_MEASURED_PROBE_INTENT_RE.test(normalized)) return true;
  if (!NON_PRODUCT_COMMERCE_TAIL_RE.test(normalized)) return false;
  if (LIVE_MEASURED_PROBE_BROADCAST_BASE_RE.test(normalized)) return true;
  if (LIVE_MEASURED_PROBE_NEWS_PERSON_BASE_RE.test(normalized)) return true;
  return isSportsLiveEventSeed(normalized) && !LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_RE.test(normalized);
}

const WEAK_AUTOGEN_PROBE_COMBO_RE = /(?:(?:오메가3|비타민|유산균|영양제|크림|샴푸|선크림|청소기|에어컨|제습기|공기청정기|로봇청소기|노트북|아이폰|갤럭시|모니터|키보드|마우스|이어폰|헤드폰).{0,18}(?:신청|신청\s*대상|자격|지급일|소득기준|필요\s*서류|마감일|예약\s*방법)|(?:순위|랭킹).{0,12}예약|(?:싱크대|배수구|수전|변기|방충망|도어락|인테리어|수리|교체|샤워부스|욕실|물때|곰팡이|냄새|스테인레스|진공단열재).{0,18}(?:프리랜서|알바|개인사업자|무직자|맞벌이|신청\s*대상|신청\s*조건|소득기준|지급일)|(?:근로장려금|자녀장려금|지원금|바우처|수당|급여|환급|적금|대출).{0,18}(?:최저가|구매처|할인\s*쿠폰|렌탈|가격비교\s*후기))/u;
const SYNTHETIC_POLICY_AUDIENCE_TAIL_RE = /(?:프리랜서|알바|개인사업자|무직자|맞벌이|한부모|대학생|퇴사자|직장인|사회초년생).{0,14}(?:신청\s*(?:대상|조건|방법)|자격\s*조건|지원\s*대상|소득기준(?:\s*계산)?|지급일\s*조회|필요\s*서류|마감일)|(?:신청\s*(?:대상|조건|방법)|자격\s*조건|지원\s*대상|소득기준(?:\s*계산)?|지급일\s*조회|필요\s*서류|마감일).{0,14}(?:프리랜서|알바|개인사업자|무직자|맞벌이|한부모|대학생|퇴사자|직장인|사회초년생)/u;
const CERTIFICATE_PAYROLL_MISMATCH_RE = /(?:\uC644\uB0A9\uC99D\uBA85\uC11C).{0,18}(?:\uC77C\uC6A9\uC9C1|\uD504\uB9AC\uB79C\uC11C|\uC9C1\uC7A5\uC778|\uC2E4\uC218\uB839\uC561|\uACF5\uC81C\uD56D\uBAA9|3\.3\s*\uC138\uAE08|\uC138\uD6C4\s*\uACC4\uC0B0|\uC8FC\uD734\uC218\uB2F9|4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC|\uC694\uC728\s*\uACC4\uC0B0)|(?:\uC77C\uC6A9\uC9C1|\uD504\uB9AC\uB79C\uC11C|\uC9C1\uC7A5\uC778|\uC2E4\uC218\uB839\uC561|\uACF5\uC81C\uD56D\uBAA9|3\.3\s*\uC138\uAE08|\uC138\uD6C4\s*\uACC4\uC0B0|\uC8FC\uD734\uC218\uB2F9|4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC|\uC694\uC728\s*\uACC4\uC0B0).{0,18}(?:\uC644\uB0A9\uC99D\uBA85\uC11C)/u;
const CALCULATOR_INTENT_MISMATCH_RE = /(?:\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30|\uC2DC\uAE09\uACC4\uC0B0\uAE30).{0,18}(?:\uC8FC\uD734\uC218\uB2F9|\uD1F4\uC9C1\uAE08|4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8|\uD504\uB9AC\uB79C\uC11C|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uC2E4\uC218\uB839\uC561|\uACF5\uC81C\uD56D\uBAA9|\uC138\uAE08|\uC694\uC728\uD45C)|(?:\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30).{0,18}(?:\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC9C0\uAE09\uC77C|\uB9C8\uAC10\uC77C|\uC18C\uB4DD\uAE30\uC900|\uD1F4\uC9C1\uAE08|4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8|\uD504\uB9AC\uB79C\uC11C|\uAC1C\uC778\uC0AC\uC5C5\uC790)|(?:\uD1F4\uC9C1\uAE08\uACC4\uC0B0\uAE30).{0,18}(?:4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8|\uC8FC\uD734\uC218\uB2F9|\uC2E0\uCCAD|\uB300\uC0C1|\uB9C8\uAC10\uC77C|\uAC1C\uC778\uC0AC\uC5C5\uC790|\uD504\uB9AC\uB79C\uC11C)|(?:\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30|4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30).{0,18}(?:\uD1F4\uC9C1\uAE08|\uC8FC\uD734\uC218\uB2F9|\uB9C8\uAC10\uC77C|\uAC1C\uC778\uC0AC\uC5C5\uC790\s*\uACF5\uC81C\uD56D\uBAA9)|(?:\uC2E4\uC5C5\uAE09\uC5EC\uACC4\uC0B0\uAE30).{0,18}(?:\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC8FC\uD734\uC218\uB2F9|\uD1F4\uC9C1\uAE08|4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8|\uB9C8\uAC10\uC77C)/u;
const CALCULATOR_LOW_INTENT_RE = /(?:\uACC4\uC0B0\uAE30).{0,18}(?:\uD6C4\uAE30)/u;
const ALLOWED_POLICY_AUDIENCE_NEED_RE = /(?:(?:프리랜서|알바|개인사업자|무직자).{0,10}(?:근로장려금|자녀장려금|실업급여)|(?:근로장려금|자녀장려금|실업급여).{0,10}(?:프리랜서|알바|개인사업자|무직자)|(?:개인사업자).{0,10}(?:소상공인(?:대출|정책자금|지원금)?|정책자금|직접대출|대리대출)|(?:소상공인(?:대출|정책자금|지원금)?|정책자금|직접대출|대리대출).{0,10}(?:개인사업자))/u;
const POLICY_OVERCOMPOUND_PROBE_RE = /(?:소득기준\s*계산.{0,16}(?:신청|대상|자격|지급일|지원금|바우처|장려금|급여|수당)|(?:신청|대상|자격|지급일|지원금|바우처|장려금|급여|수당).{0,16}소득기준\s*계산|(?:개인사업자|프리랜서|알바|무직자|맞벌이).{0,16}소득기준\s*계산|소득기준\s*계산.{0,16}(?:개인사업자|프리랜서|알바|무직자|맞벌이))/u;
const NON_POLICY_BASE_WITH_POLICY_TAIL_RE = /(?:물때|곰팡이|냄새|청소|제거|샤워부스|스테인레스|진공단열재|싱크대|배수구|수전|변기|방충망|도어락|인테리어|수리|교체|펜션|숙소|렌터카|렌트카|에어컨|청소기|공기청정기|제습기|오메가3|비타민|유산균|영양제).{0,24}(?:신청\s*(?:대상|조건|방법)|자격\s*조건|지원\s*대상|소득기준(?:\s*계산)?|지급일\s*조회|필요\s*서류|마감일)/u;
const KOREAN_PRODUCT_BASE_WITH_POLICY_TAIL_RE = /(?:\uCC28\uB7C9\uC6A9\s*\uC5D0\uC5B4\uAC74|\uC74C\uC2DD\uBB3C\s*\uCC98\uB9AC\uAE30|\uC368\uD050\uB808\uC774\uD130|\uC368\uD058\uB808\uC774\uD130|\uC11C\uD058\uB808\uC774\uD130|\uCC3D\uBB38\uD615\s*\uC5D0\uC5B4\uCEE8|\uB85C\uBD07\s*\uCCAD\uC18C\uAE30|\uBB34\uC120\s*\uCCAD\uC18C\uAE30|\uC18C\uD615\s*\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30(?:\s*\uD544\uD130)?|\uACE8\uD504\uCC44|\uC81C\uC2B5\uAE30|\uC120\uD48D\uAE30|\uCCAD\uC18C\uAE30|\uB0C9\uC7A5\uACE0|\uC138\uD0C1\uAE30|\uC74C\uC2DD\uBB3C).{0,24}(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uC870\uAC74|\uBC29\uBC95)?|\uC628\uB77C\uC778\s*\uC2E0\uCCAD|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uC6D0\s*\uB300\uC0C1|\uC18C\uB4DD\uAE30\uC900(?:\s*\uACC4\uC0B0)?|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C)/u;

function hasSyntheticPolicyAudienceMismatch(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (NON_POLICY_BASE_WITH_POLICY_TAIL_RE.test(clean)) return true;
  if (KOREAN_PRODUCT_BASE_WITH_POLICY_TAIL_RE.test(clean)) return true;
  if (POLICY_OVERCOMPOUND_PROBE_RE.test(clean)) return true;
  if (!SYNTHETIC_POLICY_AUDIENCE_TAIL_RE.test(clean)) return false;
  return !ALLOWED_POLICY_AUDIENCE_NEED_RE.test(clean);
}

function isWeakAutogeneratedProbeCombo(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  return Boolean(clean && (
    WEAK_AUTOGEN_PROBE_COMBO_RE.test(clean)
    || CERTIFICATE_PAYROLL_MISMATCH_RE.test(clean)
    || CALCULATOR_INTENT_MISMATCH_RE.test(clean)
    || CALCULATOR_LOW_INTENT_RE.test(clean)
    || isProductEventOrPromptTailMismatch(clean)
    || hasSyntheticPolicyAudienceMismatch(clean)
  ));
}

const BARE_OPAQUE_EVENT_BOOKING_RE = /^[\uAC00-\uD7A3A-Za-z0-9]{2,16}(?:\uC608\uB9E4|\uD2F0\uCF13\uD305)$/u;
const EVENT_BOOKING_UTILITY_EXEMPT_RE = /(?:\uD56D\uACF5\uAD8C|\uC219\uC18C|\uD638\uD154|\uB80C\uD130\uCE74|\uB80C\uD2B8\uCE74|\uAE30\uCC28|KTX|SRT|\uBC84\uC2A4|\uC720\uB78C\uC120|\uD06C\uB8E8\uC988|\uC785\uC7A5\uAD8C|\uCCB4\uD5D8|\uBC15\uB78C\uD68C|\uC804\uC2DC|\uC218\uBAA9\uC6D0|\uD734\uC591\uB9BC)/iu;
const ULTIMATE_INTENT_FRAGMENT_RE = /(?:신청|대상|자격|조건|일정|지급일|조회|서류|마감|환급|사용처|방법|금액|지원금|지원|보조금|장려금|대지급금|수당|수급|보험|급여|바우처|세액공제|수혜주|관련주|주가|전망|실적|발표|가격|비용|검사|증상|원인|비교|추천|후기|할인|쿠폰|구매처|최저가|재고|예약|예매|티켓팅|좌석|주차|입장료|영업시간|운영시간|숙소|항공권|비자|환전|메뉴|웨이팅|준비물|주의사항|오류|설정|사용법|업데이트|공략|사전예약|출시일|티어|성분|스펙|사이즈|굿즈)/gu;
const POLICY_COMPOUND_INTENT_FRAGMENT_RE = /(?:신청|가입신청|대상|자격|조건|지급일|조회|서류|마감|환급|사용처|금액|소득기준|계산|온라인|정부24|예약|후기|추천|비용|검사|증상|원인)/gu;
const COMMERCE_GENERIC_INTENT_RE = /^(?:방법|일정|조회|발표|정리|준비물|주의사항)$/u;
const VENUE_FRIENDLY_CATEGORIES = new Set(['travel_domestic', 'travel_overseas', 'food', 'health', 'music', 'sports']);
const PRODUCT_FRIENDLY_CATEGORIES = new Set([
  'shopping',
  'electronics',
  'fashion',
  'beauty',
  'home_life',
  'food',
  'recipe',
  'it',
  'ai_tool',
  'game',
]);
const STRICT_COMMERCE_CATEGORIES = new Set(['shopping', 'electronics', 'fashion', 'beauty']);

function isUltimateIntentCompatible(base: string, intent: string, categoryId: string): boolean {
  const cleanBase = normalizeKeyword(base);
  const cleanIntent = normalizeKeyword(intent);
  const category = inferLiveCategoryByRobustRules(cleanBase) || normalizeKeyword(categoryId);
  if (!cleanIntent) return false;
  const isPolicyCategory = category === 'policy' || category === 'finance';
  const isPolicyBase = LIVE_POLICY_SIGNAL_RE.test(cleanBase) || LIVE_FINANCE_SIGNAL_RE.test(cleanBase);
  const productIntent = PRODUCT_PURCHASE_INTENT_RE.test(cleanIntent);
  const productBase = PRODUCT_BASE_SIGNAL_RE.test(cleanBase);
  const travelCategory = category === 'travel_domestic' || category === 'travel_overseas';
  const reservationIntent = /(?:예약|숙소|호텔|픽업|항공권|비자|환전|유심|eSIM)/iu.test(cleanIntent);
  if (isInvalidNonProductCommerceExpansion(`${cleanBase} ${cleanIntent}`)) return false;

  if (HOLIDAY_CALENDAR_BASE_RE.test(cleanBase)) {
    if (productIntent) return false;
    if (!HOLIDAY_CALENDAR_ALLOWED_INTENT_RE.test(cleanIntent)) return false;
  }
  if (
    USAGE_PLACE_INTENT_RE.test(cleanIntent)
    && POLICY_USAGE_INCOMPATIBLE_BASE_RE.test(cleanBase)
    && !POLICY_USAGE_COMPATIBLE_BASE_RE.test(cleanBase)
  ) return false;
  if (POLICY_ONLY_INTENT_RE.test(cleanIntent) && !isPolicyCategory && !isPolicyBase) return false;
  if (category === 'policy' && (VENUE_TRAVEL_INTENT_RE.test(cleanIntent) || SPORTS_EVENT_INTENT_RE.test(cleanIntent))) return false;
  if (reservationIntent && !['travel_domestic', 'travel_overseas', 'health', 'food', 'music'].includes(category)) return false;
  if (category !== 'travel_overseas' && /(?:비자|환전|유심|eSIM)/iu.test(cleanIntent)) return false;
  if ((category === 'travel_domestic' || /제주\s*항공권/u.test(cleanBase)) && /항공권/u.test(cleanBase) && /(?:유심|eSIM|비자|환전)/iu.test(cleanIntent)) return false;
  if (category === 'health' && /검사/u.test(cleanBase) && /치료/u.test(cleanIntent)) return false;
  if (category === 'health' && /치료제/u.test(cleanBase) && /치료/u.test(cleanIntent)) return false;
  if (/실비\s*청구/u.test(cleanBase) && /(?:일정|준비물|예약|추천|후기)/u.test(cleanIntent)) return false;
  if (/(?:전기요금|전기세|소음)/u.test(cleanBase) && /(?:가격비교|최저가|구매처|할인|쿠폰|추천\s*후기|비용\s*비교)/u.test(cleanIntent)) return false;
  if (/(?:흡입력|배터리|물걸레|문턱)/u.test(cleanBase) && /(?:전기요금|전기세|소음|비용\s*비교)/u.test(cleanIntent)) return false;
  if (/저소음/u.test(cleanBase) && !PRODUCT_PURCHASE_INTENT_RE.test(cleanIntent)) return false;
  if (category === 'policy' && PRODUCT_PURCHASE_INTENT_RE.test(cleanIntent) && !/비교|조회/u.test(cleanIntent)) return false;
  if (FOOD_ONLY_INTENT_RE.test(cleanIntent) && category !== 'food') return false;
  if (travelCategory && productIntent && !TRAVEL_PURCHASE_BASE_RE.test(cleanBase)) return false;
  if (TRAVEL_PURCHASE_BASE_RE.test(cleanBase) && /(?:입장료|주차)/u.test(cleanIntent)) return false;
  if (VENUE_TRAVEL_INTENT_RE.test(cleanIntent) && !VENUE_FRIENDLY_CATEGORIES.has(category)) return false;
  if (SPORTS_EVENT_INTENT_RE.test(cleanIntent) && category !== 'sports' && category !== 'music') return false;
  if (category === 'sports' && SPORTS_EQUIPMENT_BASE_RE.test(cleanBase) && SPORTS_EVENT_INTENT_RE.test(cleanIntent)) return false;
  if (category === 'sports' && productIntent && !SPORTS_EQUIPMENT_BASE_RE.test(cleanBase)) return false;
  if (productIntent && NON_PRODUCT_NEWS_BASE_RE.test(cleanBase) && !productBase) return false;
  if (productIntent && !productBase && !VENUE_TRAVEL_BASE_RE.test(cleanBase) && !isPolicyBase && !/(?:맛집|메뉴|병원|검사|치료|수리|교체|청소|설정|오류|사용법)/u.test(cleanBase)) return false;
  if (
    productIntent
    && !PRODUCT_FRIENDLY_CATEGORIES.has(category)
    && category !== 'sports'
    && !(travelCategory && TRAVEL_PURCHASE_BASE_RE.test(cleanBase))
  ) return false;
  if (STRICT_COMMERCE_CATEGORIES.has(category) && COMMERCE_GENERIC_INTENT_RE.test(cleanIntent)) return false;
  return true;
}

function ultimateIntentFragmentCount(keyword: string): number {
  const clean = normalizeKeyword(keyword);
  const hits = clean.match(ULTIMATE_INTENT_FRAGMENT_RE) || [];
  return new Set(hits.map((hit) => hit.replace(/\s+/g, ''))).size;
}

function policyCompoundIntentFragmentCount(keyword: string): number {
  const clean = normalizeKeyword(keyword);
  const hits = clean.match(POLICY_COMPOUND_INTENT_FRAGMENT_RE) || [];
  return new Set(hits.map((hit) => hit.replace(/\s+/g, ''))).size;
}

function isOverChainedPolicyIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  const inferred = inferLiveCategory(clean, 'all');
  const policyLike = inferred === 'policy'
    || inferred === 'finance'
    || LIVE_POLICY_SIGNAL_RE.test(clean)
    || LIVE_FINANCE_SIGNAL_RE.test(clean)
    || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || SEARCHAD_FINANCE_BASE_RE.test(clean);
  if (!policyLike) return false;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const fragmentCount = policyCompoundIntentFragmentCount(clean);
  if (fragmentCount >= 4) return true;
  if (fragmentCount >= 3 && tokenCount >= 5) return true;
  return /(?:소득기준|관리급여).{0,10}(?:계산|서류).{0,10}(?:예약|후기|추천|비용|검사|증상|원인)/u.test(clean);
}

function isMismatchedLiveEventIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  const holidayLike = HOLIDAY_CALENDAR_BASE_RE.test(clean);
  const actionableSportsEvent = isActionableSportsLiveEventKeyword(clean);
  const eventLike = holidayLike
    || (LOW_VALUE_EVENT_TOPIC_RE.test(clean) && !actionableSportsEvent)
    || (NON_PRODUCT_NEWS_BASE_RE.test(clean) && !actionableSportsEvent);
  if (!eventLike) return false;
  if (CALENDAR_EVENT_BAD_INTENT_RE.test(clean)) return true;
  if (holidayLike && !HOLIDAY_CALENDAR_ALLOWED_INTENT_RE.test(clean.replace(HOLIDAY_CALENDAR_BASE_RE, ''))) {
    return /\s/.test(clean);
  }
  return false;
}

function hasRepeatedCompactIntentChain(keyword: string): boolean {
  const tokens = normalizeKeyword(keyword).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const compact = (values: string[]) => values
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7A3]/g, '');
  for (let split = 1; split < tokens.length; split += 1) {
    const left = compact(tokens.slice(0, split));
    const right = compact(tokens.slice(split));
    if (left.length >= 5 && right.startsWith(left) && right.length - left.length >= 2) {
      return true;
    }
  }
  return false;
}

const LOW_VALUE_REPEAT_TOKEN_RE = /^(?:20\d{2}|최신|오늘|이번주|추천|후기|리뷰|비교|가격|설치|용량|신청|조회|정리|총정리|체크리스트|실사용|할인|정보|구매처|재고|최저가|출시일|스펙)$/u;
const LOW_VALUE_LIVE_COMPACT_CHAIN_RE = /(추천20\d{2}|20\d{2}추천|추천사용법|추천용량|추천최저가|최저가추천|추천가격|가격추천|추천구매처|추천할인정보|추천출시일|추천스펙|비교후기|비교가격|비교구매처|비교최저가|가격후기|가격할인정보|가격구매처|가격출시일|최저가후기|최저가실사용|최저가구매처|구매처최저가|가이드구매처|용량선택가이드구매처|구매처실사용|실사용후기|할인실사용|할인정보후기|추천실사용|스펙스펙|스펙추천|스펙후기|스펙비교|스펙출시일|렌탈비교추천|렌탈비교후기|렌탈비교할인)/u;
const LIVE_GENERIC_INTENT_TOKEN_RE = /^(?:20\d{2}|\d+월|최신|오늘|이번주|추천|후기|리뷰|비교|가격|설치|용량|신청|조회|정리|총정리|체크리스트|실사용|할인|정보|방법|가이드|사용법|주의사항|전기세|전기요금|청소|렌탈|구매처|가성비|소음|조건|순위|필터교체|필터|재고|최저가|출시일|스펙)$/u;

function hasRepeatedLiveCandidateToken(keyword: string): boolean {
  const tokens = normalizeKeyword(keyword)
    .split(/\s+/)
    .map((token) => token.replace(/[^\dA-Za-z가-힣]/g, '').trim())
    .filter((token) => token.length >= 2);
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key) && LOW_VALUE_REPEAT_TOKEN_RE.test(token)) return true;
    seen.add(key);
  }
  return false;
}

function compactLiveCandidate(keyword: string): string {
  return normalizeKeyword(keyword)
    .replace(/\s+/g, '')
    .replace(/[^\dA-Za-z가-힣]/g, '')
    .toLowerCase();
}

function liveCandidateTokens(keyword: string): string[] {
  return normalizeKeyword(keyword)
    .split(/\s+/)
    .map((token) => token.replace(/[^\dA-Za-z가-힣]/g, '').trim())
    .filter(Boolean);
}

function liveGenericIntentTokenCount(keyword: string): number {
  return liveCandidateTokens(keyword)
    .filter((token) => LIVE_GENERIC_INTENT_TOKEN_RE.test(token))
    .length;
}

function liveTrailingGenericIntentRun(keyword: string): number {
  const tokens = liveCandidateTokens(keyword);
  let count = 0;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (!LIVE_GENERIC_INTENT_TOKEN_RE.test(tokens[i])) break;
    count += 1;
  }
  return count;
}

function isOverExpandedLiveCandidate(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  if (isSyntheticNoEffectLiveProbe(clean)) return true;
  if (isMismatchedLiveEventIntent(clean)) return true;
  if (/관리급여/u.test(clean) || LOW_VALUE_POLICY_WORD_SALAD_RE.test(clean) || LOW_VALUE_SYNTHETIC_CHAIN_RE.test(clean) || LOW_VALUE_PERSON_COMMERCE_RE.test(clean)) return true;
  if (isOverChainedPolicyIntent(clean)) return true;
  if (LOW_VALUE_LIVE_COMPACT_CHAIN_RE.test(compactLiveCandidate(clean))) return true;
  if (hasRepeatedCompactIntentChain(clean)) return true;
  if (hasRepeatedLiveCandidateToken(clean)) return true;
  const fragmentCount = ultimateIntentFragmentCount(clean);
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  const genericTokenCount = liveGenericIntentTokenCount(clean);
  const trailingGenericRun = liveTrailingGenericIntentRun(clean);
  const policyOrBenefit = LIVE_POLICY_SIGNAL_RE.test(clean) || LIVE_FINANCE_SIGNAL_RE.test(clean);
  if (policyOrBenefit) {
    if (fragmentCount >= 5) return true;
    if (tokenCount >= 9 && fragmentCount >= 3) return true;
    return false;
  }
  const inferredCategory = inferLiveCategory(clean, 'live');
  const productSyntheticCategory = new Set(['shopping', 'electronics', 'fashion', 'beauty', 'home_life', 'it', 'game']).has(inferredCategory);
  if (productSyntheticCategory) {
    if (tokenCount >= 6 && fragmentCount >= 3) return true;
    if (genericTokenCount >= 3 && tokenCount >= 4) return true;
    if (trailingGenericRun >= 3 && tokenCount >= 4) return true;
    if (tokenCount >= 8 && fragmentCount >= 1) return true;
    return false;
  }
  if (fragmentCount >= 4) return true;
  if (tokenCount >= 7 && fragmentCount >= 3) return true;
  if (tokenCount >= 9 && fragmentCount >= 2) return true;
  return false;
}

function isCommerceIntentWithoutProductBase(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!PRODUCT_PURCHASE_INTENT_RE.test(clean)) return false;
  if (PRODUCT_BASE_SIGNAL_RE.test(clean)) return false;
  if (VENUE_TRAVEL_BASE_RE.test(clean)) return false;
  if (LIVE_POLICY_SIGNAL_RE.test(clean) || LIVE_FINANCE_SIGNAL_RE.test(clean)) return false;
  if (/(?:맛집|메뉴|카페|디저트|레시피|병원|검사|치료|보험|비용|수리|교체|청소|설정|오류|사용법)/u.test(clean)) return false;
  return true;
}

function keywordAlreadyHasIntent(keyword: string, intent: string): boolean {
  const key = normalizeKeyword(keyword).replace(/\s+/g, '').toLowerCase();
  const intentKey = normalizeKeyword(intent).replace(/\s+/g, '').toLowerCase();
  if (!intentKey) return false;
  if (key.includes(intentKey)) return true;
  const markers = [
    '신청',
    '대상',
    '자격',
    '조건',
    '지급일',
    '조회',
    '서류',
    '마감',
    '환급',
    '사용처',
    '금액',
    '일정',
    '방법',
    '가격',
    '비용',
    '비교',
    '추천',
    '후기',
    '할인',
    '쿠폰',
    '구매처',
    '최저가',
    '재고',
    '예약',
    '예매',
    '주차',
    '입장료',
    '준비물',
    '운영시간',
    '보험',
  ];
  return markers.some((marker) => intentKey.includes(marker) && key.includes(marker));
}

function appendCompatibleIntent(base: string, intent: string): string {
  const cleanBase = normalizeKeyword(base);
  let cleanIntent = normalizeKeyword(intent);
  if (!cleanBase || !cleanIntent) return '';
  const duplicateHeads = [
    '검사',
    '치료',
    '전기요금',
    '전기세',
    '소음',
    '흡입력',
    '배터리',
    '물걸레',
    '문턱',
    '필터',
    '세액공제',
    '수수료',
    '사용처',
    '지급일',
  ];
  for (const head of duplicateHeads) {
    if (cleanBase.includes(head)) {
      cleanIntent = cleanIntent.replace(new RegExp(`^${head}\\s*`, 'u'), '').trim();
    }
  }
  if (/치료제/u.test(cleanBase) && /^치료\s*/u.test(cleanIntent)) return '';
  if (!cleanIntent) return cleanBase;
  return keywordAlreadyHasIntent(cleanBase, cleanIntent) ? cleanBase : `${cleanBase} ${cleanIntent}`;
}

function ultimateNeedTemplatesForCategory(categoryId: string): string[] {
  const category = normalizeKeyword(categoryId);
  const categorySpecific = LIVE_ULTIMATE_CATEGORY_INTENTS[category];
  return uniqueKeywords(categorySpecific?.length ? [...categorySpecific] : [...LIVE_ULTIMATE_GENERAL_INTENTS], 18);
}

function normalizeUltimateSeedBase(seed: string): string {
  let clean = normalizeKeyword(seed)
    .replace(/[()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || (isLowValueLiveCandidate(clean) && !isSportsLiveEventSeed(clean))) return '';
  if (isGenericAudienceOnlyKeyword(clean)) return '';
  if (isOverExpandedLiveCandidate(clean)) return '';
  clean = clean
    .replace(/\s+(?:\uB300\uC0C1|\uD655\uB300|\uAC1C\uD3B8|\uC804\uBA74|\uAC1C\uC815|\uD589\uC815\uC608\uACE0)\s*$/u, '')
    .replace(/^(?:\uB41C|\uD55C|\uC81C\uAE30\uD55C)\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length >= 3 && clean.length <= 28 ? clean : '';
}

function buildUltimateNeedCandidatesForSeed(seed: string, categoryId: string, limit = 14): string[] {
  const base = normalizeUltimateSeedBase(seed);
  if (!base) return [];
  const inferred = inferLiveCategory(base, categoryId);
  const expandable = LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(inferred)
    || LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(normalizeKeyword(categoryId));
  const baseHasNeedIntent = hasLiveUltimateNeedIntent(base);
  if (baseHasNeedIntent && !expandable) return [base];
  if (!baseHasNeedIntent && !expandable) return [];
  if (baseHasNeedIntent && ['music', 'sports', 'broadcast', 'drama', 'movie'].includes(inferred)) return [base];
  if (baseHasNeedIntent && ultimateIntentFragmentCount(base) >= 2) return [base];
  const templates = ultimateNeedTemplatesForCategory(inferred || categoryId);
  const out: string[] = [];
  if (baseHasNeedIntent) out.push(base);
  for (const intent of templates) {
    if (out.length >= limit) break;
    if (!isUltimateIntentCompatible(base, intent, inferred || categoryId)) continue;
    const candidate = appendCompatibleIntent(base, intent);
    if (candidate) out.push(candidate);
  }
  return uniqueKeywords(out, limit)
    .filter((candidate) => hasLiveUltimateNeedIntent(candidate))
    .filter((candidate) => !isLowValueLiveCandidate(candidate))
    .filter((candidate) => !isOverExpandedLiveCandidate(candidate));
}

function writerReadyProbeIntentsForSeed(seed: string, categoryId: string): string[] {
  const clean = normalizeKeyword(seed);
  const category = normalizeKeyword(categoryId);
  const out: string[] = [];
  const push = (...items: string[]) => {
    for (const item of items) {
      const normalized = normalizeKeyword(item);
      if (normalized && !out.includes(normalized)) out.push(normalized);
    }
  };

  let scopedCalculatorIntent = false;
  if (/\uADFC\uBB34\uC2DC\uAC04\uACC4\uC0B0\uAE30/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uC77C\uC6A9\uC9C1', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (/\uC2DC\uAE09\uACC4\uC0B0\uAE30/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uC77C\uC6A9\uC9C1', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (/\uC8FC\uD734\uC218\uB2F9\uACC4\uC0B0\uAE30/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uC77C\uC6A9\uC9C1', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (/\uD1F4\uC9C1\uAE08\uACC4\uC0B0\uAE30/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uC77C\uC6A9\uC9C1', '\uC138\uD6C4\uACC4\uC0B0', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (/(?:\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30|4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30)/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uD504\uB9AC\uB79C\uC11C', '\uC77C\uC6A9\uC9C1', '\uC9C1\uC7A5\uC778', '\uC694\uC728\uD45C', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (/\uC2E4\uC5C5\uAE09\uC5EC\uACC4\uC0B0\uAE30/u.test(clean)) {
    scopedCalculatorIntent = true;
    push('\uC54C\uBC14', '\uC77C\uC6A9\uC9C1', '\uD1F4\uC0AC\uC790', '\uC790\uB3D9\uACC4\uC0B0');
  }
  if (!scopedCalculatorIntent && /(?:\uACC4\uC0B0\uAE30|\uBCF4\uD5D8|\uC2DC\uAE09|\uD1F4\uC9C1\uAE08|\uC8FC\uD734\uC218\uB2F9|\uC2E4\uC5C5\uAE09\uC5EC|4\uB300\uBCF4\uD5D8|\uC0AC\uB300\uBCF4\uD5D8)/u.test(clean)) {
    push(
      '\uC54C\uBC14',
      '\uD504\uB9AC\uB79C\uC11C',
      '\uC77C\uC6A9\uC9C1',
      '\uAC1C\uC778\uC0AC\uC5C5\uC790',
      '\uC2E4\uC218\uB839\uC561',
      '\uC790\uB3D9\uACC4\uC0B0',
      '\uC138\uD6C4\uACC4\uC0B0',
    );
  }
  if (/(?:\uC7A5\uB824\uAE08|\uC801\uAE08|\uC9C0\uC6D0\uAE08|\uD658\uAE09|\uAE09\uC5EC|\uCCAD\uB144|\uB300\uCD9C|\uBC14\uC6B0\uCC98|\uC138\uC561\uACF5\uC81C)/u.test(clean) || category === 'policy' || category === 'finance') {
    push(
      '\uC2E0\uCCAD',
      '\uB300\uC0C1',
      '\uC790\uACA9',
      '\uC9C0\uAE09\uC77C',
      '\uC18C\uB4DD\uAE30\uC900',
      '\uC870\uD68C',
      '\uC0AC\uC6A9\uCC98',
      '\uB9C8\uAC10\uC77C',
    );
  }
  if (/\uC644\uB0A9\uC99D\uBA85\uC11C/u.test(clean)) {
    push(
      '\uC870\uD68C',
      '\uBC1C\uAE09',
      '\uC778\uD130\uB137\uBC1C\uAE09',
      '\uC81C\uCD9C\uC11C\uB958',
    );
  }
  if (/(?:\uC5EC\uD589|\uBC14\uB2E4|\uD558\uB298\uAE38|\uCD95\uC81C|\uACF5\uC6D0|\uD56D\uACF5|\uD638\uD154|\uB80C\uD130\uCE74)/u.test(clean) || category === 'travel_domestic' || category === 'travel_overseas') {
    push(
      '\uC785\uC7A5\uB8CC',
      '\uC608\uC57D',
      '\uC608\uB9E4',
      '\uC8FC\uCC28',
      '\uC900\uBE44\uBB3C',
      '\uAC00\uACA9\uBE44\uAD50',
    );
  }
  if (/(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uCCAD\uC18C\uAE30|\uC138\uD0C1\uAE30|\uB0C9\uC7A5\uACE0|\uD0A4\uBCF4\uB4DC|\uC774\uC5B4\uD3F0|\uD734\uB300\uD3F0|\uC218\uB0A9\uD568|\uD544\uD130)/u.test(clean) || category === 'shopping' || category === 'electronics') {
    push(
      '\uAC00\uACA9\uBE44\uAD50',
      '\uCD5C\uC800\uAC00',
      '\uD6C4\uAE30',
      '\uAD6C\uB9E4\uCC98',
      '\uD560\uC778',
      '\uC6D0\uB8F8',
      '\uC804\uAE30\uC694\uAE08',
    );
  }
  push('\uC870\uD68C', '\uBC29\uBC95', '\uD6C4\uAE30');
  return uniqueKeywords(out, 14);
}

function buildWriterReadyProbeCandidatesForSeed(seed: string, categoryId: string, limit = 24): string[] {
  const base = normalizeUltimateSeedBase(seed) || normalizeKeyword(seed);
  if (!base) return [];
  const category = inferLiveCategory(base, categoryId || 'all');
  const baseVariants = uniqueKeywords([
    base,
    base.replace(/\s+/g, ''),
  ], 4).filter((candidate) => {
    const compactLength = candidate.replace(/\s+/g, '').length;
    return compactLength >= 3 && compactLength <= 22;
  });
  const out: string[] = [];
  for (const variant of baseVariants) {
    for (const intent of writerReadyProbeIntentsForSeed(variant, category)) {
      if (out.length >= limit) break;
      const candidate = appendCompatibleIntent(variant, intent);
      if (!candidate) continue;
      const compactLength = candidate.replace(/\s+/g, '').length;
      const tokenCount = candidate.split(/\s+/).filter(Boolean).length;
      if (compactLength > LIVE_SEARCHAD_CANDIDATE_MAX_CHARS || tokenCount > LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS) continue;
      if (!hasWriterReadyOpportunityIntent(candidate)) continue;
      const normalizedCandidate = normalizeKeyword(candidate);
      if (
        CERTIFICATE_PAYROLL_MISMATCH_RE.test(normalizedCandidate)
        || CALCULATOR_INTENT_MISMATCH_RE.test(normalizedCandidate)
        || CALCULATOR_LOW_INTENT_RE.test(normalizedCandidate)
      ) continue;
      if (isLowValueLiveCandidate(candidate) || isOverExpandedLiveCandidate(candidate)) continue;
      out.push(candidate);
    }
  }
  return uniqueKeywords(out, limit);
}

function buildSeedPhraseVariants(seed: string): string[] {
  const clean = normalizeKeyword(seed);
  if (!clean) return [];
  const mustKeepBenefitToken = BROAD_BENEFIT_PRODUCT_RE.test(clean);
  const tokens = clean
    .split(/\s+/)
    .map((token) => token.replace(/[^\dA-Za-z가-힣]/g, '').trim())
    .filter((token) => token.length > 0 && !ROBUST_STOP_TOKENS.has(token));
  const out: string[] = [clean];
  if (tokens.length >= 2) {
    for (let size = Math.min(5, tokens.length); size >= 2; size -= 1) {
      for (let start = 0; start + size <= tokens.length; start += 1) {
        out.push(tokens.slice(start, start + size).join(' '));
      }
    }
    out.push(tokens.slice(0, Math.min(4, tokens.length)).join(' '));
    out.push(tokens.slice(Math.max(0, tokens.length - 4)).join(' '));
  }
  const compact = clean.replace(/\s+/g, '');
  if (compact.length >= 4 && compact.length <= 18) out.push(compact);
  return uniqueKeywords(out, 14)
    .filter((keyword) => !mustKeepBenefitToken || BROAD_BENEFIT_PRODUCT_RE.test(keyword))
    .filter((keyword) => !isOverExpandedLiveCandidate(keyword))
    .filter((keyword) => !isNoisyLiveSeed(keyword))
    .filter((keyword) => !isThinProfileIntentKeyword(keyword));
}

function robustIntentTemplatesForSeed(seed: string, categoryId: string): string[] {
  const inferred = inferLiveCategory(seed, categoryId);
  const categoryIntents = ROBUST_CATEGORY_INTENTS[inferred]
    || ROBUST_CATEGORY_INTENTS[categoryId]
    || ROBUST_CATEGORY_INTENTS.live_issue;
  return uniqueKeywords([
    ...categoryIntents,
    ...ROBUST_GENERAL_INTENTS,
  ], 22).filter((intent) => isUltimateIntentCompatible(seed, intent, inferred || categoryId));
}

function buildRobustLiveSeedCandidates(
  categoryId: string,
  liveSeeds: string[],
  maxSeeds: number,
  now: Date = new Date(),
): string[] {
  const candidateLimit = Math.max(120, Math.min(1000, Math.floor(maxSeeds || 360)));
  const dateHints = getLiveDateHints(now);
  const rawLiveBases = liveSeeds
    .map((seed) => normalizeRobustLiveSeedBase(seed, now))
    .filter(Boolean);
  const bases = uniqueKeywords([
    ...rawLiveBases,
    ...normalizeLiveSeeds(liveSeeds, 100).map((seed) => normalizeLiveSeedForDate(seed, now)).filter(Boolean),
    ...rawLiveBases.flatMap((seed) => buildUltimateNeedCandidatesForSeed(seed, categoryId, 8)),
  ], 140);
  const candidates: string[] = [];
  const maxPerBase = Math.max(12, Math.floor(candidateLimit / Math.max(1, bases.length)) + 8);

  for (const base of bases) {
    if (candidates.length >= candidateLimit) break;
    const baseStartCount = candidates.length;
    const variants = buildSeedPhraseVariants(base);
    for (const variant of variants) {
      if (candidates.length >= candidateLimit) break;
      if (candidates.length - baseStartCount >= maxPerBase) break;
      const variantCategory = inferLiveCategory(variant, categoryId);
      const variantExpandable = LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(variantCategory)
        || LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(normalizeKeyword(categoryId));
      const variantHasNeedIntent = hasLiveUltimateNeedIntent(variant);
      if (!variantExpandable && variantHasNeedIntent) {
        candidates.push(variant);
        continue;
      }
      if (!variantExpandable && !variantHasNeedIntent) continue;
      if (ultimateIntentFragmentCount(variant) >= 2) {
        candidates.push(variant);
        continue;
      }
      const intents = robustIntentTemplatesForSeed(variant, categoryId);
      const seedAlreadySpecific = isActionableLiveKeyword(variant) || isRobustSpecificLiveKeyword(variant);
      const temporalHints = isRobustLottoKeyword(variant)
        ? []
        : dateHints.filter((hint) => !variant.includes(hint)).slice(0, seedAlreadySpecific ? 1 : 3);

      candidates.push(variant);
      for (const hint of temporalHints) {
        if (candidates.length - baseStartCount >= maxPerBase) break;
        candidates.push(`${hint} ${variant}`);
      }
      for (const intent of intents.slice(0, seedAlreadySpecific ? 6 : 14)) {
        if (candidates.length - baseStartCount >= maxPerBase) break;
        if (!keywordAlreadyHasIntent(variant, intent)) candidates.push(`${variant} ${intent}`);
        if (!seedAlreadySpecific) {
          for (const hint of temporalHints.slice(0, 1)) {
            if (candidates.length - baseStartCount >= maxPerBase) break;
            if (!variant.includes(hint) && !keywordAlreadyHasIntent(variant, intent)) {
              candidates.push(`${hint} ${variant} ${intent}`);
            }
          }
        }
      }
    }
  }

  return diversifyLiveCandidates(
    candidates.filter((candidate) => isLiveRadarUsableKeyword(candidate, null, null, now)),
    candidateLimit,
  );
}

function buildDateAwareLiveSeedCandidates(
  categoryId: string,
  liveSeeds: string[],
  maxSeeds: number,
  now: Date = new Date(),
): string[] {
  const candidateLimit = Math.max(80, Math.min(1000, Math.floor(maxSeeds || 240)));
  const dateHints = getLiveDateHints(now);
  const robustCandidates = buildRobustLiveSeedCandidates(categoryId, liveSeeds, maxSeeds, now);
  const liveSeedBases = normalizeLiveSeeds(liveSeeds, 60)
    .map((seed) => normalizeLiveSeedForDate(seed, now))
    .filter(Boolean);
  const candidates: string[] = [...robustCandidates];

  for (const seed of liveSeedBases) {
    if (candidates.length >= candidateLimit) break;
    const clean = normalizeKeyword(seed);
    if (!clean) continue;
    const intents = getLiveSeedBackfillIntents(clean, categoryId);
    const seedAlreadySpecific = isActionableLiveKeyword(clean)
      || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean)
      || isRobustSpecificLiveKeyword(clean);
    const inferredCategory = inferLiveCategory(clean, categoryId);
    const seedExpandable = LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(inferredCategory)
      || LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(normalizeKeyword(categoryId));
    const seedHasNeedIntent = hasLiveUltimateNeedIntent(clean);
    const temporalHints = LIVE_LOTTERY_SIGNAL_RE.test(clean) || isRobustLottoKeyword(clean)
      ? []
      : dateHints.filter((hint) => !clean.includes(hint)).slice(0, seedAlreadySpecific ? 1 : 3);

    candidates.push(clean);
    for (const hint of temporalHints) {
      candidates.push(`${hint} ${clean}`);
    }
    if (ultimateIntentFragmentCount(clean) >= 2) continue;
    if (!seedExpandable && seedHasNeedIntent) continue;
    if (!seedExpandable && !seedHasNeedIntent) continue;

    for (const intent of intents.slice(0, seedAlreadySpecific ? 3 : 8)) {
      if (!isUltimateIntentCompatible(clean, intent, inferredCategory || categoryId)) continue;
      if (!keywordAlreadyHasIntent(clean, intent)) candidates.push(`${clean} ${intent}`);
      for (const hint of temporalHints.slice(0, 1)) {
        if (!clean.includes(hint) && !keywordAlreadyHasIntent(clean, intent)) {
          candidates.push(`${hint} ${clean} ${intent}`);
        }
      }
    }

    if (inferredCategory === 'policy') candidates.push(`${clean} 신청 대상`, `${clean} 지급일 조회`);
    if (inferredCategory === 'sports') candidates.push(`${clean} 중계 일정`, `${clean} 예매 일정`);
    if (inferredCategory === 'life_tips' && (LIVE_LOTTERY_SIGNAL_RE.test(clean) || isRobustLottoKeyword(clean))) {
      candidates.push(`${clean} 당첨번호`, `${clean} 당첨지역`, `${clean} 판매점`);
    }
    if (LIVE_GENERAL_ISSUE_RE.test(clean)) {
      candidates.push(`${clean} 현재 상황`, `${clean} 정리`, `${clean} 이유`);
    }
  }

  return diversifyLiveCandidates(
    candidates.filter((candidate) => isLiveRadarUsableKeyword(candidate, null, null, now)),
    candidateLimit,
  );
}

const LIVE_MEASURED_PROBE_BASES: Record<string, readonly string[]> = Object.freeze({
  all: [
    '제주 렌터카',
    '제주 렌터카 완전자차',
    '제주 렌터카 보험',
    '무선청소기',
    '무선청소기 흡입력',
    '로봇청소기',
    '로봇청소기 물걸레',
    '도수치료',
    '도수치료 실비',
    'IRP',
    'IRP 세액공제',
    'ISA',
    'ISA 만기',
    '근로장려금',
    '프리랜서 근로장려금',
    '알바 근로장려금',
    '자녀장려금',
    '에너지바우처',
    '에너지바우처 잔액조회',
    '소상공인 정책자금',
    '소상공인 정책자금 직접대출',
    '창문형 에어컨',
    '창문형 에어컨 전기요금',
    '제습기',
    '제습기 전기요금',
    '청년미래적금',
    '청년미래적금 가입신청',
  ],
  policy: [
    '근로장려금',
    '프리랜서 근로장려금',
    '알바 근로장려금',
    '개인사업자 근로장려금',
    '근로장려금 반기',
    '자녀장려금',
    '자녀장려금 지급일',
    '에너지바우처',
    '에너지바우처 잔액조회',
    '청년미래적금',
    '청년미래적금 가입신청',
    '청년미래적금 소득기준',
    '육아휴직급여',
    '육아휴직급여 사후지급금',
    '부모급여',
    '실업급여',
    '실업급여 구직활동',
    '소상공인 정책자금',
    '소상공인 정책자금 직접대출',
    '소상공인 정책자금 대리대출',
    '여성청소년 생리용품 바우처',
    '국민내일배움카드',
    '국민내일배움카드 사용처',
    '청년도약계좌',
    '전기요금 복지할인',
    '임산부 교통비 지원',
  ],
  finance: [
    'IRP',
    'IRP 세액공제',
    'IRP 수수료',
    'ISA',
    'ISA 만기',
    'ISA 세액공제',
    '연금저축',
    '연금저축 세액공제',
    '퇴직연금',
    '주택청약',
    '자동차 보험',
    '자동차 보험 비교',
    '여행자보험',
    '여행자보험 비교',
    'ETF',
    '청년도약계좌',
    '청년미래적금',
  ],
  shopping: [
    '무선 에어건',
    '차량용 에어건',
    '세차 송풍기',
    '소형 제습기',
    '10리터 제습기',
    '창문형 에어컨',
    '이동식 에어컨',
    '음식물 처리기',
    '로봇청소기 물걸레',
    '공기청정기 필터',
    '빨래 쉰내 제거',
    '요석 제거제',
    '무선청소기',
    '무선청소기 흡입력',
    '무선청소기 배터리',
    '로봇청소기',
    '로봇청소기 물걸레',
    '로봇청소기 문턱',
    '제습기',
    '제습기 전기요금',
    '제습기 소음',
    '창문형 에어컨',
    '창문형 에어컨 전기요금',
    '창문형 에어컨 소음',
    '공기청정기 필터',
    '공기청정기 필터 교체',
    '선크림',
    '레인부츠',
    '여름 샌들',
    '장마 제습기',
    '장마 제습기 전기요금',
    '냉감패드',
    '써큘레이터',
    '써큘레이터 저소음',
    '무선 선풍기',
  ],
  electronics: [
    '무선 에어건',
    '차량용 에어건',
    '세차 송풍기',
    '소형 제습기',
    '10리터 제습기',
    '창문형 에어컨',
    '이동식 에어컨',
    '음식물 처리기',
    '로봇청소기 물걸레',
    '공기청정기 필터',
    '무선청소기',
    '무선청소기 흡입력',
    '무선청소기 배터리',
    '로봇청소기',
    '로봇청소기 물걸레',
    '로봇청소기 문턱',
    '제습기',
    '제습기 전기요금',
    '제습기 소음',
    '창문형 에어컨',
    '창문형 에어컨 전기요금',
    '창문형 에어컨 소음',
    '공기청정기 필터',
    '공기청정기 필터 교체',
    '노트북',
    '태블릿',
    '아이폰',
    '장마 제습기',
    '장마 제습기 전기요금',
    '써큘레이터',
    '써큘레이터 저소음',
    '무선 선풍기',
  ],
  travel_domestic: [
    '제주 렌터카',
    '제주 렌터카 완전자차',
    '제주 렌터카 보험',
    '제주 렌트카',
    '제주 렌트카 완전자차',
    '부산 렌터카',
    '강릉 숙소',
    '강릉 숙소 가족',
    '여수 숙소',
    '서울 근교 당일치기 여행',
    '제주 항공권',
    '제주 숙소',
    '제주 숙소 가족',
    '인천공항 주차',
    '인천공항 주차대행',
    '여름휴가 숙소',
  ],
  travel_overseas: [
    '일본 유심',
    '오사카 항공권',
    '도쿄 호텔',
    '베트남 유심',
    '다낭 항공권',
    '대만 환전',
    '일본 이심',
    '베트남 eSIM',
  ],
  health: [
    '도수치료',
    '도수치료 실비',
    '도수치료 보험',
    '치아보험',
    '치아보험 면책기간',
    '임플란트',
    '임플란트 보험',
    '탈모치료제',
    '비타민D 검사',
    '수면다원검사',
    '백일해 예방접종',
    '대상포진 예방접종',
  ],
  it: [
    'AI 영상툴',
    'AI 이미지 생성',
    '챗GPT 플러스',
    '노트북',
    '태블릿',
    'AI 회의록',
    'AI 자막 생성',
  ],
  education: [
    '국민내일배움카드',
    '국민내일배움카드 사용처',
    '한국사능력검정시험',
    '한국사능력검정시험 접수',
    '토익 시험',
    '토익 시험 접수',
    '컴활 1급',
    '컴활 1급 실기',
    '청년 국가기술자격 응시료',
  ],
  sports: [
    '테니스 라켓',
    '테니스 라켓 입문자',
    '골프채',
    '골프채 초보',
    '러닝화',
    '러닝화 족저근막염',
    '테니스 엘보 보호대',
  ],
});

const LIVE_MEASURED_PROBE_APEX_BASES: Record<string, readonly string[]> = Object.freeze({
  all: [
    '\uADFC\uB85C\uC7A5\uB824\uAE08 \uBC18\uAE30 \uC9C0\uAE09\uC77C',
    '\uC790\uB140\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C',
    '\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C \uAC08\uC544\uD0C0\uAE30',
    '\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98 \uC794\uC561\uC870\uD68C',
    '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC794\uC561\uC870\uD68C',
    '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC0AC\uC6A9\uCC98',
    '\uC804\uAE30\uC694\uAE08 \uBCF5\uC9C0\uD560\uC778 \uC2E0\uCCAD',
    '\uC2E4\uC5C5\uAE09\uC5EC \uAD6C\uC9C1\uD65C\uB3D9',
    '\uC2E4\uC5C5\uAE09\uC5EC \uC2E4\uC218\uB839\uC561',
    '\uD504\uB9AC\uB79C\uC11C \uC885\uD569\uC18C\uB4DD\uC138 \uD658\uAE09',
    '\uC18C\uC0C1\uACF5\uC778 \uD3D0\uC5C5\uC9C0\uC6D0\uAE08',
    '\uC18C\uC0C1\uACF5\uC778 \uC815\uCC45\uC790\uAE08 \uC9C1\uC811\uB300\uCD9C',
    '\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uC804\uAE30\uC694\uAE08',
    '\uC774\uB3D9\uC2DD\uC5D0\uC5B4\uCEE8 \uC18C\uC74C',
    '\uC81C\uC2B5\uAE30 \uC804\uAE30\uC694\uAE08',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB3C\uAC78\uB808',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB38\uD131',
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uBC30\uD130\uB9AC',
    '\uACF5\uAE30\uCCAD\uC815\uAE30 \uD544\uD130 \uAD50\uCCB4',
    '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30 \uB0C4\uC0C8',
    '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30 \uC804\uAE30\uC694\uAE08',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uBCF4\uD5D8',
    '\uC778\uCC9C\uACF5\uD56D \uC8FC\uCC28\uB300\uD589',
    '\uC5EC\uD589\uC790\uBCF4\uD5D8 \uBE44\uAD50',
    'IRP \uC138\uC561\uACF5\uC81C \uD55C\uB3C4',
    'ISA \uB9CC\uAE30 \uC218\uB839\uC561',
    '\uC8FC\uD0DD\uCCAD\uC57D \uB0A9\uC785\uC778\uC815\uC561',
    '\uC790\uB3D9\uCC28\uBCF4\uD5D8 \uB9C8\uC77C\uB9AC\uC9C0 \uD658\uAE09',
    '\uB3C4\uC218\uCE58\uB8CC \uC2E4\uBE44 \uCCAD\uAD6C',
    '\uCE58\uC544\uBCF4\uD5D8 \uBA74\uCC45\uAE30\uAC04',
    '\uC784\uD50C\uB780\uD2B8 \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9',
  ],
  policy: [
    '\uADFC\uB85C\uC7A5\uB824\uAE08 \uBC18\uAE30 \uC9C0\uAE09\uC77C',
    '\uC790\uB140\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C',
    '\uCCAD\uB144\uB3C4\uC57D\uACC4\uC88C \uAC08\uC544\uD0C0\uAE30',
    '\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98 \uC794\uC561\uC870\uD68C',
    '\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC \uC794\uC561\uC870\uD68C',
    '\uB18D\uC2DD\uD488\uBC14\uC6B0\uCC98 \uC0AC\uC6A9\uCC98',
    '\uC804\uAE30\uC694\uAE08 \uBCF5\uC9C0\uD560\uC778 \uC2E0\uCCAD',
    '\uC2E4\uC5C5\uAE09\uC5EC \uAD6C\uC9C1\uD65C\uB3D9',
    '\uC2E4\uC5C5\uAE09\uC5EC \uC2E4\uC218\uB839\uC561',
    '\uD504\uB9AC\uB79C\uC11C \uC885\uD569\uC18C\uB4DD\uC138 \uD658\uAE09',
    '\uC18C\uC0C1\uACF5\uC778 \uD3D0\uC5C5\uC9C0\uC6D0\uAE08',
    '\uC18C\uC0C1\uACF5\uC778 \uC815\uCC45\uC790\uAE08 \uC9C1\uC811\uB300\uCD9C',
  ],
  shopping: [
    '\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uC804\uAE30\uC694\uAE08',
    '\uC774\uB3D9\uC2DD\uC5D0\uC5B4\uCEE8 \uC18C\uC74C',
    '\uC81C\uC2B5\uAE30 \uC804\uAE30\uC694\uAE08',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB3C\uAC78\uB808',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB38\uD131',
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uBC30\uD130\uB9AC',
    '\uACF5\uAE30\uCCAD\uC815\uAE30 \uD544\uD130 \uAD50\uCCB4',
    '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30 \uB0C4\uC0C8',
    '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30 \uC804\uAE30\uC694\uAE08',
  ],
  electronics: [
    '\uCC3D\uBB38\uD615\uC5D0\uC5B4\uCEE8 \uC804\uAE30\uC694\uAE08',
    '\uC774\uB3D9\uC2DD\uC5D0\uC5B4\uCEE8 \uC18C\uC74C',
    '\uC81C\uC2B5\uAE30 \uC804\uAE30\uC694\uAE08',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB3C\uAC78\uB808',
    '\uB85C\uBD07\uCCAD\uC18C\uAE30 \uBB38\uD131',
    '\uBB34\uC120\uCCAD\uC18C\uAE30 \uBC30\uD130\uB9AC',
    '\uACF5\uAE30\uCCAD\uC815\uAE30 \uD544\uD130 \uAD50\uCCB4',
    '\uC74C\uC2DD\uBB3C\uCC98\uB9AC\uAE30 \uB0C4\uC0C8',
  ],
  travel_domestic: [
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uC644\uC804\uC790\uCC28',
    '\uC81C\uC8FC \uB80C\uD130\uCE74 \uBCF4\uD5D8',
    '\uC778\uCC9C\uACF5\uD56D \uC8FC\uCC28\uB300\uD589',
    '\uC5EC\uD589\uC790\uBCF4\uD5D8 \uBE44\uAD50',
  ],
  finance: [
    'IRP \uC138\uC561\uACF5\uC81C \uD55C\uB3C4',
    'ISA \uB9CC\uAE30 \uC218\uB839\uC561',
    '\uC8FC\uD0DD\uCCAD\uC57D \uB0A9\uC785\uC778\uC815\uC561',
    '\uC790\uB3D9\uCC28\uBCF4\uD5D8 \uB9C8\uC77C\uB9AC\uC9C0 \uD658\uAE09',
  ],
  health: [
    '\uB3C4\uC218\uCE58\uB8CC \uC2E4\uBE44 \uCCAD\uAD6C',
    '\uCE58\uC544\uBCF4\uD5D8 \uBA74\uCC45\uAE30\uAC04',
    '\uC784\uD50C\uB780\uD2B8 \uBCF4\uD5D8 \uC801\uC6A9 \uBE44\uC6A9',
  ],
});

const LIVE_MEASURED_PROBE_INTENTS: Record<string, readonly string[]> = Object.freeze({
  all: ['가격비교', '추천 후기', '최저가 비교', '예약 방법', '비용 비교', '조회 방법', '신청 대상', '신청 방법', '필요 서류'],
  policy: ['신청 대상', '신청 방법', '지급일 조회', '사용처 조회', '지원금 조건', '자격 조건', '필요 서류', '소득기준 계산', '마감일 확인'],
  finance: ['세액공제 한도', '수수료 비교', '금리 비교', '환급 조회', '조건 비교', '신청 방법', '만기 수령액', '해지 불이익'],
  shopping: ['가격비교', '최저가 비교', '추천 후기', '구매처 추천', '할인 쿠폰', '장단점', '전기요금 비교', '소음 비교', '설치 비용'],
  electronics: ['가격비교', '추천 후기', '최저가 비교', '구매처 추천', '스펙 비교', '전기요금 비교', '소음 비교', '설치 비용', '필터 교체 비용'],
  travel_domestic: ['가격비교', '예약 방법', '추천 후기', '주차 정보', '입장료', '숙소 예약', '당일치기 코스', '환불 규정', '픽업 장소'],
  travel_overseas: ['가격비교', '예약 방법', '추천 후기', '비자 서류', '환전 방법', '유심 추천', 'eSIM 설정', '수하물 규정'],
  health: ['보험 적용 비용', '검사 비용', '치료 비용', '후기', '주의사항', '실비 청구', '부작용', '예약 방법'],
  it: ['가격비교', '추천 후기', '사용법', '구독료', '요금제 비교', '무료 대안', '업무 자동화', '템플릿'],
  education: ['신청 방법', '시험 일정', '준비물', '응시료', '합격 기준', '접수 기간', '환불 규정'],
  sports: ['중계 일정', '경기 시간', '대표팀 명단', '라인업', '조편성', '대진표', '상대전적', '하이라이트'],
});

const LIVE_MEASURED_PROBE_DETAIL_MODIFIERS: Record<string, readonly string[]> = Object.freeze({
  policy: ['프리랜서', '알바', '개인사업자', '무직자', '맞벌이', '한부모', '대학생', '퇴사자'],
  finance: ['직장인', '개인사업자', '사회초년생', '퇴직자', '프리랜서'],
  shopping: ['1인가구', '원룸', '자취방', '장마철', '저소음', '소형', '가성비'],
  electronics: ['1인가구', '원룸', '자취방', '장마철', '저소음', '소형', '전기요금'],
  travel_domestic: ['아이랑', '가족', '뚜벅이', '당일치기', '주차'],
  travel_overseas: ['가족', '아이랑', '자유여행', '처음', '가성비'],
  education: ['직장인', '대학생', '초보', '국비지원'],
  it: ['개인사업자', '블로거', '초보', '무료'],
  sports: ['초보', '입문용', '여성', '어린이'],
});

const MEASURED_PROBE_STRONG_CONVERSION_INTENT_RE = /(?:가격비교|최저가|할인|쿠폰|구매처|전기요금|전기세|소음\s*비교|설치\s*비용|필터\s*교체|보험\s*적용\s*비용|치료\s*비용|검사\s*비용|실비\s*청구|세액공제\s*한도|수수료\s*비교|금리\s*비교|만기\s*수령액|해지\s*불이익|신청\s*(?:대상|방법)|지급일\s*조회|사용처\s*조회|지원금\s*조건|자격\s*조건|소득기준\s*계산|온라인\s*신청|잔액조회|가입신청|완전자차|면책기간)/u;
const MEASURED_PROBE_WEAK_INFO_INTENT_RE = /(?:추천\s*후기|숙소\s*예약|환불\s*규정|선택\s*가이드|코스\s*후기|축제\s*일정|운영시간|입장료)$/u;
const MEASURED_PROBE_FAMILY_STRIP_RE = /(?:가격비교|최저가\s*비교|비용\s*비교|추천\s*후기|예약\s*방법|숙소\s*예약|환불\s*규정|조회\s*방법|신청\s*(?:대상|방법)|지급일\s*조회|사용처\s*조회|지원금\s*조건|자격\s*조건|필요\s*서류|소득기준\s*계산|마감일\s*확인|온라인\s*신청|세액공제\s*한도|수수료\s*비교|금리\s*비교|만기\s*수령액|해지\s*불이익|보험\s*적용\s*비용|검사\s*비용|치료\s*비용|실비\s*청구|주의사항|부작용|전기요금\s*비교|소음\s*비교|설치\s*비용|필터\s*교체\s*비용|스펙\s*비교|구매처\s*추천|할인\s*쿠폰|장단점|가족|아이랑|뚜벅이|당일치기|주차|1인가구|원룸|자취방|장마철|저소음|소형|가성비|프리랜서|알바|개인사업자|무직자|맞벌이|한부모|대학생|퇴사자|직장인|사회초년생|퇴직자|초보|입문용|여성|어린이|처음|무료|블로거|국비지원)/gu;

const LIVE_MEASURED_PROBE_CATEGORY_COMPAT: Record<string, readonly string[]> = Object.freeze({
  shopping: ['electronics', 'fashion', 'beauty', 'sports'],
  electronics: ['shopping', 'it'],
  travel_domestic: [],
  travel_overseas: [],
  finance: [],
  policy: [],
});

const LIVE_GOLDEN_DEFAULT_PORTFOLIO_CATEGORY_KEYS = Object.freeze([
  'policy',
  'shopping',
  'electronics',
  'travel_domestic',
  'health',
  'finance',
  'education',
  'it',
  'sports',
] as const);

const LIVE_MEASURED_PROBE_SIGNAL_RE = /(?:가격비교|최저가|비교|추천|후기|예약|예매|비용|보험\s*적용|세액공제|수수료|금리|신청|대상|지급일|사용처|구매처|소득기준|가입신청|잔액조회|전기요금|전기세|소음|흡입력|배터리|물걸레|문턱|필터\s*교체|교체주기|완전자차|실비|면책기간|실기|접수|렌터카|렌트카|항공권|숙소|호텔|청소기|에어컨|제습기|공기청정기|중계|경기\s*일정|경기\s*시간|명단|라인업|엔트리|조편성|대진표|상대전적|ISA|IRP)/iu;
const LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_RE = /(?:라켓|골프채|러닝화|축구화|골프공|글러브|배트|유니폼|요가매트|덤벨)/u;
const LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_INTENTS = ['가격비교', '추천 후기', '최저가 비교', '구매처 추천', '스펙 비교'] as const;
const LIVE_MEASURED_PROBE_PRODUCT_INTENT_RE = /(?:가격비교|최저가|비교|추천|후기|구매처|할인|쿠폰|스펙)/u;
const LIVE_MEASURED_PROBE_EVENT_OR_POLICY_INTENT_RE = /(?:예약|예매|중계|라인업|경기|일정|입장료|주차|신청|지급일|자격|서류|환급|사용처|대상|조건|마감)/u;
const LIVE_MEASURED_PROBE_GENERIC_AUDIENCE_RE = /(?:청년\s*일반\s*국민|청년일반\s*국민|일반\s*국민|아동\s*장애인|아동장애인)/u;
const LIVE_MEASURED_PROBE_HEALTH_BASE_RE = /(?:도수치료|치아보험|임플란트|검사|예방접종|탈모치료)/u;
const LIVE_MEASURED_PROBE_HEALTH_POLICY_MIX_RE = /(?:관리급여|소득기준|지원금|마감일|온라인\s*신청|필요\s*서류).{0,12}(?:도수치료|치아보험|임플란트|검사|예방접종|탈모치료)|(?:도수치료|치아보험|임플란트|검사|예방접종|탈모치료).{0,12}(?:관리급여|소득기준|지원금|마감일|온라인\s*신청|필요\s*서류)/u;
const LIVE_MEASURED_PROBE_HEALTH_INTENT_RE = /(?:보험\s*적용\s*비용|검사\s*비용|치료\s*비용|실비\s*청구|주의사항|부작용)/u;
const LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE = /(?:완전자차|보험|실비|세액공제|수수료|금리|만기|반기|소득기준|가입신청|잔액조회|직접대출|대리대출|사후지급금|구직활동|사용처|지급일|면책기간|응시료|전기요금|전기세|흡입력|배터리|물걸레|문턱|소음|필터\s*교체|주차대행|가족|저소음|입문자|초보|족저근막염|실기|접수)/u;
const LIVE_MEASURED_PROBE_TERMINAL_BASE_RE = /(?:세액공제|수수료|만기|소득기준|가입신청|지급일|사용처|잔액조회|면책기간|실비|사후지급금|구직활동|실기|접수)/u;
const LIVE_MEASURED_PROBE_PORTFOLIO_ANCHOR_RE = /^(?:제주\s*렌터카|무선\s*청소기|청년미래적금|로봇\s*청소기\s*물걸레|(?:프리랜서|알바|개인사업자)\s*근로장려금)$/u;
const HOLIDAY_POLICY_TAIL_MISMATCH_RE = /(?:(?:제헌절|광복절|개천절|한글날|현충일|삼일절|설날|추석|부처님오신날|크리스마스|공휴일|대체공휴일).{0,14}(?:신청|신청방법|신청기간|자격|대상|지급일|사용처|소득기준|서류|필요서류|마감일|온라인\s*신청|지원금|수당|급여)|(?:신청|신청방법|신청기간|자격|대상|지급일|사용처|소득기준|서류|필요서류|마감일|온라인\s*신청|지원금|수당|급여).{0,14}(?:제헌절|광복절|개천절|한글날|현충일|삼일절|설날|추석|부처님오신날|크리스마스|공휴일|대체공휴일))/u;
const PRODUCT_RANKING_MAINTENANCE_CHAIN_RE = /(?:(?:순위|가성비|추천).{0,10}(?:필터\s*교체|교체주기|전기요금|전기세|소음\s*비교|설치\s*비용)|(?:필터\s*교체|교체주기|전기요금|전기세|소음\s*비교|설치\s*비용).{0,10}(?:순위|가성비|추천))/u;
const GENERIC_INTENT_ONLY_PROBE_RE = /^(?:추천|가격비교|최저가|후기|비교|순위|가성비)\s+(?:필터\s*교체주기|필터\s*교체|전기요금|전기세|소음|설치\s*비용)$/u;
const NEWS_PERSON_OR_ROLE_POLICY_TAIL_RE = /(?:(?:정책실장|장관|차관|대통령|시장|도지사|의원|후보|대표|회장|위원장|감독|선수|배우|가수|출연진|작가|PD|기자|앵커).{0,16}(?:신청\s*(?:대상|방법|조건)?|대상\s*조건|자격\s*조건|지급일\s*조회|사용처\s*(?:추천|조회)?|필요\s*서류|마감일\s*확인|지원금\s*조회)|(?:신청\s*(?:대상|방법|조건)?|대상\s*조건|자격\s*조건|지급일\s*조회|사용처\s*(?:추천|조회)?|필요\s*서류|마감일\s*확인|지원금\s*조회).{0,16}(?:정책실장|장관|차관|대통령|시장|도지사|의원|후보|대표|회장|위원장|감독|선수|배우|가수|출연진|작가|PD|기자|앵커))/u;
const POLICY_SYNTHETIC_DOUBLE_TAIL_RE = /(?:(?:신청|대상|자격|조건|지급일|사용처|정부기여금|이자|갈아타기).{0,10}(?:필요\s*서류|마감일\s*확인|사용처\s*추천|신청\s*(?:대상|방법|조건)|대상\s*조건|지급일\s*조회|장단점)|(?:필요\s*서류|마감일\s*확인|사용처\s*추천|신청\s*(?:대상|방법|조건)|대상\s*조건|지급일\s*조회|장단점).{0,10}(?:신청|대상|자격|조건|지급일|사용처|정부기여금|이자|갈아타기))/u;
const PRODUCT_ABSTRACT_STACKED_INTENT_RE = /(?:(?:가격|순위|가성비|추천|구매처|렌탈).{0,8}(?:저소음|설치비|설치\s*비용|1인가구|사이즈|필터|교체주기).{0,8}(?:후기|추천|비교|조회)|(?:저소음|설치비|설치\s*비용|1인가구|사이즈|필터|교체주기).{0,8}(?:가격|순위|가성비|추천|구매처|렌탈).{0,8}(?:후기|추천|비교|조회))/u;
const PRODUCT_DEAD_END_PURCHASE_TAIL_RE = /(?:구매처\s*추천|가격\s*저소음\s*후기|추천\s*저소음\s*후기|가성비\s*저소음\s*후기|순위\s*저소음\s*후기|추천\s*설치비\s*비교|가격\s*설치비\s*비교)/u;
const PRODUCT_GENERIC_STACK_TOKEN_RE = /(?:가격비교|최저가|구매처|할인|쿠폰|가성비|추천|후기|가격|순위|비교|렌탈|저소음|설치비|설치\s*비용|1인가구|사이즈|스펙|필터|교체주기)/gu;
const SPECIFIC_PRODUCT_BRAND_RE = /(?:위닉스|삼성|LG|엘지|다이슨|샤오미|쿠쿠|쿠첸|필립스|캐리어|파세코|신일|한일|보국|아이닉|로보락|에코백스|드리미|발뮤다|애플|아이폰|갤럭시|닌텐도|로지텍|브라운|오랄비|유닉스)/iu;
const TRAVEL_GENERIC_BOOKING_NO_EFFECT_RE = /(?:(?:서울\s*근교|여름|커플\s*여행지|당일치기|강원도\s*펜션|전주\s*한옥마을\s*맛집|여수\s*야경\s*명소|속초\s*설악산\s*코스|강릉\s*카페거리|국립\s*캠핑장\s*예약\s*사이트).{0,16}(?:예약\s*(?:방법|사이트)?|입장료|주차|운영시간|장단점|선택\s*가이드|코스\s*후기)|(?:예약\s*(?:방법|사이트)?|입장료|주차|운영시간|장단점|선택\s*가이드|코스\s*후기).{0,16}(?:서울\s*근교|여름|커플\s*여행지|당일치기|강원도\s*펜션|전주\s*한옥마을\s*맛집|여수\s*야경\s*명소|속초\s*설악산\s*코스|강릉\s*카페거리|국립\s*캠핑장\s*예약\s*사이트)|펜션\s*매매\s*예약|당일치기\s*(?:바다|드라이브|뚜벅이|계곡|바베큐)\s*예약)/u;
const TRAVEL_INTENT_MISMATCH_NO_EFFECT_RE = /(?:(?:렌터카|렌트카|렌탈카).{0,16}(?:입장료|운영시간|아이랑\s*코스|뚜벅이\s*코스|당일치기\s*준비물|코스\s*후기|준비물)|(?:입장료|운영시간|아이랑\s*코스|뚜벅이\s*코스|당일치기\s*준비물|코스\s*후기|준비물).{0,16}(?:렌터카|렌트카|렌탈카)|(?:감천문화마을|1박\s*2일\s*코스|다자녀\s*혜택|캠핑장\s*예약\s*사이트|펜션\s*추천|숙소\s*추천).{0,18}예약\s*방법|캠핑장\s*예약\s*사이트\s*(?:선택\s*가이드|아이랑\s*코스|뚜벅이\s*코스|코스\s*후기))/u;
const TRAVEL_LOW_CONVERSION_STACK_RE = /(?:(?:렌터카|렌트카|렌탈카).{0,16}(?:숙소\s*예약|환불\s*규정)|(?:서울|부산|강릉|여수|속초|경주|전주|대구|인천|대전|울산|청주)\s*렌(?:터|트)카\s*(?:예약\s*방법|추천\s*후기|예약\s*후기|렌트\s*비용|주말\s*예약|당일\s*예약|공항\s*예약)|(?:가족여행\s*추천지|등산\s*초보\s*코스|강원도\s*펜션\s*추천|반려견\s*동반\s*펜션).{0,18}(?:숙소\s*(?:예약|추천)|축제\s*일정)|(?:한옥마을\s*맛집|맛집).{0,12}(?:가격비교|최저가\s*비교))/u;
const POLICY_AUDIENCE_BASE_MISMATCH_RE = /(?:(?:개인사업자|사업자|소상공인|정책자금|대리대출|직접대출).{0,14}(?:프리랜서|무직자|알바|대학생|한부모|맞벌이)|(?:프리랜서|무직자|알바|대학생|한부모|맞벌이).{0,14}(?:개인사업자|사업자|소상공인|정책자금|대리대출|직접대출))/u;
const FINANCE_HEALTH_INTENT_MISMATCH_RE = /(?:\bETF\b.{0,14}(?:세액공제|신청\s*방법|만기\s*수령액|해지\s*불이익)|(?:프로바이오틱스|오메가3|코엔자임Q10).{0,16}(?:보험\s*적용|실비\s*청구|치료\s*비용|검사\s*비용))/iu;
const CACHE_DERIVED_CONTEXT_MISMATCH_RE = /(?:(?:가볼만한곳|카페거리|맛집|당일치기|관광|축제|수목원|전망대|해변|계곡).{0,18}(?:구매처\s*추천|최저가\s*비교|비용\s*비교|할인\s*쿠폰|아이랑\s*코스|뚜벅이\s*코스|당일치기\s*준비물)|(?:꿀팁|아웃백|하이디라오|훠궈).{0,18}(?:신청\s*(?:대상|방법)|지급일\s*조회|소득기준|필요\s*서류)|(?:구제신청|부당해고).{0,18}(?:최저가\s*비교|구매처\s*추천|할인\s*쿠폰|비용\s*비교|선택\s*가이드|1인\s*가구\s*추천|저소음\s*후기|필터\s*교체주기|전기요금\s*비교|전기세\s*비교|소음\s*비교|설치비\s*비교)|(?:후기|레인부츠|정리함|냉장고\s*(?:수납)?정리(?:함)?).{0,18}(?:필터\s*교체주기|전기요금\s*비교|전기세\s*비교|소음\s*비교|저소음\s*후기|설치비\s*비교)|청년도약계좌.{0,12}(?:해지|중도인출|만기).{0,12}(?:신청\s*대상|지급일\s*조회))/u;

const CALCULATOR_POLICY_TAIL_NO_EFFECT_RE = /(?:\uACC4\uC0B0\uAE30|\uACC4\uC0B0).{0,16}(?:\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD544\uC694\s*\uC11C\uB958|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC628\uB77C\uC778\s*\uC2E0\uCCAD|\uB9C8\uAC10\uC77C\s*\uD655\uC778)/u;
const LIVE_SEARCHAD_NO_RESULT_SHAPE_RE = /(?:(?:\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\s*\uC628\uB77C\uC778|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778)(?:\uAC00\uB9F9\uC810|\uC1FC\uD551\uBAB0|\uACB0\uC81C).{0,10}(?:\uC790\uACA9\s*\uC870\uAC74|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C)|\uC18C\uC0C1\uACF5\uC778(?:\uD3D0\uC5C5\uC9C0\uC6D0\uAE08\s*\uC2E0\uCCAD\s*\uBC29\uBC95|\uD3D0\uC5C5\uC9C0\uC6D0\uAE08|\uC815\uCC45\uC790\uAE08\uB300\uCD9C).{0,12}\uC18C\uB4DD\uAE30\uC900|\uACE0\uC6A9\uBCF4\uD5D8\s*\uC2E4\uC5C5\uAE09\uC5EC\s*\uACC4\uC0B0\uAE30.{0,16}(?:\uAC1C\uC778\uC0AC\uC5C5\uC790\s*\uACF5\uC81C\uD56D\uBAA9|\uD504\uB9AC\uB79C\uC11C\s*3\.3\s*\uC138\uAE08\s*\uACC4\uC0B0|\uC138\uD6C4\s*\uACC4\uC0B0|\uC790\uB3D9\uACC4\uC0B0)|\uC5F0\uCC28\uC218\uB2F9\s*\uACC4\uC0B0\uAE30.{0,12}(?:4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC)\s*\uC694\uC728\s*\uACC4\uC0B0|(?:20\d{2}\s*)?\uD3C9\uC0DD\uAD50\uC721\uBC14\uC6B0\uCC98.{0,8}\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC2DC\uC2A4\uD15C\uC5D0\uC5B4\uCEE8\s*\uBE44\uC6A9.{0,16}\uC6D0\uB8F8\s*\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50)/u;
const LIVE_SEARCHAD_NO_RESULT_SHAPE_EXTRA_RE = /(?:(?:\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\s*\uC628\uB77C\uC778|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778)(?:\uACB0\uC81C|\uAC00\uB9F9\uC810|\uC1FC\uD551\uBAB0)?.{0,12}(?:\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uC790\uACA9\s*\uC870\uAC74|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C)|(?:\uC0AC\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30|\uC5F0\uCC28\uC218\uB2F9\uACC4\uC0B0\uAE30|\uADFC\uB85C\uC7A5\uB824\uAE08\uACC4\uC0B0\uAE30?|\uAE30\uCD08\uC5F0\uAE08\uC218\uAE09\uC790\uACA9\uACC4\uC0B0).{0,12}(?:4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC)\s*\uC694\uC728\s*\uACC4\uC0B0|(?:\uC2E4\uC5C5\uAE09\uC5EC\uACC4\uC0B0\uAE30|\uC790\uC601\uC5C5\uC790\uC2E4\uC5C5\uAE09\uC5EC\uC2E0\uCCAD\uBC29\uBC95).{0,16}(?:\uAC1C\uC778\uC0AC\uC5C5\uC790\s*\uACF5\uC81C\uD56D\uBAA9|\uC790\uB3D9\uACC4\uC0B0|\uC138\uD6C4\s*\uACC4\uC0B0)|(?:\uC2DC\uC2A4\uD15C\uC5D0\uC5B4\uCEE8|\uBCBD\uAC78\uC774\uC5D0\uC5B4\uCEE8)\s*\uC124\uCE58\uBE44\uC6A9.{0,16}(?:\uC6D0\uB8F8\s*\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50|\uC790\uCDE8\uBC29\s*\uC18C\uC74C\s*\uBE44\uAD50)|\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98\s*\uC2E0\uCCAD\s*\uBC29\uBC95\s*\uBCF5\uC9C0\uB85C.{0,8}\uC18C\uB4DD\uAE30\uC900|\uAD6D\uC138\uCCAD\s*\uD648\uD14D\uC2A4\s*\uADFC\uB85C\uC7A5\uB824\uAE08.{0,8}\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC18C\uC0C1\uACF5\uC778\s*\uC9C0\uC6D0\uAE08.{0,18}(?:\uB193\uCE58\uAE30\s*\uC26C\uC6B4\s*\uBCC0\uACBD\uC0AC\uD56D|\uC18C\uB4DD\s*\uAE30\uC900\uACFC\s*\uC81C\uC678\s*\uB300\uC0C1))/u;
const LIVE_SEARCHAD_NO_RESULT_SHAPE_LIVE_RE = /(?:(?:4\uB300\uBCF4\uD5D8\uACC4\uC0B0\uAE30|\uAE30\uCD08\uC5F0\uAE08\uC218\uAE09\uC790\uACA9(?:\uBAA8\uC758)?\uACC4\uC0B0\uAE30?|\uD1F4\uC9C1\uAE08\uC9C0\uAE09\uAE30\uC900|\uC721\uC544\uD734\uC9C1\uAE09\uC5EC\s*\uACC4\uC0B0|\uADFC\uB85C\uC7A5\uB824\uAE08\uACC4\uC0B0\uAE30).{0,16}(?:4\uB300\uBCF4\uD5D8\uB8CC|\uC0AC\uB300\uBCF4\uD5D8\uB8CC)\s*\uC694\uC728\s*\uACC4\uC0B0|(?:\uC790\uC601\uC5C5\uC790\s*)?\uACE0\uC6A9\uBCF4\uD5D8\s*\uC2E4\uC5C5\uAE09\uC5EC.{0,18}(?:\uC790\uB3D9\uACC4\uC0B0|\uC138\uD6C4\s*\uACC4\uC0B0|\uAC1C\uC778\uC0AC\uC5C5\uC790\s*\uACF5\uC81C\uD56D\uBAA9|\uC77C\uC6A9\uC9C1\s*\uACC4\uC0B0\uBC29\uBC95)|(?:\uC790\uC601\uC5C5\uC790\s*)?\uACE0\uC6A9\uBCF4\uD5D8\s*\uC2E4\uC5C5\uAE09\uC5EC.{0,10}\uB9C8\uAC10\uC77C\s*\uD655\uC778|(?:\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\s*\uC628\uB77C\uC778|\uBB38\uD654\uB204\uB9AC\uCE74\uB4DC\uC628\uB77C\uC778)(?:\uACB0\uC81C|\uAC00\uB9F9\uC810|\uC1FC\uD551\uBAB0)?.{0,14}(?:\uCD5C\uC800\uAC00\s*\uBE44\uAD50|\uC120\uD0DD\s*\uAC00\uC774\uB4DC|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0)|(?:20\d{2}\s*)?(?:\uC5D0\uB108\uC9C0\uBC14\uC6B0\uCC98|\uCCAD\uB144\uC9C0\uC6D0\uAE08|\uAD50\uC721\uAE09\uC5EC\uBC14\uC6B0\uCC98|\uC18C\uC0C1\uACF5\uC778\s*\uC9C0\uC6D0\uAE08).{0,14}\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC18C\uC0C1\uACF5\uC778\s*\uC9C0\uC6D0\uAE08.{0,18}(?:\uC628\uB77C\uC778\s*\uC2E0\uCCAD\s*\uBC29\uBC95|\uC624\uB298\s*\uD655\uC778\uD560\s*\uC81C\uC678\s*\uB300\uC0C1)|\uADFC\uB85C\uC7A5\uB824\uAE08\s*\uC2E0\uCCAD\s*\uADFC\uB85C\uC7A5\uB824\uAE08\s*\uC2E0\uCCAD(?:\uB300\uC0C1|\uBB38\uC758|\uC548\uB0B4))/u;

function productGenericStackTokenCount(keyword: string): number {
  const hits = normalizeKeyword(keyword).match(PRODUCT_GENERIC_STACK_TOKEN_RE) || [];
  return new Set(hits.map((hit) => hit.replace(/\s+/g, ''))).size;
}

function isSyntheticNoEffectLiveProbe(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  return isSemanticallyMismatchedMeasuredProbe(clean)
    || HOLIDAY_POLICY_TAIL_MISMATCH_RE.test(clean)
    || isProductEventOrPromptTailMismatch(clean)
    || LOW_VALUE_ONLINE_SIGNUP_PROBE_RE.test(clean)
    || DUPLICATED_POLICY_TAIL_PROBE_RE.test(clean)
    || PRODUCT_RANKING_MAINTENANCE_CHAIN_RE.test(clean)
    || GENERIC_INTENT_ONLY_PROBE_RE.test(clean)
    || NEWS_PERSON_OR_ROLE_POLICY_TAIL_RE.test(clean)
    || (LIVE_POLICY_SIGNAL_RE.test(clean) && POLICY_SYNTHETIC_DOUBLE_TAIL_RE.test(clean))
    || TRAVEL_GENERIC_BOOKING_NO_EFFECT_RE.test(clean)
    || TRAVEL_INTENT_MISMATCH_NO_EFFECT_RE.test(clean)
    || TRAVEL_LOW_CONVERSION_STACK_RE.test(clean)
    || POLICY_AUDIENCE_BASE_MISMATCH_RE.test(clean)
    || FINANCE_HEALTH_INTENT_MISMATCH_RE.test(clean)
    || CACHE_DERIVED_CONTEXT_MISMATCH_RE.test(clean)
    || CALCULATOR_POLICY_TAIL_NO_EFFECT_RE.test(clean)
    || LIVE_SEARCHAD_NO_RESULT_SHAPE_RE.test(clean)
    || LIVE_SEARCHAD_NO_RESULT_SHAPE_EXTRA_RE.test(clean)
    || LIVE_SEARCHAD_NO_RESULT_SHAPE_LIVE_RE.test(clean)
    || (
      PRODUCT_BASE_SIGNAL_RE.test(clean)
      && (
        PRODUCT_ABSTRACT_STACKED_INTENT_RE.test(clean)
        || (!SPECIFIC_PRODUCT_BRAND_RE.test(clean) && PRODUCT_DEAD_END_PURCHASE_TAIL_RE.test(clean))
        || productGenericStackTokenCount(clean) >= 4
      )
    );
}

function categoryAcceptsMeasuredProbe(keyword: string, categoryId: string): boolean {
  const normalizedCategory = normalizeKeyword(categoryId || 'all');
  if (!normalizedCategory || normalizedCategory === 'all') return true;
  const inferred = inferLiveCategory(keyword, normalizedCategory);
  if (inferred === normalizedCategory) return true;
  const compatible = LIVE_MEASURED_PROBE_CATEGORY_COMPAT[normalizedCategory] || [];
  return compatible.includes(inferred);
}

function measuredProbeCategoryKeys(categoryId: string, liveSeeds: string[]): string[] {
  const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
  const inferredSeedCategories = liveSeeds
    .flatMap((seed) => {
      const clean = normalizeKeyword(seed);
      return [
        inferLiveCategory(clean, normalizedCategory),
        LIVE_MEASURED_PROBE_HEALTH_BASE_RE.test(clean) ? 'health' : '',
      ];
    })
    .filter(Boolean);
  const portfolioKeys = normalizedCategory === 'all'
    ? LIVE_GOLDEN_DEFAULT_PORTFOLIO_CATEGORY_KEYS
    : [];
  return uniqueKeywords([
    ...(normalizedCategory === 'all' ? ['all'] : []),
    normalizedCategory,
    ...portfolioKeys,
    ...inferredSeedCategories,
    ...(LIVE_MEASURED_PROBE_CATEGORY_COMPAT[normalizedCategory] || []),
  ], 16);
}

function measuredProbeIntentsForBase(base: string, key: string): readonly string[] {
  const cleanBase = normalizeKeyword(base);
  const normalizedKey = normalizeKeyword(key || 'all') || 'all';
  if (normalizedKey === 'sports') {
    if (isSportsLiveEventSeed(cleanBase)) return LIVE_MEASURED_PROBE_INTENTS.sports || [];
    if (LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_RE.test(cleanBase)) return LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_INTENTS;
    return [];
  }
  return LIVE_MEASURED_PROBE_INTENTS[normalizedKey] || [];
}

const TRUSTED_WRITER_READY_MEASURED_PROBE_RE = /(?:\uC2E4\uC218\uB839\uC561|\uC790\uB3D9\uACC4\uC0B0|\uC8FC\uD734\uC218\uB2F9\s*\uACC4\uC0B0|\uACC4\uC0B0\uBC29\uBC95|\uACF5\uC81C\uD56D\uBAA9|3\.3\s*\uC138\uAE08|\uC138\uD6C4\s*\uACC4\uC0B0|4\uB300\uBCF4\uD5D8\uB8CC\s*\uC694\uC728|\uC138\uAE08\s*\uACF5\uC81C|\uC694\uC728\uD45C|\uC5D1\uC140\s*\uC591\uC2DD|\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC628\uB77C\uC778\s*\uC2E0\uCCAD|\uD544\uC694\s*\uC11C\uB958|\uB9C8\uAC10\uC77C\s*\uD655\uC778|\uC18C\uB4DD\uAE30\uC900\s*\uACC4\uC0B0|\uAC00\uC785\uC2E0\uCCAD|\uC794\uC561\uC870\uD68C|\uC644\uC804\uC790\uCC28|\uBA74\uCC45\uAE30\uAC04|\uC2E4\uBE44\s*\uCCAD\uAD6C|\uC138\uC561\uACF5\uC81C\s*\uD55C\uB3C4|\uC218\uC218\uB8CC\s*\uBE44\uAD50|\uAE08\uB9AC\s*\uBE44\uAD50|\uB9CC\uAE30\s*\uC218\uB839\uC561|\uD574\uC9C0\s*\uBD88\uC774\uC775)/u;
const SEARCHAD_NEAR_SSS_PRACTICAL_INTENT_RE = /(?:\uC608\uC57D(?:\s*\uBC29\uBC95)?|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC6B4\uC601\uC2DC\uAC04|\uC0AC\uC6A9\uCC98\s*\uC870\uD68C|\uC9C0\uAE09\uC77C\s*\uC870\uD68C|\uD658\uAE09\uC77C|\uC2E0\uCCAD\s*(?:\uB300\uC0C1|\uBC29\uBC95)|\uC790\uACA9\s*\uC870\uAC74|\uD544\uC694\s*\uC11C\uB958|\uC2E4\uC218\uB839\uC561|\uC8FC\uD734\uC218\uB2F9\s*\uACC4\uC0B0|\uC77C\uC6A9\uC9C1\s*\uACC4\uC0B0\uBC29\uBC95|3\.3\s*\uC138\uAE08\s*\uACC4\uC0B0|\uD1F4\uC9C1\uAE08\s*\uC138\uD6C4\s*\uACC4\uC0B0|4\uB300\uBCF4\uD5D8\uB8CC\s*\uC694\uC728|\uCD5C\uC800\uAC00\s*\uBE44\uAD50|\uAD6C\uB9E4\uCC98\s*\uCD94\uCC9C|\uC6D0\uB8F8\s*\uC804\uAE30\uC694\uAE08\s*\uBE44\uAD50|\uC790\uCDE8\uBC29\s*\uC18C\uC74C\s*\uBE44\uAD50|\uC800\uC18C\uC74C\s*\uD6C4\uAE30|\uD560\uC778\s*\uCFE0\uD3F0|\uC124\uCE58\uBE44\s*\uBE44\uAD50)/u;
const MEASURED_PROBE_QUEUE_FAMILY_STRIP_RE = /(?:\uC608\uC57D|\uBC29\uBC95|\uC704\uCE58|\uC7A5\uB2E8\uC810|\uC8FC\uCC28|\uC544\uC774\uB791\s*\uCF54\uC2A4|\uB69C\uBC85\uC774\s*\uCF54\uC2A4|\uB2F9\uC77C\uCE58\uAE30|\uC900\uBE44\uBB3C|\uC785\uC7A5\uB8CC|\uC6B4\uC601\uC2DC\uAC04|\uC0AC\uC6A9\uCC98|\uC870\uD68C|\uC2E0\uCCAD|\uB300\uC0C1|\uC790\uACA9|\uC870\uAC74|\uC9C0\uAE09\uC77C|\uD658\uAE09\uC77C|\uD544\uC694\s*\uC11C\uB958|\uC18C\uB4DD\uAE30\uC900|\uBE44\uAD50|\uCD5C\uC800\uAC00|\uAD6C\uB9E4\uCC98|\uCD94\uCC9C|\uD6C4\uAE30|\uC6D0\uB8F8|\uC804\uAE30\uC694\uAE08|\uC790\uCDE8\uBC29|\uC18C\uC74C|\uC800\uC18C\uC74C|\uC77C\uC6A9\uC9C1|\uC54C\uBC14|\uACC4\uC0B0\uBC29\uBC95|\uACC4\uC0B0|\uC2E4\uC218\uB839\uC561|\uC8FC\uD734\uC218\uB2F9|\uD1F4\uC9C1\uAE08|\uC138\uD6C4|\uC138\uAE08|\uC694\uC728|\uCFE0\uD3F0|\uD560\uC778|\uC124\uCE58\uBE44)/gu;

function measuredProbeQueueFamilyKey(keyword: string): string {
  const calculatorRoot = normalizeKeyword(keyword).match(/([0-9A-Za-z\uAC00-\uD7A3]{2,}?\uACC4\uC0B0\uAE30)/u)?.[1];
  if (calculatorRoot) return keywordCompactId(calculatorRoot);
  const compact = keywordCompactId(
    normalizeKeyword(keyword)
      .replace(SEARCHAD_NEAR_SSS_PRACTICAL_INTENT_RE, ' ')
      .replace(MEASURED_PROBE_QUEUE_FAMILY_STRIP_RE, ' '),
  );
  const family = compact.length >= 4 ? compact.slice(0, 18) : liveCandidateDiversityKey(keyword);
  return family;
}

function measuredProbeEffectiveCategory(item: Pick<LiveMeasuredProbeQueueItem, 'keyword' | 'category'>, fallbackCategory: string): string {
  const fallback = normalizeKeyword(item.category) || normalizeKeyword(fallbackCategory) || 'all';
  return inferLiveCategory(item.keyword, fallback) || fallback;
}

function measuredProbeQueueEffectiveScore(item: LiveMeasuredProbeQueueItem): number {
  return item.priority - item.attempts * 45 - item.misses * 90;
}

function trimMeasuredProbeQueueFamilyFlood(
  items: LiveMeasuredProbeQueueItem[],
  maxPerFamily = LIVE_PROBE_QUEUE_FAMILY_MAX_ITEMS,
): LiveMeasuredProbeQueueItem[] {
  const counts = new Map<string, number>();
  const trimmed: LiveMeasuredProbeQueueItem[] = [];
  for (const item of items) {
    const family = measuredProbeQueueFamilyKey(item.keyword);
    const count = counts.get(family) || 0;
    if (count >= maxPerFamily) continue;
    counts.set(family, count + 1);
    trimmed.push(item);
  }
  return trimmed;
}

function measuredProbeQueueCategoryKey(item: LiveMeasuredProbeQueueItem): string {
  return normalizeKeyword(item.category) || inferLiveCategory(item.keyword, 'all') || 'all';
}

function selectDiverseMeasuredProbeQueueItems(
  sorted: LiveMeasuredProbeQueueItem[],
  limit: number,
): LiveMeasuredProbeQueueItem[] {
  const target = Math.max(1, Math.floor(limit));
  const selected: LiveMeasuredProbeQueueItem[] = [];
  const selectedCompacts = new Set<string>();
  const familyOrder: string[] = [];
  const familyGroups = new Map<string, LiveMeasuredProbeQueueItem[]>();
  const categoryCounts = new Map<string, number>();
  const maxPerCategory = Math.max(8, Math.ceil(target * LIVE_PROBE_QUEUE_CATEGORY_SHARE_CAP));

  for (const item of sorted) {
    const compact = keywordCompactId(item.keyword);
    if (!compact || selectedCompacts.has(compact)) continue;
    const family = measuredProbeQueueFamilyKey(item.keyword);
    if (!familyGroups.has(family)) {
      familyGroups.set(family, []);
      familyOrder.push(family);
    }
    familyGroups.get(family)?.push(item);
  }

  const push = (item: LiveMeasuredProbeQueueItem, respectCategory: boolean): boolean => {
    if (selected.length >= target) return false;
    const compact = keywordCompactId(item.keyword);
    if (!compact || selectedCompacts.has(compact)) return false;
    const category = measuredProbeQueueCategoryKey(item);
    if (respectCategory && (categoryCounts.get(category) || 0) >= maxPerCategory) return false;
    selected.push(item);
    selectedCompacts.add(compact);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    return true;
  };

  const roundRobin = (respectCategory: boolean): void => {
    for (let depth = 0; selected.length < target; depth += 1) {
      let added = false;
      for (const family of familyOrder) {
        if (selected.length >= target) break;
        const item = familyGroups.get(family)?.[depth];
        if (!item) continue;
        added = push(item, respectCategory) || added;
      }
      if (!added) break;
    }
  };

  roundRobin(true);
  roundRobin(false);
  return selected.slice(0, target);
}

const SEARCHAD_PROBE_VARIANT_TRAILING_INTENT_RE = /(?:\s+(?:\uBC29\uBC95|\uC870\uD68C|\uD655\uC778|\uC815\uB9AC|\uCD94\uCC9C|\uBE44\uAD50))$/u;

function searchAdProbeMeasurementVariants(keyword: string): string[] {
  const clean = normalizeKeyword(keyword);
  if (!clean) return [];
  const variants: string[] = [clean];
  const compact = clean.replace(/\s+/g, '');
  if (compact !== clean && /[\uAC00-\uD7A3]/u.test(clean)) variants.push(compact);
  const trimmed = normalizeKeyword(clean.replace(SEARCHAD_PROBE_VARIANT_TRAILING_INTENT_RE, ''));
  if (trimmed && trimmed !== clean && keywordCompactId(trimmed) !== keywordCompactId(clean)) {
    variants.push(trimmed);
    const trimmedCompact = trimmed.replace(/\s+/g, '');
    if (trimmedCompact !== trimmed && /[\uAC00-\uD7A3]/u.test(trimmed)) variants.push(trimmedCompact);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const variant of variants) {
    const exact = normalizeKeyword(variant);
    if (!exact || seen.has(exact)) continue;
    const compactLength = exact.replace(/\s+/g, '').length;
    const tokenCount = exact.split(/\s+/).filter(Boolean).length;
    if (
      compactLength >= LIVE_SEARCHAD_CANDIDATE_MIN_CHARS
      && compactLength <= LIVE_SEARCHAD_CANDIDATE_MAX_CHARS
      && tokenCount <= LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS
    ) {
      seen.add(exact);
      out.push(exact);
    }
  }
  return out.slice(0, 4);
}

function isTrustedWriterReadyMeasuredProbe(keyword: string, categoryId: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || !TRUSTED_WRITER_READY_MEASURED_PROBE_RE.test(clean)) return false;
  if (isSyntheticNoEffectLiveProbe(clean) || isWeakAutogeneratedProbeCombo(clean)) return false;
  if (isGenericAudienceOnlyKeyword(clean) || LIVE_MEASURED_PROBE_GENERIC_AUDIENCE_RE.test(clean)) return false;
  const inferred = inferLiveCategory(clean, categoryId || 'all');
  const hasTrustedBase = CACHE_DERIVED_CALCULATOR_RE.test(clean)
    || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || SEARCHAD_FINANCE_BASE_RE.test(clean)
    || LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)
    || LIVE_POLICY_SIGNAL_RE.test(clean)
    || LIVE_FINANCE_SIGNAL_RE.test(clean);
  if (!hasTrustedBase) return false;
  return keywordLongTailScore(clean) >= 18
    || ultimateIntentFragmentCount(clean) >= 2
    || inferred === 'policy'
    || inferred === 'finance';
}

function isLiveMeasuredProbeCandidate(keyword: string, categoryId: string, now: Date = new Date()): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (isSyntheticNoEffectLiveProbe(clean)) return false;
  if (isWeakAutogeneratedProbeCombo(clean)) return false;
  const trustedWriterReady = isTrustedWriterReadyMeasuredProbe(clean, categoryId);
  if (!trustedWriterReady && !LIVE_MEASURED_PROBE_SIGNAL_RE.test(clean)) return false;
  if (LIVE_MEASURED_PROBE_HEALTH_POLICY_MIX_RE.test(clean)) return false;
  if (ultimateIntentFragmentCount(clean) > (trustedWriterReady ? 3 : 2)) return false;
  if (isGenericAudienceOnlyKeyword(clean)) return false;
  if (LIVE_MEASURED_PROBE_GENERIC_AUDIENCE_RE.test(clean)) return false;
  if (!trustedWriterReady && !categoryAcceptsMeasuredProbe(clean, categoryId)) return false;
  return isSearchAdMeasurableLiveCandidate(clean, categoryId, now);
}

function isMeasuredProbeIntentCompatible(base: string, intent: string, categoryId: string): boolean {
  const cleanBase = normalizeKeyword(base);
  const cleanIntent = normalizeKeyword(intent);
  if (!cleanBase || !cleanIntent) return false;
  const inferred = inferLiveCategory(cleanBase, categoryId);
  if (isSemanticallyMismatchedMeasuredProbe(`${cleanBase} ${cleanIntent}`)) return false;
  if (/\bETF\b/iu.test(cleanBase) && /(?:세액공제|신청\s*방법|만기\s*수령액|해지\s*불이익)/u.test(cleanIntent)) return false;
  if (['policy', 'finance'].includes(inferred) && /(?:예약|예매|주차|입장료|숙소|호텔|픽업|환불\s*규정)/u.test(cleanIntent)) return false;
  if (inferred === 'finance' && /(?:신청\s*대상|필요\s*서류|온라인\s*신청)/u.test(cleanIntent) && !/청년|청약|대출|보험/u.test(cleanBase)) return false;
  if (/청소기/u.test(cleanBase) && /(?:전기요금|전기세|설치\s*비용)/u.test(cleanIntent)) return false;
  if (/공기청정기\s*필터/u.test(cleanBase) && /(?:전기요금|전기세|소음|설치\s*비용)/u.test(cleanIntent)) return false;
  if (/필터\s*교체/u.test(cleanBase) && /(?:전기요금|전기세|소음|설치\s*비용)/u.test(cleanIntent)) return false;
  if (/(?:전기요금|전기세|소음)/u.test(cleanBase) && /(?:가격비교|최저가|구매처|할인|쿠폰|추천\s*후기|비용\s*비교)/u.test(cleanIntent)) return false;
  if (/(?:흡입력|배터리|물걸레|문턱)/u.test(cleanBase) && /(?:전기요금|전기세|소음|비용\s*비교)/u.test(cleanIntent)) return false;
  if (/저소음/u.test(cleanBase) && !LIVE_MEASURED_PROBE_PRODUCT_INTENT_RE.test(cleanIntent)) return false;
  if (LIVE_MEASURED_PROBE_HEALTH_POLICY_MIX_RE.test(`${cleanBase} ${cleanIntent}`)) return false;
  if (/도수치료|치료제/u.test(cleanBase) && /검사\s*비용/u.test(cleanIntent)) return false;
  if (inferred === 'health' && !LIVE_MEASURED_PROBE_HEALTH_INTENT_RE.test(cleanIntent)) return false;
  if (
    inferred === 'health'
    && !LIVE_MEASURED_PROBE_HEALTH_BASE_RE.test(cleanBase)
    && /(?:보험\s*적용|실비|치료\s*비용|검사\s*비용)/u.test(cleanIntent)
  ) return false;
  if (/도수치료|치아보험|임플란트|검사|예방접종|탈모치료/u.test(cleanBase) && /(?:예약\s*방법|추천\s*후기)/u.test(cleanIntent)) return false;
  if (LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_RE.test(cleanBase)) {
    return LIVE_MEASURED_PROBE_PRODUCT_INTENT_RE.test(cleanIntent)
      && !LIVE_MEASURED_PROBE_EVENT_OR_POLICY_INTENT_RE.test(cleanIntent);
  }
  const productLike = PRODUCT_BASE_SIGNAL_RE.test(cleanBase);
  const policyOrFinanceOrTravel = ['policy', 'finance', 'travel_domestic', 'travel_overseas', 'health'].includes(inferred);
  if (productLike && !policyOrFinanceOrTravel) {
    return LIVE_MEASURED_PROBE_PRODUCT_INTENT_RE.test(cleanIntent)
      && !LIVE_MEASURED_PROBE_EVENT_OR_POLICY_INTENT_RE.test(cleanIntent);
  }
  return true;
}

function measuredProbeDetailModifiersForBase(base: string, categoryId: string): string[] {
  const clean = normalizeKeyword(base);
  if (!clean || hasWriterReadySpecificity(clean) || ultimateIntentFragmentCount(clean) >= 2) return [];
  const inferred = inferLiveCategory(clean, categoryId);
  if (inferred === 'sports' && isSportsLiveEventSeed(clean)) return [];
  if (inferred === 'policy') {
    if (/(?:\uC18C\uC0C1\uACF5\uC778|\uC815\uCC45\uC790\uAE08|\uC9C1\uC811\uB300\uCD9C|\uB300\uB9AC\uB300\uCD9C)/u.test(clean)) return ['개인사업자'];
    if (/(?:\uC2E4\uC5C5\uAE09\uC5EC|\uAD6C\uC9C1\uD65C\uB3D9)/u.test(clean)) return ['퇴사자', '알바'];
    if (/(?:\uADFC\uB85C\uC7A5\uB824\uAE08|\uC790\uB140\uC7A5\uB824\uAE08)/u.test(clean)) {
      return ['프리랜서', '알바', '개인사업자', '무직자', '맞벌이'];
    }
  }
  const modifiers = LIVE_MEASURED_PROBE_DETAIL_MODIFIERS[inferred]
    || LIVE_MEASURED_PROBE_DETAIL_MODIFIERS[normalizeKeyword(categoryId)]
    || [];
  return modifiers.filter((modifier) => !keywordAlreadyHasIntent(clean, modifier)).slice(0, 5);
}

function buildMeasuredProbeDetailCandidates(base: string, intent: string, categoryId: string): string[] {
  const cleanBase = normalizeKeyword(base);
  const cleanIntent = normalizeKeyword(intent);
  if (!cleanBase || !cleanIntent) return [];
  return uniqueKeywords(
    measuredProbeDetailModifiersForBase(cleanBase, categoryId)
      .map((modifier) => appendCompatibleIntent(`${cleanBase} ${modifier}`, cleanIntent))
      .filter(Boolean),
    5,
  );
}

function measuredProbeIntentPriority(intent: string, categoryId: string): number {
  const cleanIntent = normalizeKeyword(intent);
  const category = normalizeKeyword(categoryId || 'all') || 'all';
  let score = 0;
  if (MEASURED_PROBE_STRONG_CONVERSION_INTENT_RE.test(cleanIntent)) score += 100;
  if (MEASURED_PROBE_WEAK_INFO_INTENT_RE.test(cleanIntent)) score -= 90;
  if ((category === 'shopping' || category === 'electronics') && /(?:가격|최저가|할인|쿠폰|구매처|소음|전기요금|스펙)/u.test(cleanIntent)) score += 45;
  if ((category === 'policy' || category === 'finance') && /(?:신청|지급일|사용처|소득기준|세액공제|수수료|금리|만기|해지|잔액조회)/u.test(cleanIntent)) score += 45;
  if (/^추천\s*후기$/u.test(cleanIntent) && (category === 'travel_domestic' || category === 'travel_overseas')) score -= 60;
  return score;
}

function measuredProbeFamilyKey(keyword: string): string {
  const clean = normalizeKeyword(keyword)
    .replace(/렌트카|렌탈카/gu, '렌터카')
    .replace(/완전자차|보험/gu, ' ');
  if (!clean) return '';
  const stripped = normalizeKeyword(clean.replace(MEASURED_PROBE_FAMILY_STRIP_RE, ' '));
  const compact = stripped
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/gi, '');
  if (/제주렌터카/u.test(compact)) return '제주렌터카';
  return (compact || keywordClusterKey(clean)).slice(0, 18);
}

function measuredProbePreMeasurePriority(keyword: string): number {
  const clean = normalizeKeyword(keyword);
  if (!clean) return -999;
  const inferred = inferLiveCategory(clean, 'all');
  let score = preVolumeCandidateScore(clean, inferred || 'all')
    + livePromotionPriorityBonus(clean, inferred || 'all');
  score += writerReadySssProbePriorityScore(clean, inferred || 'all');
  if (MEASURED_PROBE_STRONG_CONVERSION_INTENT_RE.test(clean)) score += 160;
  if (hasWriterReadySpecificity(clean)) score += 80;
  if (/완전자차.{0,8}가격비교|보험.{0,8}가격비교|실비.{0,8}청구|세액공제.{0,8}한도|소득기준.{0,8}계산/u.test(clean)) score += 140;
  if (MEASURED_PROBE_WEAK_INFO_INTENT_RE.test(clean)) score -= 120;
  return score;
}

function writerReadySssProbePriorityScore(keyword: string, categoryId: string): number {
  const clean = normalizeKeyword(keyword);
  if (!clean) return -999;
  if (isWeakAutogeneratedProbeCombo(clean) || isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean)) return -999;
  if (isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean) || isBrandSafetyNewsKeyword(clean)) return -999;
  const category = inferLiveCategory(clean, categoryId || 'all');
  if (LIVE_PROMOTION_LOW_VALUE_CATEGORIES.has(category) && !isActionableSportsLiveEventKeyword(clean)) return -260;
  const longTail = keywordLongTailScore(clean);
  const intentFragments = ultimateIntentFragmentCount(clean);
  let score = 0;
  if (MEASURED_PROBE_STRONG_CONVERSION_INTENT_RE.test(clean)) score += 260;
  if (TRUSTED_WRITER_READY_MEASURED_PROBE_RE.test(clean)) score += 230;
  if (hasWriterReadySpecificity(clean)) score += 210;
  if (hasSssReadyNeedIntent(clean)) score += 150;
  if (hasHighValueNeedIntent(clean) || hasAdsenseNeedIntent(clean)) score += 140;
  if (intentFragments >= 2) score += 120;
  else if (intentFragments === 1) score += 50;
  if (longTail >= 24) score += 110;
  else if (longTail >= 18) score += 80;
  else if (longTail >= 12) score += 45;
  if (LIVE_PROMOTION_STRATEGIC_CATEGORIES.has(category)) score += 80;
  if (isBroadHeadSssKeyword(clean)) score -= 360;
  if (isOverbroadNoEffectBoardKeyword({
    keyword: clean,
    totalSearchVolume: 30_000,
    documentCount: 8_000,
    goldenRatio: 3,
    grade: 'S',
  })) {
    score -= 180;
  }
  return score;
}

function diversifyMeasuredProbeCandidates(values: string[], limit: number): string[] {
  const unique = uniqueKeywords(values, limit * 3)
    .map((keyword, index) => ({ keyword, index }))
    .sort((a, b) => (
      measuredProbePreMeasurePriority(b.keyword) - measuredProbePreMeasurePriority(a.keyword)
      || a.index - b.index
    ))
    .map((entry) => entry.keyword);
  const selected: string[] = [];
  const counts = new Map<string, number>();
  const pushWithCap = (cap: number): void => {
    for (const keyword of unique) {
      if (selected.length >= limit) return;
      if (selected.some((item) => keywordCompactId(item) === keywordCompactId(keyword))) continue;
      const family = measuredProbeFamilyKey(keyword);
      const count = counts.get(family) || 0;
      if (count >= cap) continue;
      counts.set(family, count + 1);
      selected.push(keyword);
    }
  };
  pushWithCap(8);
  pushWithCap(14);
  pushWithCap(limit);
  return selected.slice(0, limit);
}

function shouldMeasureProbeBaseDirectly(base: string, categoryId: string): boolean {
  const clean = normalizeKeyword(base);
  if (!clean) return false;
  const fragments = ultimateIntentFragmentCount(clean);
  if (fragments >= 2) return true;
  if (LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)) return true;
  const category = inferLiveCategory(clean, categoryId);
  if (PRODUCT_BASE_SIGNAL_RE.test(clean) || TRAVEL_PURCHASE_BASE_RE.test(clean)) return false;
  if (LIVE_POLICY_SIGNAL_RE.test(clean) || LIVE_FINANCE_SIGNAL_RE.test(clean) || BROAD_BENEFIT_PRODUCT_RE.test(clean)) return false;
  if (LIVE_MEASURED_PROBE_SPORTS_EQUIPMENT_RE.test(clean)) return false;
  return fragments >= 1 && keywordLongTailScore(clean) >= 18 && category !== 'all';
}

function isMeasuredDirectNeedBase(base: string, categoryId: string): boolean {
  const clean = normalizeKeyword(base);
  if (!clean) return false;
  if (isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean) || isNoisyLiveSeed(clean)) return false;
  if (isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean) || isBrandSafetyNewsKeyword(clean)) return false;
  if (isMalformedLiveKeyword(clean) || isSyntheticNoEffectLiveProbe(clean) || isWeakAutogeneratedProbeCombo(clean)) return false;
  const category = inferLiveCategory(clean, categoryId || 'all');
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  if (compactLength < LIVE_SEARCHAD_CANDIDATE_MIN_CHARS || compactLength > 24 || tokenCount > 4) return false;
  const directNeed = /(?:\uAC08\uC544\uD0C0\uAE30|\uC794\uC561\uC870\uD68C|\uC0AC\uC6A9\uCC98|\uC9C0\uAE09\uC77C|\uD658\uAE09\uC77C|\uC2E4\uC218\uB839\uC561|\uC790\uB3D9\uACC4\uC0B0|\uC138\uD6C4\uACC4\uC0B0|\uC694\uC728\uD45C|\uC138\uC561\uACF5\uC81C|\uB9CC\uAE30\s*\uC218\uB839\uC561|\uB9C8\uC77C\uB9AC\uC9C0\s*\uD658\uAE09|\uC2E4\uBE44\s*\uCCAD\uAD6C|\uBA74\uCC45\uAE30\uAC04|\uC644\uC804\uC790\uCC28|\uBCF4\uD5D8|\uC785\uC7A5\uB8CC|\uC8FC\uCC28|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C|\uD544\uD130\s*\uAD50\uCCB4|\uBB38\uD131|\uBB3C\uAC78\uB808|\uB0C4\uC0C8|\uBC30\uD130\uB9AC)/u.test(clean);
  if (!directNeed) return false;
  const trustedBase = CACHE_DERIVED_CALCULATOR_RE.test(clean)
    || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || SEARCHAD_FINANCE_BASE_RE.test(clean)
    || LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)
    || PRODUCT_BASE_SIGNAL_RE.test(clean)
    || TRAVEL_PURCHASE_BASE_RE.test(clean)
    || VENUE_TRAVEL_BASE_RE.test(clean)
    || isActionableSportsLiveEventKeyword(clean);
  if (!trustedBase) return false;
  if (LIVE_PROMOTION_LOW_VALUE_CATEGORIES.has(category) && !isActionableSportsLiveEventKeyword(clean)) return false;
  return isSearchAdMeasurableLiveCandidate(clean, categoryId);
}

function measuredProbeBaseSpecificityScore(base: string, categoryId: string): number {
  const clean = normalizeKeyword(base);
  if (!clean) return -999;
  const category = inferLiveCategory(clean, categoryId);
  const fragments = ultimateIntentFragmentCount(clean);
  let score = keywordLongTailScore(clean);
  if (LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)) score += 120;
  if (LIVE_MEASURED_PROBE_PORTFOLIO_ANCHOR_RE.test(clean)) score += 260;
  if (WRITER_READY_SPECIFICITY_RE.test(clean)) score += 95;
  if (fragments >= 2) score += 90;
  else if (fragments === 1) score += 35;
  if (TRAVEL_PURCHASE_BASE_RE.test(clean)) score += 90;
  else if (PRODUCT_BASE_SIGNAL_RE.test(clean)) score += 8;
  if ((LIVE_POLICY_SIGNAL_RE.test(clean) || LIVE_FINANCE_SIGNAL_RE.test(clean)) && !LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)) score -= 35;
  if (PRODUCT_BASE_SIGNAL_RE.test(clean) && !LIVE_MEASURED_PROBE_SPECIFIC_BASE_RE.test(clean)) score -= 25;
  if ((LOW_VALUE_EVENT_TOPIC_RE.test(clean) && !isActionableSportsLiveEventKeyword(clean)) || (LIVE_PROMOTION_DEPRIORITY_RE.test(clean) && !isActionableSportsLiveEventKeyword(clean))) score -= 220;
  if (categoryId !== 'all' && category === categoryId) score += 20;
  if (categoryId === 'all' && LIVE_GOLDEN_DEFAULT_PORTFOLIO_CATEGORY_KEYS.includes(category as any)) score += 12;
  return score;
}

function buildMeasuredProbeCandidates(
  categoryId: string,
  liveSeeds: string[],
  maxSeeds: number,
  now: Date = new Date(),
): string[] {
  const categoryKeys = measuredProbeCategoryKeys(categoryId, liveSeeds);
  const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
  const useCatalogBases = true;
  const candidateLimit = Math.max(
    180,
    Math.min(LIVE_MEASURED_PROBE_CANDIDATE_LIMIT_MAX, Math.floor((maxSeeds || 240) * 0.9)),
  );
  const categoryBases = useCatalogBases
    ? categoryKeys.flatMap((key) => LIVE_MEASURED_PROBE_BASES[key] || [])
    : [];
  const apexBases = useCatalogBases
    ? categoryKeys.flatMap((key) => LIVE_MEASURED_PROBE_APEX_BASES[key] || [])
    : [];
  const discoveryBases = useCatalogBases
    ? categoryKeys.flatMap((key) => getDiscoveryCategorySeeds(key, 64))
    : [];
  const liveBases = uniqueKeywords([
    ...liveSeeds.map((seed) => normalizeKeyword(seed)).filter(Boolean),
    ...normalizeLiveSeeds(liveSeeds, 160),
    ...liveSeeds.map((seed) => normalizeRobustLiveSeedBase(seed, now)).filter(Boolean),
  ], 240).flatMap((seed) => buildSeedPhraseVariants(seed));
  const liveBaseIds = new Set(liveBases.map((seed) => keywordCompactId(seed)).filter(Boolean));
  const liveCategoryIds = new Set(
    liveSeeds
      .flatMap((seed) => {
        const clean = normalizeKeyword(seed);
        return [
          inferLiveCategory(clean, normalizedCategory),
          LIVE_MEASURED_PROBE_HEALTH_BASE_RE.test(clean) ? 'health' : '',
        ];
      })
      .filter((key) => key && key !== 'all' && (!LIVE_PROMOTION_LOW_VALUE_CATEGORIES.has(key) || key === 'sports')),
  );
  const orderedBases = normalizedCategory === 'all'
    ? [...apexBases, ...categoryBases, ...discoveryBases, ...liveBases]
    : [...liveBases, ...apexBases, ...categoryBases, ...discoveryBases];
  const bases = uniqueKeywords(orderedBases, 360)
    .map((base, index) => ({ base, index }))
    .filter((entry) => {
      const base = entry.base;
      const clean = normalizeKeyword(base);
      return clean
        && (!isLowValueLiveCandidate(clean) || isSportsLiveEventSeed(clean))
        && !isOverExpandedLiveCandidate(clean)
        && !isNoisyLiveSeed(clean)
        && !isGenericAudienceOnlyKeyword(clean)
        && !LIVE_MEASURED_PROBE_GENERIC_AUDIENCE_RE.test(clean)
        && categoryAcceptsMeasuredProbe(clean, categoryId);
    })
    .sort((a, b) => (
      measuredProbeBaseSpecificityScore(b.base, categoryId)
      + (liveBaseIds.has(keywordCompactId(b.base)) ? 260 : 0)
      + (liveCategoryIds.has(inferLiveCategory(b.base, categoryId)) ? 220 : 0)
      - measuredProbeBaseSpecificityScore(a.base, categoryId)
      - (liveBaseIds.has(keywordCompactId(a.base)) ? 260 : 0)
      - (liveCategoryIds.has(inferLiveCategory(a.base, categoryId)) ? 220 : 0)
      || a.index - b.index
    ))
    .map((entry) => entry.base);
  const candidates: string[] = [];
  const push = (candidate: string): void => {
    if (candidates.length >= candidateLimit) return;
    const clean = normalizeKeyword(candidate);
    if (!clean || keywordCompactId(clean).length <= 0) return;
    if (!isLiveMeasuredProbeCandidate(clean, categoryId, now)) return;
    candidates.push(clean);
  };
  const pushDirectBase = (candidate: string): boolean => {
    if (candidates.length >= candidateLimit) return false;
    const clean = normalizeKeyword(candidate);
    if (!clean || keywordCompactId(clean).length <= 0) return false;
    if (!isMeasuredDirectNeedBase(clean, categoryId)) return false;
    if (candidates.some((item) => keywordCompactId(item) === keywordCompactId(clean))) return false;
    candidates.push(clean);
    return true;
  };

  for (const base of bases) {
    if (candidates.length >= candidateLimit) break;
    const inferred = inferLiveCategory(base, categoryId);
    const directlyMeasuredBase = pushDirectBase(base);
    if (!directlyMeasuredBase && shouldMeasureProbeBaseDirectly(base, inferred || categoryId)) push(base);
    if (LIVE_MEASURED_PROBE_TERMINAL_BASE_RE.test(normalizeKeyword(base))) continue;
    if (hasLiveUltimateNeedIntent(base) || ultimateIntentFragmentCount(base) >= 2) continue;
    const delayedDetailCandidates: string[] = [];
    const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
    const intentKeys = normalizedCategory === 'all'
      ? uniqueKeywords([inferred, 'all'], 4)
      : uniqueKeywords([inferred, normalizedCategory], 4);
    const scopedIntentKeys = intentKeys.filter((key) => key && key !== 'all');
    const sportsEventIntents = isSportsLiveEventSeed(base)
      ? (/홍명보|감독/u.test(base)
        ? ['대표팀 명단', '경기 시간', '라인업', '상대전적']
        : ['중계 일정', '경기 시간', '대표팀 명단', '라인업', '예매 일정', '티켓팅 방법', '조편성', '대진표', '상대전적', '하이라이트'])
      : [];
    const specificIntents = uniqueKeywords([
      ...sportsEventIntents,
      ...(inferred && inferred !== 'all' ? measuredProbeIntentsForBase(base, inferred) : []),
      ...scopedIntentKeys.flatMap((key) => measuredProbeIntentsForBase(base, key)),
    ], directlyMeasuredBase ? 8 : 14);
    const intentLimit = directlyMeasuredBase ? 4 : 10;
    const intents = uniqueKeywords([
      ...specificIntents,
      ...(specificIntents.length === 0 && inferred !== 'sports' ? (LIVE_MEASURED_PROBE_INTENTS.all || []) : []),
    ], intentLimit)
      .filter((intent) => isMeasuredProbeIntentCompatible(base, intent, inferred || categoryId))
      .sort((a, b) => measuredProbeIntentPriority(b, inferred || categoryId) - measuredProbeIntentPriority(a, inferred || categoryId));
    const detailLimit = directlyMeasuredBase ? 4 : 12;
    for (const intent of intents) {
      if (candidates.length >= candidateLimit) break;
      const candidate = appendCompatibleIntent(base, intent);
      if (!candidate) continue;
      if (!isUltimateIntentCompatible(base, intent, inferred || categoryId)) continue;
      push(candidate);
      if (directlyMeasuredBase) continue;
      for (const detailCandidate of buildMeasuredProbeDetailCandidates(base, intent, inferred || categoryId)) {
        if (!isUltimateIntentCompatible(detailCandidate, intent, inferred || categoryId)) continue;
        delayedDetailCandidates.push(detailCandidate);
      }
    }
    for (const detailCandidate of uniqueKeywords(delayedDetailCandidates, detailLimit)) {
      if (candidates.length >= candidateLimit) break;
      push(detailCandidate);
    }
  }

  return diversifyMeasuredProbeCandidates(candidates, candidateLimit);
}

function buildBackfillCandidates(categoryId: string, liveSeeds: string[], maxSeeds: number, now: Date = new Date()): string[] {
  const rawLiveBases = liveSeeds
    .map((seed) => normalizeRobustLiveSeedBase(seed, now))
    .filter(Boolean);
  const liveSeedBases = uniqueKeywords([
    ...rawLiveBases,
    ...normalizeLiveSeeds(liveSeeds, 80),
  ], 120)
    .map((seed) => normalizeLiveSeedForDate(seed, now))
    .filter(Boolean);
  const candidateLimit = Math.max(
    120,
    Math.min(LIVE_BACKFILL_CANDIDATE_LIMIT_MAX, Math.floor(maxSeeds || 240)),
  );
  const robustCandidates = buildRobustLiveSeedCandidates(categoryId, liveSeeds, maxSeeds, now);
  const inferredLiveCandidates = buildDateAwareLiveSeedCandidates(categoryId, liveSeeds, maxSeeds, now);
  const measuredProbeCandidates = buildMeasuredProbeCandidates(categoryId, liveSeeds, maxSeeds, now);
  const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
  const measuredProbeShare = normalizedCategory === 'all'
    ? LIVE_BACKFILL_MEASURED_PROBE_SHARE_ALL
    : LIVE_BACKFILL_MEASURED_PROBE_SHARE_CATEGORY;
  const liveCategoryIds = new Set(
    liveSeeds
      .flatMap((seed) => {
        const clean = normalizeKeyword(seed);
        return [
          inferLiveCategory(clean, normalizedCategory),
          LIVE_MEASURED_PROBE_HEALTH_BASE_RE.test(clean) ? 'health' : '',
        ];
      })
      .filter((key) => key && key !== 'all' && (!LIVE_PROMOTION_LOW_VALUE_CATEGORIES.has(key) || key === 'sports')),
  );
  const liveCategoryMeasuredProbeCandidates = measuredProbeCandidates
    .filter((keyword) => liveCategoryIds.has(inferLiveCategory(keyword, normalizedCategory)));
  const measuredProbeBackfillLimit = Math.max(
    36,
    Math.min(Math.floor(candidateLimit * measuredProbeShare), measuredProbeCandidates.length),
  );
  const measuredProbeBackfillShare = uniqueKeywords([
    ...liveCategoryMeasuredProbeCandidates,
    ...measuredProbeCandidates,
  ], measuredProbeBackfillLimit);
  const measuredProbeIds = new Set(measuredProbeCandidates.map((seed) => keywordCompactId(seed)).filter(Boolean));
  const needExpandedSeeds = (seeds: string[], limit: number): string[] => seeds
    .filter((seed) => !hasLiveUltimateNeedIntent(seed) && ultimateIntentFragmentCount(seed) < 2)
    .flatMap((seed) => buildUltimateNeedCandidatesForSeed(seed, categoryId, limit));
  const baseSeeds = uniqueKeywords([
    ...measuredProbeBackfillShare,
    ...liveSeedBases,
    ...needExpandedSeeds(liveSeedBases, 8),
    ...robustCandidates,
    ...inferredLiveCandidates,
    ...needExpandedSeeds(robustCandidates, 6),
    ...needExpandedSeeds(inferredLiveCandidates, 6),
    ...getDiscoveryCategorySeeds(categoryId, Math.max(24, Math.min(80, maxSeeds))),
  ], Math.max(160, Math.min(600, maxSeeds || 240)));
  const intents = uniqueKeywords([
    ...ultimateNeedTemplatesForCategory(categoryId),
    ...getBackfillIntents(categoryId),
    ...(ROBUST_CATEGORY_INTENTS[categoryId] || []),
    ...ROBUST_GENERAL_INTENTS,
  ], 28);
  const liveSeedSet = new Set([...liveSeedBases, ...inferredLiveCandidates, ...robustCandidates].map((seed) => seed.toLowerCase().replace(/\s+/g, '')));
  const candidates: string[] = [];
  const candidateClusterCounts = new Map<string, number>();
  const maxCandidatesPerCluster = Math.max(12, Math.min(24, Math.ceil(candidateLimit / 6)));
  const pushCandidate = (candidate: string): void => {
    if (candidates.length >= candidateLimit) return;
    const clean = normalizeKeyword(candidate);
    if (!clean) return;
    if (isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean)) return;
    const cluster = liveCandidateDiversityKey(clean);
    const count = candidateClusterCounts.get(cluster) || 0;
    if (count >= maxCandidatesPerCluster) return;
    candidateClusterCounts.set(cluster, count + 1);
    candidates.push(clean);
  };
  for (const seed of baseSeeds) {
    pushCandidate(seed);
    const key = seed.toLowerCase().replace(/\s+/g, '');
    const seedIsLive = liveSeedSet.has(key);
    const seedCategory = inferLiveCategory(seed, categoryId);
    const seedExpandable = LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(seedCategory)
      || LIVE_ULTIMATE_EXPANDABLE_CATEGORIES.has(normalizeKeyword(categoryId));
    const seedHasNeedIntent = hasLiveUltimateNeedIntent(seed);
    if (!seedExpandable) {
      if (seedHasNeedIntent) continue;
      if (!seedIsLive) continue;
    }
    const seedAlreadySpecific = isActionableLiveKeyword(seed) || isRobustSpecificLiveKeyword(seed);
    if (ultimateIntentFragmentCount(seed) >= 2) continue;
    if (seedHasNeedIntent) continue;
    const seedIntents = seedIsLive
      ? uniqueKeywords([
        ...ultimateNeedTemplatesForCategory(seedCategory || categoryId),
        ...getLiveSeedBackfillIntents(seed, categoryId),
        ...robustIntentTemplatesForSeed(seed, categoryId),
      ], 28)
      : intents;
    const compatibleSeedIntents = seedIntents.filter((intent) => isUltimateIntentCompatible(seed, intent, seedCategory || categoryId));
    const intentLimit = seedIsLive
      ? (seedAlreadySpecific ? Math.min(6, compatibleSeedIntents.length) : Math.min(16, compatibleSeedIntents.length))
      : compatibleSeedIntents.length;
    for (const intent of compatibleSeedIntents.slice(0, intentLimit)) {
      if (!keywordAlreadyHasIntent(seed, intent)) pushCandidate(`${seed} ${intent}`);
      if (candidates.length >= candidateLimit) break;
    }
    if (candidates.length >= candidateLimit) break;
  }
  return diversifyLiveCandidates(
    candidates.filter((candidate) => !isOverExpandedLiveCandidate(candidate))
      .filter((candidate) => isLiveRadarUsableKeyword(candidate, null, null, now)),
    candidateLimit,
  );
}

function liveMetricScore(volume: number, docs: number, ratio: number, actionable: boolean): number {
  const ratioScore = ratio >= 80 ? 100 : ratio >= 30 ? 98 : ratio >= 15 ? 94 : ratio >= 10 ? 90 : ratio >= 5 ? 80 : ratio >= 3 ? 68 : 48;
  const volumeScore = volume >= 30_000 ? 100 : volume >= 10_000 ? 96 : volume >= 3_000 ? 90 : volume >= 1_000 ? 86 : volume >= 500 ? 72 : volume >= 100 ? 54 : 35;
  const docScore = docs <= 150 ? 100 : docs <= 300 ? 98 : docs <= 1_000 ? 94 : docs <= 3_000 ? 86 : docs <= 8_000 ? 72 : docs <= 20_000 ? 50 : 30;
  const intentScore = actionable ? 100 : 0;
  return Math.round(ratioScore * 0.38 + volumeScore * 0.18 + docScore * 0.26 + intentScore * 0.18);
}

function liveUltimateOpportunityScore(keyword: string, volume: number, docs: number, ratio: number): number {
  const clean = normalizeKeyword(keyword);
  if (!clean || volume <= 0 || docs <= 0 || ratio <= 0) return 0;
  if (isLowValueLiveCandidate(clean) || isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean)) return 0;
  if (isBrandSafetyNewsKeyword(clean) || isBroadBenefitProductKeyword(clean) || isGenericAudienceOnlyKeyword(clean)) return 0;
  const actionable = hasLiveUltimateNeedIntent(clean)
    || hasHighValueNeedIntent(clean)
    || hasSssReadyNeedIntent(clean)
    || hasRobustActionableIntent(clean)
    || isActionableGoldenKeyword(clean);
  if (!actionable) return 0;
  let score = liveMetricScore(volume, docs, ratio, actionable);
  if (volume >= 1_000 && docs <= 300 && ratio >= 10) score = Math.max(score, 98);
  else if (volume >= 3_000 && docs <= 800 && ratio >= 7) score = Math.max(score, 98);
  else if (volume >= 10_000 && docs <= 1_500 && ratio >= 5) score = Math.max(score, 98);
  else if (volume >= 20_000 && docs <= 3_000 && ratio >= 4) score = Math.max(score, 98);
  else if (volume >= 50_000 && docs <= 15_000 && ratio >= 6) score = Math.max(score, 98);
  else if (volume >= 80_000 && docs <= 25_000 && ratio >= 7) score = Math.max(score, 98);
  else if (volume >= 250_000 && docs <= 30_000 && ratio >= 10) score = Math.max(score, 98);
  else if (volume >= 500 && docs <= 200 && ratio >= 4) score = Math.max(score, 95);
  if (volume >= 10_000 && !hasWriterReadySpecificity(clean)) score = Math.min(score, 84);
  return Math.max(0, Math.min(100, score));
}

function liveBoardOpportunityScore(item: MobileKeywordMetric): number {
  const volume = finiteNumber(item.totalSearchVolume);
  const docs = finiteNumber(item.documentCount);
  if (volume === null || docs === null || docs <= 0) return 0;
  const ratio = finiteNumber(item.goldenRatio) ?? Number((volume / docs).toFixed(2));
  return liveUltimateOpportunityScore(item.keyword, volume, docs, ratio);
}

const LIVE_PROMOTION_PRIORITY_RE = /(?:계산기|신청|대상|자격|조건|지급일|조회|사용처|가격|가격비교|비교|추천|후기|리뷰|방법|준비물|서류|마감|주차|입장료|예약|예매|최저가|할인|쿠폰|구매처|렌트카|렌터카|숙소|호텔|리조트|펜션|캠핑장|에어컨|제습기|공기청정기|창문형에어컨|세럼|크림|바우처|지원금|장려금|급여|수당|환급|청년|소상공인|연말정산|세액공제|연금저축)/u;
const LIVE_PROMOTION_DEPRIORITY_RE = /(?:프로필|출연진|몇부작|줄거리|원작|공식입장|기자회견|논란|별세|사임|타계|월드컵|FIFA|KBO|올스타|하이라이트|로또|당첨번호|등급컷|답지|모의고사|선거|개표|당선자|충주시장|신입사원\s*강회장|맨\s*끝줄\s*소년|넷플릭스|드라마|배우)/u;
const LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE = /(?:지급일\s*(?:사용처|추천|후기|예약|비용|마감일)|마감일\s*(?:사용처|추천|후기|예약|비용)|준비서류\s*(?:사용처|추천|후기|예약|비용)|자격\s*(?:사용처|추천|후기|예약|비용)|대상\s*(?:사용처|추천|후기|예약|비용)|금액\s*(?:사용처|추천|후기|예약|비용)|사용처\s*(?:추천|후기|예약|비용|마감일|지급일)|(?:신청|대상|자격|지급일|마감일|사용처|준비서류).{0,12}(?:신청|대상|자격|지급일|마감일|사용처|준비서류).{0,12}(?:신청|대상|자격|지급일|마감일|사용처|준비서류))/u;
const LIVE_COMMERCE_PRODUCT_PROMOTION_RE = /(?:에어컨|제습기|공기청정기|청소기|창문형에어컨|노트북|아이폰|갤럭시|세럼|크림|선크림|렌트카|렌터카|리조트|펜션|캠핑장|호텔|숙소|가격비교|최저가|구매처|할인|쿠폰|추천|후기|리뷰)/u;
const LIVE_POLICY_ACTION_PROMOTION_RE = /(?:바우처|지원금|장려금|급여|수당|환급|청년|소상공인|연말정산|세액공제|연금저축|사용처|지급일|신청|대상|자격|조건|서류|마감|조회|계산기)/u;
const LIVE_PROMOTION_STRATEGIC_CATEGORIES = new Set([
  'policy',
  'finance',
  'shopping',
  'electronics',
  'beauty',
  'fashion',
  'food',
  'health',
  'home_life',
  'it',
  'travel_domestic',
  'travel_overseas',
]);
const LIVE_PROMOTION_LOW_VALUE_CATEGORIES = new Set([
  'broadcast',
  'drama',
  'movie',
  'music',
  'sports',
  'celeb',
  'education',
  'live_issue',
]);

function livePromotionPriorityBonus(keyword: string, categoryId = ''): number {
  const clean = normalizeKeyword(keyword);
  if (!clean) return 0;
  let score = 0;
  if (
    LIVE_PROMOTION_DEPRIORITY_RE.test(clean)
    || LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE.test(clean)
    || isLottoLookupKeyword(clean)
    || isLowAdsenseLookupKeyword(clean)
    || isBrandSafetyNewsKeyword(clean)
    || ROBUST_EXAM_STALE_RE.test(clean)
    || (LOW_VALUE_EVENT_TOPIC_RE.test(clean) && !isActionableSportsLiveEventKeyword(clean))
  ) {
    score -= LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE.test(clean) ? 900 : 520;
  }
  if (
    LIVE_POLICY_ACTION_PROMOTION_RE.test(clean)
    || SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || CONCRETE_POLICY_PRODUCT_RE.test(clean)
  ) {
    score += 260;
  }
  if (
    LIVE_COMMERCE_PRODUCT_PROMOTION_RE.test(clean)
    || PRODUCT_BASE_SIGNAL_RE.test(clean)
    || VENUE_TRAVEL_BASE_RE.test(clean)
  ) {
    score += 210;
  }
  if (LIVE_PROMOTION_PRIORITY_RE.test(clean) || CONCRETE_PUBLISH_ACTION_RE.test(clean)) score += 140;
  if (hasRobustActionableIntent(clean) || hasLiveUltimateNeedIntent(clean) || hasAdsenseNeedIntent(clean)) score += 120;

  const category = inferLiveCategory(clean, categoryId || 'all');
  if (LIVE_PROMOTION_STRATEGIC_CATEGORIES.has(category)) score += 45;
  if (LIVE_PROMOTION_LOW_VALUE_CATEGORIES.has(category) && !isActionableSportsLiveEventKeyword(clean)) score -= 180;
  return score;
}

function splitEnrichmentPriorityScore(item: MobileKeywordMetric, nowMs: number): number {
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount);
  const ratio = finiteNumber(item.goldenRatio)
    ?? (volume > 0 && docs !== null && docs > 0 ? Number((volume / docs).toFixed(2)) : 0);
  const ageMs = ageMsFrom((item as MobileLiveGoldenBoardItem).updatedAt || '', nowMs);
  const freshness = ageMs < 12 * 60 * 60 * 1000 ? 36 : ageMs < 48 * 60 * 60 * 1000 ? 18 : 0;
  const need = hasLiveUltimateNeedIntent(item.keyword) ? 180 : 0;
  const pendingSplit = hasMeasuredPcMobileSplit(item) ? 0 : 160;
  const pendingCpc = hasRealCpcValue(item) ? 0 : 24;
  const priority = livePromotionPriorityBonus(item.keyword, (item as { category?: string }).category || 'all');
  const measuredDemand = volume >= 30_000 ? 320
    : volume >= 10_000 ? 260
      : volume >= 3_000 ? 210
        : volume >= 1_000 ? 165
          : volume >= 300 ? 110
            : volume >= LIVE_CACHE_PROMOTION_MIN_VOLUME ? 60
              : -900;
  const measuredRatio = ratio >= 10 ? 170
    : ratio >= 5 ? 140
      : ratio >= 2 ? 95
        : ratio >= LIVE_CACHE_PROMOTION_MIN_RATIO ? 45
          : -220;
  const measuredDocuments = docs !== null && docs > 0 && docs <= 1_000 ? 130
    : docs !== null && docs <= 3_000 ? 105
      : docs !== null && docs <= 10_000 ? 72
        : docs !== null && docs <= BROAD_KEYWORD_DOCUMENT_CEILING ? 32
          : -160;
  const measuredSssReady = volume >= 1_000
    && docs !== null
    && docs > 0
    && docs <= 5_000
    && ratio >= 5
    && isBlogActionableBoardMetric(item)
    ? 680
    : 0;
  const writerReady = isApexWriterReadyBoardMetric(item) ? 180 : 0;
  const overbroadPenalty = isOverbroadNoEffectBoardKeyword(item) ? -520 : 0;
  return priority
    + pendingSplit
    + pendingCpc
    + need
    + measuredSssReady
    + writerReady
    + overbroadPenalty
    + measuredDemand
    + measuredRatio
    + measuredDocuments
    + liveUltimateOpportunityScore(item.keyword, volume, docs || 0, ratio) * 4
    + volumeOpportunityScore(volume)
    + documentScarcityScore(docs)
    + ratioOpportunityScore(ratio)
    + freshness;
}

function isCachePromotionMeasurementCandidate(item: MobileKeywordMetric, now: Date): boolean {
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount);
  const ratio = finiteNumber(item.goldenRatio)
    ?? (volume > 0 && docs !== null && docs > 0 ? Number((volume / docs).toFixed(2)) : 0);
  const strongNeedKeyword = isStrongMeasuredNeedKeyword(item.keyword);
  const maxDocs = strongNeedKeyword
    ? Math.min(BROAD_KEYWORD_DOCUMENT_CEILING, LIVE_CACHE_PROMOTION_STRONG_NEED_DOCUMENT_CEILING)
    : BROAD_KEYWORD_DOCUMENT_CEILING;
  const minRatio = strongNeedKeyword
    ? LIVE_CACHE_PROMOTION_STRONG_NEED_MIN_RATIO
    : LIVE_CACHE_PROMOTION_MIN_RATIO;
  if (volume < LIVE_CACHE_PROMOTION_MIN_VOLUME) return false;
  if (docs === null || docs <= 0 || docs > maxDocs) return false;
  if (ratio < minRatio) return false;
  return isLiveRadarUsableMetric(item, now) || isMeasuredProExactKeywordMetric(item, now);
}

function isMeasuredProExactKeywordMetric(
  item: Partial<MobileKeywordMetric> & { keyword?: string },
  now: Date = new Date(),
): boolean {
  const keyword = normalizeKeyword(item.keyword);
  const volume = finiteNumber(item.totalSearchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
  const strongNeedKeyword = isStrongMeasuredNeedKeyword(keyword);
  const maxDocs = strongNeedKeyword
    ? Math.min(BROAD_KEYWORD_DOCUMENT_CEILING, LIVE_CACHE_PROMOTION_STRONG_NEED_DOCUMENT_CEILING)
    : BROAD_KEYWORD_DOCUMENT_CEILING;
  const minRatio = strongNeedKeyword
    ? LIVE_CACHE_PROMOTION_STRONG_NEED_MIN_RATIO
    : LIVE_CACHE_PROMOTION_MIN_RATIO;
  if (!keyword || item.grade === 'C') return false;
  if (!hasCompleteLiveGoldenMetrics(item)) return false;
  if (isMalformedLiveKeyword(keyword) || isStaleOrFutureLiveKeyword(keyword, now)) return false;
  if (isInvalidNonProductCommerceExpansion(keyword)) return false;
  if (isThinProfileIntentKeyword(keyword) || isNoisyLiveSeed(keyword) || isOverExpandedLiveCandidate(keyword)) return false;
  if (!isBlogActionableBoardMetric(item)) return false;
  if ((!isActionableSportsLiveEventKeyword(keyword) && isUltimateLowValueLookupKeyword(keyword)) || isLowValueLiveCandidate(keyword)) return false;
  if (isLottoLookupKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
  if (volume < LIVE_CACHE_PROMOTION_MIN_VOLUME || docs <= 0 || docs > maxDocs) return false;
  if (ratio < minRatio) return false;
  return true;
}

function isMeasuredBoardReferenceMetric(
  item: Partial<MobileKeywordMetric> & { keyword?: string },
  now: Date = new Date(),
): boolean {
  const keyword = normalizeKeyword(item.keyword);
  if (!keyword || item.grade === 'C') return false;
  if (!hasCompleteLiveGoldenMetrics(item)) return false;
  if (item.isSearchVolumeEstimated || item.isDocumentCountEstimated) return false;
  if (isMalformedLiveKeyword(keyword) || isStaleOrFutureLiveKeyword(keyword, now)) return false;
  if (isInvalidNonProductCommerceExpansion(keyword)) return false;
  if (isThinProfileIntentKeyword(keyword) || isNoisyLiveSeed(keyword) || isOverExpandedLiveCandidate(keyword)) return false;
  if ((!isActionableSportsLiveEventKeyword(keyword) && isUltimateLowValueLookupKeyword(keyword)) || isLowValueLiveCandidate(keyword)) return false;
  if (isLottoLookupKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
  return true;
}

function isMeasuredCacheSearchAdSplitCandidate(keyword: string, categoryId: string, now: Date): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || isMalformedLiveKeyword(clean) || isStaleOrFutureLiveKeyword(clean, now)) return false;
  if (isThinProfileIntentKeyword(clean) || isNoisyLiveSeed(clean) || isOverExpandedLiveCandidate(clean)) return false;
  if ((!isActionableSportsLiveEventKeyword(clean) && isUltimateLowValueLookupKeyword(clean)) || isLowValueLiveCandidate(clean)) return false;
  const compactLength = clean.replace(/\s+/g, '').length;
  const tokenCount = clean.split(/\s+/).filter(Boolean).length;
  if (compactLength < LIVE_SEARCHAD_CANDIDATE_MIN_CHARS || compactLength > LIVE_SEARCHAD_CANDIDATE_MAX_CHARS) return false;
  if (tokenCount > LIVE_SEARCHAD_CANDIDATE_MAX_TOKENS) return false;
  if (ultimateIntentFragmentCount(clean) > 3) return false;
  return inferLiveCategory(clean, categoryId || 'all') !== 'live_issue'
    || hasLiveUltimateNeedIntent(clean)
    || hasRobustActionableIntent(clean)
    || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
}

function liveGradeFromMetrics(score: number, volume: number, docs: number, ratio: number, keyword = ''): MobileResultGrade {
  let grade: MobileResultGrade = 'C';
  if (score >= 85 && volume >= 1000 && docs <= 5000 && ratio >= 5) grade = LIVE_SSS_GRADE;
  else if (score >= 75 && volume >= 500 && docs <= 10000 && ratio >= 3) grade = 'SS';
  else if (score >= 65 && volume >= 300 && ratio >= 2) grade = 'S';
  else if (score >= 55 && volume >= 100) grade = 'A';
  else if (score >= 45) grade = 'B';
  return capSssForNeedIntent(grade, keyword);
}

function normalizeLiveMetricGrade(
  keyword: string,
  currentGrade: unknown,
  _scoreValue: number | null,
  volume: number,
  docs: number,
  ratio: number,
): MobileResultGrade {
  const actionable = hasHighValueNeedIntent(keyword)
    || hasSssReadyNeedIntent(keyword)
    || hasRobustActionableIntent(keyword)
    || isActionableGoldenKeyword(keyword)
    || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(keyword);
  const computedScore = liveMetricScore(volume, docs, ratio, actionable);
  const opportunityScore = liveUltimateOpportunityScore(keyword, volume, docs, ratio);
  const score = Math.max(computedScore, opportunityScore);
  const rowGrade = normalizeGrade(currentGrade, score);
  const gateGrade = liveGradeFromMetrics(score, volume, docs, ratio, keyword);
  if (
    GRADE_RANK[gateGrade] > GRADE_RANK[rowGrade]
    && gateGrade === LIVE_SSS_GRADE
    && volume >= 1000
    && docs > 0
    && docs <= 5000
    && ratio >= 5
    && hasWriterReadySpecificity(keyword)
    && !isOverbroadNoEffectBoardKeyword({
      keyword,
      totalSearchVolume: volume,
      documentCount: docs,
      goldenRatio: ratio,
      grade: gateGrade,
    })
  ) {
    return gateGrade;
  }
  return lowerGrade(rowGrade, gateGrade);
}

function lowerGrade(a: MobileResultGrade, b: MobileResultGrade): MobileResultGrade {
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

function capGradeAtMost(grade: MobileResultGrade, maxGrade: MobileResultGrade): MobileResultGrade {
  return lowerGrade(grade, maxGrade);
}

function hasMeasuredPcMobileSplit(item: {
  pcSearchVolume?: number | null;
  mobileSearchVolume?: number | null;
}): boolean {
  const pc = finiteNumber(item.pcSearchVolume);
  const mobile = finiteNumber(item.mobileSearchVolume);
  return pc !== null && mobile !== null && pc + mobile > 0;
}

function hasRealCpcValue(item: { cpc?: number | null }): boolean {
  const cpc = finiteNumber(item.cpc);
  return cpc !== null && cpc > 0;
}

function hasSearchAdCredentials(env: Partial<EnvConfig>): boolean {
  return Boolean(
    normalizeKeyword(env.naverSearchAdAccessLicense)
      && normalizeKeyword(env.naverSearchAdSecretKey),
  );
}

function hasLikelyProductionSearchAdCredentials(env: Partial<EnvConfig>): boolean {
  const accessLicense = normalizeKeyword(env.naverSearchAdAccessLicense);
  const secretKey = normalizeKeyword(env.naverSearchAdSecretKey);
  if (!accessLicense || !secretKey) return false;
  return accessLicense.length >= 24 && secretKey.length >= 24;
}

function searchAdConfigFromEnv(env: Partial<EnvConfig>): NaverSearchAdConfig | null {
  const accessLicense = normalizeKeyword(env.naverSearchAdAccessLicense);
  const secretKey = normalizeKeyword(env.naverSearchAdSecretKey);
  if (!accessLicense || !secretKey) return null;
  const customerId = normalizeKeyword(env.naverSearchAdCustomerId);
  return customerId
    ? { accessLicense, secretKey, customerId }
    : { accessLicense, secretKey };
}

function isLottoLookupKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (/\uC2E4\uC218\uB839\uC561/u.test(clean) && !/(?:\uB85C\uB610|\uBCF5\uAD8C|\uB2F9\uCCA8)/u.test(clean)) return false;
  return ADSENSE_LOTTO_LOOKUP_RE.test(clean)
    || LIVE_LOTTERY_SIGNAL_RE.test(clean)
    || isRobustLottoKeyword(clean);
}

function isLowAdsenseLookupKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  return ADSENSE_LOW_VALUE_LOOKUP_RE.test(clean)
    || LOW_CONVERSION_LOOKUP_INTENT_RE.test(clean)
    || isEpisodeLookupKeyword(clean)
    || isContentLookupKeyword(clean);
}

function isBroadBenefitProductKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || !BROAD_BENEFIT_PRODUCT_RE.test(clean)) return false;
  if (CONCRETE_PUBLISH_ACTION_RE.test(clean)) return false;
  const compact = clean.replace(/\s+/g, '');
  return compact.length <= 18;
}

function isGenericAudienceOnlyKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean || BROAD_BENEFIT_PRODUCT_RE.test(clean)) return false;
  const stripped = normalizeKeyword(
    clean
      .replace(CONCRETE_PUBLISH_ACTION_RE, ' ')
      .replace(/\b(?:and|or)\b/gi, ' '),
  );
  const tokens = stripped
    .split(/[·ㆍ\/,|+\s-]+/u)
    .map((token) => token.replace(/\s+/g, '').trim())
    .filter(Boolean);
  return tokens.length >= 2 && tokens.every((token) => GENERIC_AUDIENCE_TERMS.has(token));
}

function isBrandSafetyNewsKeyword(keyword: string): boolean {
  return ADSENSE_BRAND_SAFETY_NEWS_RE.test(normalizeKeyword(keyword));
}

function hasAdsenseNeedIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean) || isBrandSafetyNewsKeyword(clean)) {
    return false;
  }
  return ADSENSE_NEED_INTENT_RE.test(clean)
    || ADSENSE_NEED_INTENT_RE.test(clean.replace(/\s+/g, ''))
    || hasSssReadyNeedIntent(clean)
    || hasHighValueNeedIntent(clean)
    || hasRobustActionableIntent(clean)
    || isActionableGoldenKeyword(clean);
}

function categoryAdsenseScore(category: string): number {
  const clean = normalizeKeyword(category);
  if (ADSENSE_HIGH_VALUE_CATEGORIES.has(clean)) return 22;
  if (ADSENSE_LOW_VALUE_CATEGORIES.has(clean)) return -18;
  return 0;
}

function adsenseReadinessScore(item: MobileLiveGoldenBoardItem): number {
  const keyword = normalizeKeyword(item.keyword);
  const category = boardCategoryKey(item);
  const volume = Math.max(0, item.totalSearchVolume || 0);
  const documents = item.documentCount;
  const ratio = Math.max(0, item.goldenRatio || (
    volume > 0 && documents && documents > 0 ? volume / documents : 0
  ));
  const lottoLookup = isLottoLookupKeyword(keyword);
  const lowLookup = isLowAdsenseLookupKeyword(keyword);
  const brandSafety = isBrandSafetyNewsKeyword(keyword);
  let score = 0;

  score += hasMeasuredPcMobileSplit(item) ? 18 : -45;
  score += hasRealCpcValue(item) ? Math.min(28, 10 + Math.log10((item.cpc || 0) + 1) * 8) : -18;
  score += categoryAdsenseScore(category);

  if (hasAdsenseNeedIntent(keyword)) score += 58;
  if (!lottoLookup && !lowLookup && !brandSafety) {
    if (volume >= 500 && documents !== null && documents <= 10_000 && ratio >= 3) score += 24;
    if (volume >= 1_000 && documents !== null && documents <= 3_000 && ratio >= 5) score += 34;
    if (volume >= 3_000 && documents !== null && documents <= 1_000 && ratio >= 10) score += 24;
  }

  if (documents !== null && documents >= 15_000 && ratio < 2) score -= 46;
  if (documents !== null && documents >= 30_000) score -= 64;
  if (volume > 0 && volume < 300) score -= 12;

  if (lottoLookup) score -= 180;
  if (lowLookup) score -= 150;
  if (brandSafety) score -= 120;

  return Math.max(-240, Math.min(160, Math.round(score)));
}

function capGradeForAdsenseIntent(grade: MobileResultGrade, keyword: string): MobileResultGrade {
  const clean = normalizeKeyword(keyword);
  if (!clean) return grade;
  if (isLottoLookupKeyword(clean)) return capGradeAtMost(grade, 'A');
  if (isBrandSafetyNewsKeyword(clean)) return capGradeAtMost(grade, 'A');
  if (isLowAdsenseLookupKeyword(clean)) return capGradeAtMost(grade, 'S');
  if (
    grade === 'SSS'
    && !hasAdsenseNeedIntent(clean)
    && !hasHighValueNeedIntent(clean)
    && !hasSssReadyNeedIntent(clean)
  ) return 'SS';
  return grade;
}

function hasHighValueNeedIntent(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  return HIGH_VALUE_NEED_INTENT_RE.test(clean) || HIGH_VALUE_NEED_INTENT_RE.test(clean.replace(/\s+/g, ''));
}

function isStrongMeasuredNeedKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean) || isBrandSafetyNewsKeyword(clean)) return false;
  if (LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE.test(clean)) return false;
  return hasLiveUltimateNeedIntent(clean)
    || hasSssReadyNeedIntent(clean)
    || hasHighValueNeedIntent(clean)
    || hasRobustActionableIntent(clean)
    || hasAdsenseNeedIntent(clean)
    || isActionableGoldenKeyword(clean)
    || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
}

function capSssForNeedIntent(grade: MobileResultGrade, keyword: string): MobileResultGrade {
  const adsenseCapped = capGradeForAdsenseIntent(grade, keyword);
  if (adsenseCapped !== grade) return adsenseCapped;
  if (grade !== 'SSS') return grade;
  const clean = normalizeKeyword(keyword);
  if (!clean) return grade;
  if (isBroadHeadSssKeyword(clean)) return 'SS';
  if (hasHighValueNeedIntent(clean) || hasAdsenseNeedIntent(clean) || hasSssReadyNeedIntent(clean)) return grade;
  if (LOW_CONVERSION_LOOKUP_INTENT_RE.test(clean)) return 'SS';
  return capGradeForAdsenseIntent('SS', clean);
}

function rowSearchVolume(row: LiveSearchVolumeRow): number {
  return (finiteNumber(row.pcSearchVolume) || 0) + (finiteNumber(row.mobileSearchVolume) || 0);
}

function preDocumentCandidateScore(row: LiveSearchVolumeRow, categoryId: string): number {
  const keyword = normalizeKeyword(row.keyword);
  const volume = rowSearchVolume(row);
  const intent = keywordNeedScore(keyword, 'volume-pass') + (hasRobustActionableIntent(keyword) ? 18 : 0);
  const longTail = keywordLongTailScore(keyword);
  const category = inferLiveCategory(keyword, categoryId);
  const categoryBonus = category === categoryId || categoryId === 'all' ? 20 : 0;
  const volumeBand = volume >= 30_000
    ? 70
    : volume >= 10_000
      ? 60
      : volume >= 3_000
        ? 48
        : volume >= 1_000
          ? 38
          : volume >= 300
            ? 24
            : 8;
  const measuredProbeBonus = isLiveMeasuredProbeCandidate(keyword, categoryId) ? 32 : 0;
  const intentFragments = ultimateIntentFragmentCount(keyword);
  const specificityBonus = intentFragments >= 2
    ? 90
    : intentFragments === 1
      ? -35
      : -80;
  const broadHighVolumePenalty = intentFragments < 2 && volume >= 30_000
    ? -110
    : intentFragments < 2 && volume >= 10_000
      ? -70
      : 0;
  return volumeBand + intent + longTail + categoryBonus + measuredProbeBonus + specificityBonus + broadHighVolumePenalty;
}

function preVolumeCandidateScore(keyword: string, categoryId: string): number {
  const clean = normalizeKeyword(keyword);
  if (!clean) return -999;
  if (isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean) || isNoisyLiveSeed(clean)) return -900;
  const inferred = inferLiveCategory(clean, categoryId);
  const categoryBonus = categoryId === 'all' || inferred === categoryId ? 22 : 0;
  const needScore = keywordNeedScore(clean, 'pre-volume')
    + (hasLiveUltimateNeedIntent(clean) ? 24 : 0)
    + (hasRobustActionableIntent(clean) ? 16 : 0);
  const longTailScore = keywordLongTailScore(clean);
  const intentPenalty = ultimateIntentFragmentCount(clean) >= 3 ? -26 : 0;
  const sourcePenalty = isLowValueLiveSourceCategory(inferred) ? -40 : 0;
  const measuredProbeBonus = isLiveMeasuredProbeCandidate(clean, categoryId) ? 90 : 0;
  const conversionIntentBonus = MEASURED_PROBE_STRONG_CONVERSION_INTENT_RE.test(clean) ? 92 : 0;
  const weakInfoPenalty = MEASURED_PROBE_WEAK_INFO_INTENT_RE.test(clean) ? -85 : 0;
  const familyDiversityPenalty = /(?:렌터카|렌트카|렌탈카).{0,12}(?:추천\s*후기|숙소\s*예약|환불\s*규정)/u.test(clean) ? -80 : 0;
  return categoryBonus
    + needScore
    + longTailScore
    + livePromotionPriorityBonus(clean, categoryId)
    + writerReadySssProbePriorityScore(clean, categoryId)
    + (hasWriterReadyOpportunityIntent(clean) ? 180 : 0)
    + measuredProbeBonus
    + conversionIntentBonus
    + weakInfoPenalty
    + familyDiversityPenalty
    + intentPenalty
    + sourcePenalty;
}

function isHighYieldSearchAdSpendCandidate(keyword: string, categoryId: string, now: Date = new Date()): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return false;
  if (!isSearchAdMeasurableLiveCandidate(clean, categoryId, now)) return false;
  if (isSyntheticNoEffectLiveProbe(clean)) return false;
  if (isBroadHeadSssKeyword(clean)) return false;
  const category = inferLiveCategory(clean, categoryId || 'all');
  const fragments = ultimateIntentFragmentCount(clean);
  const longTail = keywordLongTailScore(clean);
  const writerReadyProbeIntent = hasWriterReadySearchAdProbeIntent(clean);
  const writerReady = hasWriterReadySpecificity(clean) || writerReadyProbeIntent;
  const knownPolicyOrFinance = SEARCHAD_POLICY_PRODUCT_BASE_RE.test(clean)
    || SEARCHAD_FINANCE_BASE_RE.test(clean)
    || isKnownPolicyProductNeedKeyword(clean);
  const strategicCategory = LIVE_PROMOTION_STRATEGIC_CATEGORIES.has(category);
  if (!writerReady && fragments < 2 && longTail < 18 && !knownPolicyOrFinance) return false;
  if (!writerReady && fragments < 2 && !strategicCategory) return false;
  const score = preVolumeCandidateScore(clean, categoryId)
    + livePromotionPriorityBonus(clean, categoryId);
  const practicalNearSssIntent = SEARCHAD_NEAR_SSS_PRACTICAL_INTENT_RE.test(clean);
  if (
    practicalNearSssIntent
    && writerReady
    && fragments <= 2
    && longTail >= 14
    && score >= 145
  ) return true;
  if (
    practicalNearSssIntent
    && knownPolicyOrFinance
    && fragments <= 3
    && longTail >= 12
    && score >= 135
  ) return true;
  if (
    writerReadyProbeIntent
    && fragments <= 3
    && longTail >= 12
    && score >= 120
  ) return true;
  return score >= 170;
}

function rowToBackfillResult(
  row: LiveSearchVolumeRow,
  categoryId: string,
): MDPResult | null {
  const keyword = normalizeKeyword(row.keyword);
  const pc = finiteNumber(row.pcSearchVolume) || 0;
  const mobile = finiteNumber(row.mobileSearchVolume) || 0;
  const volume = pc + mobile;
  const docs = finiteNumber(row.documentCount) || 0;
  if (volume <= 0 || docs <= 0) return null;
  if (!isLiveRadarUsableKeyword(keyword, volume, docs)) return null;
  const ratio = Number((volume / docs).toFixed(2));
  const actionable = isActionableGoldenKeyword(keyword)
    || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(keyword)
    || isStrongMeasuredNeedKeyword(keyword)
    || hasWriterReadySearchAdProbeIntent(keyword)
    || hasWriterReadySpecificity(keyword);
  const score = Math.max(liveMetricScore(volume, docs, ratio, actionable), liveUltimateOpportunityScore(keyword, volume, docs, ratio));
  const grade = liveGradeFromMetrics(score, volume, docs, ratio, keyword);
  const intentInfo = typeof classifyKeywordIntent === 'function'
    ? classifyKeywordIntent(keyword)
    : { intent: 'live-golden-discovery', badge: 'LIVE' };
  const result: MDPResult = {
    keyword,
    intent: intentInfo.intent,
    intentBadge: intentInfo.badge,
    searchVolume: volume,
    documentCount: docs,
    goldenRatio: ratio,
    score,
    grade,
    cpc: finiteNumber(row.monthlyAveCpc) || undefined,
    goldenReason: `라이브 보강 측정: 검색량 ${volume.toLocaleString()} / 문서수 ${docs.toLocaleString()} / 비율 ${ratio}`,
    hasSmartBlock: false,
    hasViewSection: true,
    hasInfluencer: false,
    difficultyScore: docs > 0 ? Math.min(10, Math.max(1, Math.ceil(docs / Math.max(1, volume)))) : 10,
    externalSources: ['mobile-live-seed-backfill'],
    measurementOnly: false,
    categoryMatched: inferLiveCategory(keyword, categoryId) === categoryId,
  };
  const enrichedResult = Object.assign(result, {
    pcSearchVolume: pc,
    mobileSearchVolume: mobile,
    monthlyAveCpc: finiteNumber(row.monthlyAveCpc) || undefined,
    ...measurementMetadataFromRow(row),
  });
  return isLiveRadarQualityResult(enrichedResult) ? enrichedResult : null;
}

function liveIssueFallbackGrade(score: number, docs: number | null): MobileResultGrade {
  if (docs === null && score >= 62) return 'A';
  if (docs === null && score >= 52) return 'B';
  if (docs !== null && docs <= 300 && score >= 78) return 'SS';
  if (docs !== null && docs <= 1_000 && score >= 68) return 'S';
  if (docs !== null && docs <= 5_000 && score >= 58) return 'A';
  if (docs !== null && docs <= 20_000 && score >= 45) return 'B';
  return 'C';
}

function liveIssueFallbackScore(keyword: string, docs: number | null): number {
  const scarcity = docs === null
    ? 0
    : docs <= 100
      ? 42
      : docs <= 300
        ? 36
        : docs <= 1_000
          ? 30
          : docs <= 3_000
            ? 22
            : docs <= 10_000
              ? 12
              : 4;
  const need = keywordNeedScore(keyword, 'live-issue-fallback');
  const longTail = keywordLongTailScore(keyword);
  return Math.min(88, Math.round(28 + scarcity + need * 0.45 + longTail * 0.35));
}

function metricFromLiveIssueFallback(keyword: string, categoryId: string, docs: number | null): MobileKeywordMetric | null {
  const clean = normalizeKeyword(keyword);
  if (!clean || !isLiveRadarUsableKeyword(clean, null, docs)) return null;
  if (!isActionableLiveKeyword(clean) && !SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean)) return null;
  if (docs !== null && docs > 20_000) return null;
  const score = liveIssueFallbackScore(clean, docs);
  const grade = liveIssueFallbackGrade(score, docs);
  if (grade === 'C') return null;
  return {
    keyword: clean,
    grade,
    score,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: null,
    documentCount: docs,
    goldenRatio: null,
    cpc: null,
    category: inferLiveCategory(clean, categoryId || 'live'),
    source: 'mobile-live-issue-document-radar',
    intent: 'live-issue-document-gap',
    evidence: [
      'realtime-source-signal',
      docs === null ? 'document-count-pending' : `document-count:${docs}`,
      'search-volume-not-yet-in-monthly-api',
    ],
    isMeasured: docs !== null,
  };
}

function mapDirectResult(result: MDPResult, categoryId: string): MobileKeywordMetric {
  const totalSearchVolume = finiteNumber(result.searchVolume);
  const documentCount = finiteNumber(result.documentCount);
  const keyword = normalizeKeyword(result.keyword);
  const extra = result as MDPResult & {
    pcSearchVolume?: number | null;
    mobileSearchVolume?: number | null;
    monthlyAveCpc?: number | null;
    searchVolumeSource?: MobileSearchVolumeSource;
    searchVolumeConfidence?: MobileMeasurementConfidence;
    isSearchVolumeEstimated?: boolean;
    documentCountSource?: MobileDocumentCountSource;
    documentCountConfidence?: MobileMeasurementConfidence;
    isDocumentCountEstimated?: boolean;
  };
  const measurementMeta = measurementMetadataFromRow(extra);
  return {
    keyword,
    grade: normalizeGrade(result.grade, finiteNumber(result.score) || 0),
    score: finiteNumber(result.score),
    pcSearchVolume: finiteNumber(extra.pcSearchVolume),
    mobileSearchVolume: finiteNumber(extra.mobileSearchVolume),
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(result.goldenRatio),
    cpc: finiteNumber(result.cpc) ?? finiteNumber(extra.monthlyAveCpc),
    category: inferLiveCategory(keyword, categoryId || 'live'),
    source: 'mobile-live-golden-radar',
    intent: result.intent || 'live-golden-discovery',
    evidence: [
      'mobile-live-golden-radar',
      result.goldenReason || '',
      ...(result.externalSources || []),
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null && documentCount !== null,
    ...measurementMeta,
  };
}

function resultFromMetrics(
  keywords: MobileKeywordMetric[],
  startedAtMs: number,
): MobileKeywordResult {
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: countSss(keywords),
      measured: keywords.filter((item) => item.isMeasured).length,
      elapsedMs: Date.now() - startedAtMs,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
}

function normalizeGate(value: MobileLiveGoldenRadarRunGate | boolean | undefined): MobileLiveGoldenRadarRunGate {
  if (value === false) return { ok: false, message: 'busy' };
  if (value && typeof value === 'object') return value;
  return { ok: true };
}

export const __liveGoldenRadarTestInternals = {
  buildBackfillCandidates,
  buildCacheDerivedCompoundNeedSeeds,
  buildDateAwareLiveSeedCandidates,
  buildMeasuredProbeCandidates,
  currentLottoRound,
  debugSearchAdMeasurableLiveCandidate,
  getLiveSeedBackfillIntents,
  getLiveDateHints,
  inferLiveCategory,
  isKnownPolicyProductNeedKeyword,
  isInvalidNonProductCommerceExpansion,
  isMeasuredProBoardFallbackMetric,
  isLiveMeasuredProbeCandidate,
  isLiveRadarUsableKeyword,
  isWeakAutogeneratedProbeCombo,
  isHighYieldSearchAdSpendCandidate,
  isPolicyProductActionKeyword,
  isSearchAdMeasurableLiveCandidate,
  isStaleOrFutureLiveKeyword,
  livePromotionPriorityBonus,
  measuredProbeQueueFamilyKey,
  normalizeLiveMetricGrade,
  normalizeLiveSeeds,
  boardScore,
  writerReadySssProbePriorityScore,
};

export class MobileLiveGoldenRadar {
  private readonly notificationInbox: MobileNotificationInbox | null;
  private readonly intervalMs: number;
  private readonly runOnStart: boolean;
  private readonly runOnStartDelayMs: number;
  private readonly cycleLimit: number;
  private readonly boardTarget: number;
  private readonly publicPreviewCount: number;
  private readonly boardFile?: string;
  private readonly resultCacheFile?: string;
  private readonly keywordCacheFile?: string;
  private readonly probeQueueFile?: string;
  private readonly maxSeeds: number;
  private readonly maxCandidates: number;
  private readonly startupCatchUpCycles: number;
  private readonly categories: string[];
  private readonly getEnvConfig: () => Partial<EnvConfig>;
  private readonly discover: (
    config: { clientId: string; clientSecret: string },
    options: Parameters<typeof discoverDirectGoldenKeywords>[1],
  ) => Promise<MDPResult[]>;
  private readonly liveSeedProvider?: (categoryId: string) => Promise<string[]>;
  private readonly measureLiveSearchVolumeSeparate: typeof getNaverKeywordSearchVolumeSeparate;
  private readonly measureLiveDocumentCount: typeof measureDocumentCount;
  private readonly autocompleteProvider: typeof getNaverAutocompleteKeywords;
  private readonly searchAdSuggestionProvider: typeof getNaverSearchAdKeywordSuggestions;
  private readonly hasCustomSearchAdSuggestionProvider: boolean;
  private readonly hasCustomLiveVolumeMeasure: boolean;
  private readonly hasCustomLiveDocumentMeasure: boolean;
  private readonly enableBackfill: boolean;
  private readonly refreshBoardFileOnSnapshot: boolean;
  private readonly shouldRun: () => MobileLiveGoldenRadarRunGate | boolean;
  private readonly setIntervalFn: (handler: () => void, intervalMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly setTimeoutFn: (handler: () => void, delayMs: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly now: () => Date;
  private timer: unknown = null;
  private startTimer: unknown = null;
  private quotaRetryTimer: unknown = null;
  private quotaRetryAtMs: number | null = null;
  private enabled = false;
  private running = false;
  private categoryIndex = 0;
  private totalRuns = 0;
  private successfulRuns = 0;
  private skippedRuns = 0;
  private failedRuns = 0;
  private publishedCount = 0;
  private boardUpdatedAt?: string;
  private readonly board = new Map<string, MobileLiveGoldenBoardItem>();
  private readonly cacheDerivedLiveSeeds: string[] = [];
  private readonly pendingMeasuredProbeQueue: LiveMeasuredProbeQueueItem[] = [];
  private lastBoardFileRefreshAtMs = 0;
  private lastCacheRefreshAtMs = 0;
  private cachedSnapshot: MobileLiveGoldenRadarSnapshot | null = null;
  private cachedSnapshotAtMs = 0;
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastError?: string;
  private lastMessage?: string;
  private documentQuotaBlockedForRun = false;

  constructor(options: MobileLiveGoldenRadarOptions = {}) {
    this.notificationInbox = options.notificationInbox || null;
    this.intervalMs = Math.max(180_000, Math.floor(
      options.intervalMs
        || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenIntervalMinutes * 60 * 1000,
    ));
    this.runOnStart = options.runOnStart !== false;
    this.runOnStartDelayMs = Math.max(5_000, Math.floor(options.runOnStartDelayMs ?? 15_000));
    this.cycleLimit = Math.max(8, Math.min(15, Math.floor(
      options.cycleLimit || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenCycleLimit,
    )));
    this.boardTarget = Math.max(10, Math.min(120, Math.floor(
      options.boardTarget || MOBILE_PC_PARITY_SLA.qualityFloors.goldenBulkSss,
    )));
    this.publicPreviewCount = Math.max(1, Math.min(10, Math.floor(options.publicPreviewCount || 5)));
    this.boardFile = normalizeKeyword(options.boardFile || '') || undefined;
    this.resultCacheFile = normalizeKeyword(options.resultCacheFile || '') || undefined;
    this.keywordCacheFile = normalizeKeyword(options.keywordCacheFile || '')
      || (this.resultCacheFile ? path.join(path.dirname(this.resultCacheFile), 'keyword-cache.json') : undefined);
    this.probeQueueFile = normalizeKeyword(options.probeQueueFile || '')
      || (
        this.boardFile || this.keywordCacheFile || this.resultCacheFile
          ? path.join(path.dirname((this.boardFile || this.keywordCacheFile || this.resultCacheFile) as string), LIVE_PROBE_QUEUE_FILE_NAME)
          : undefined
      );
    this.maxSeeds = Math.max(20, Math.min(1000, Math.floor(
      options.maxSeeds || Math.max(240, this.boardTarget * 8),
    )));
    this.maxCandidates = Math.max(120, Math.min(7200, Math.floor(
      options.maxCandidates || MOBILE_PC_PARITY_SLA.workerBudgets.liveGoldenMaxCandidates,
    )));
    this.startupCatchUpCycles = Math.max(1, Math.min(8, Math.floor(
      options.startupCatchUpCycles || Math.ceil(this.boardTarget / Math.max(1, this.cycleLimit)),
    )));
    this.categories = (options.categories || DEFAULT_CATEGORIES)
      .map((item) => normalizeKeyword(item))
      .filter(Boolean);
    this.getEnvConfig = options.getEnvConfig || (() => EnvironmentManager.getInstance().getConfig());
    this.discover = options.discover || discoverDirectGoldenKeywords;
    this.liveSeedProvider = options.liveSeedProvider;
    this.measureLiveSearchVolumeSeparate = options.measureLiveSearchVolumeSeparate || getNaverKeywordSearchVolumeSeparate;
    this.measureLiveDocumentCount = options.measureLiveDocumentCount || measureDocumentCount;
    this.autocompleteProvider = options.autocompleteProvider || getNaverAutocompleteKeywords;
    this.searchAdSuggestionProvider = options.searchAdSuggestionProvider || getNaverSearchAdKeywordSuggestions;
    this.hasCustomSearchAdSuggestionProvider = Boolean(options.searchAdSuggestionProvider);
    this.hasCustomLiveVolumeMeasure = Boolean(options.measureLiveSearchVolumeSeparate);
    this.hasCustomLiveDocumentMeasure = Boolean(options.measureLiveDocumentCount);
    this.enableBackfill = options.enableBackfill !== false;
    this.refreshBoardFileOnSnapshot = options.refreshBoardFileOnSnapshot === true;
    this.shouldRun = options.shouldRun || (() => true);
    this.setIntervalFn = options.setIntervalFn || ((handler, intervalMs) => setInterval(handler, intervalMs));
    this.clearIntervalFn = options.clearIntervalFn || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.setTimeoutFn = options.setTimeoutFn || ((handler, delayMs) => setTimeout(handler, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn || ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now || (() => new Date());
    this.loadMeasuredProbeQueueFromFile();
    this.loadBoardFromFile();
    this.loadMeasuredResultCacheFromFile();
    this.loadPersistentKeywordCacheFromFile();
    this.lastCacheRefreshAtMs = Date.now();
  }

  private async measureLiveSearchVolumeRows(
    config: Parameters<typeof getNaverKeywordSearchVolumeSeparate>[0],
    keywords: string[],
    options: { includeDocumentCount?: boolean },
    totalTimeoutMs: number,
  ): Promise<LiveSearchVolumeRow[]> {
    const startedAt = Date.now();
    const candidates = uniqueSearchAdMeasurementKeywords(keywords, Math.max(0, keywords.length))
      .filter((keyword) => {
        const clean = normalizeKeyword(keyword);
        if (!clean) return false;
        if (isSemanticallyMismatchedMeasuredProbe(clean)) return false;
        if (isWeakAutogeneratedProbeCombo(clean)) return false;
        return true;
      });
    const rows: LiveSearchVolumeRow[] = [];
    for (let i = 0; i < candidates.length; i += LIVE_SEARCHAD_VOLUME_BATCH_SIZE) {
      const remainingMs = Math.max(0, totalTimeoutMs - (Date.now() - startedAt));
      if (remainingMs <= LIVE_SEARCHAD_VOLUME_MIN_REMAINING_MS) break;
      const batch = candidates.slice(i, i + LIVE_SEARCHAD_VOLUME_BATCH_SIZE);
      const batchRows = await withTimeout(
        this.measureLiveSearchVolumeSeparate(config, batch, options),
        Math.min(LIVE_SEARCHAD_VOLUME_BATCH_TIMEOUT_MS, remainingMs),
        [],
      );
      rows.push(...batchRows);
    }
    return uniqueVolumeRows(rows, candidates.length);
  }

  start(): MobileLiveGoldenRadarSnapshot {
    if (this.enabled) return this.snapshot();
    this.enabled = true;
    if (this.refreshBoardFileOnSnapshot) {
      this.lastMessage = 'live golden read-only snapshot mode enabled';
      return this.snapshot();
    }
    this.timer = this.setIntervalFn(() => {
      const snapshot = this.snapshot();
      void (snapshot.boardCount < this.boardTarget
        ? this.runUntilTarget(this.startupCatchUpCycles)
        : this.runOnce());
    }, this.intervalMs);
    if (this.runOnStart) {
      this.startTimer = this.setTimeoutFn(() => {
        this.startTimer = null;
        void this.runUntilTarget(this.startupCatchUpCycles);
      }, this.runOnStartDelayMs);
    }
    this.lastMessage = 'live golden radar enabled';
    return this.snapshot();
  }

  stop(): MobileLiveGoldenRadarSnapshot {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    if (this.startTimer !== null) {
      this.clearTimeoutFn(this.startTimer);
      this.startTimer = null;
    }
    this.clearQuotaRetryTimer();
    this.enabled = false;
    this.lastMessage = 'live golden radar stopped';
    return this.snapshot();
  }

  private measuredSssReadyBoardCount(): number {
    const now = this.now();
    return this.sortedBoard()
      .filter((item) => isMeasuredSssBoardCandidate(item, now))
      .length;
  }

  private desiredSssReadyBoardCount(): number {
    return resolveDirectGoldenBulkSssTarget(this.boardTarget);
  }

  private needsSssDepthRefresh(snapshot: Pick<MobileLiveGoldenRadarSnapshot, 'board' | 'boardCount'>): boolean {
    if (snapshot.boardCount < this.boardTarget) return true;
    const now = this.now();
    return snapshot.board
      .filter((item) => isMeasuredSssBoardCandidate(item, now))
      .length < this.desiredSssReadyBoardCount();
  }

  private runLimitForCurrentBoard(): number {
    const currentCount = this.sortedBoard().length;
    if (currentCount >= this.boardTarget) return this.cycleLimit;
    const startupDivisor = Math.max(2, Math.min(4, this.startupCatchUpCycles));
    const fillTarget = Math.ceil(this.boardTarget / startupDivisor);
    return Math.min(60, Math.max(this.cycleLimit, fillTarget));
  }

  private backfillMeasurementLimit(targetLimit: number): number {
    const catchUpLimit = targetLimit >= Math.ceil(this.boardTarget * 0.5)
      ? Math.max(targetLimit, Math.ceil(this.boardTarget * 1.8))
      : targetLimit;
    return Math.max(
      24,
      Math.min(
        this.maxCandidates,
        LIVE_BACKFILL_VOLUME_PASS_MAX,
        Math.max(catchUpLimit, Math.floor(this.maxCandidates * 0.008)),
      ),
    );
  }

  private refreshMeasuredCachesFromDisk(force = false): void {
    const nowMs = Date.now();
    if (!force && nowMs - this.lastCacheRefreshAtMs < 60_000) return;
    this.lastCacheRefreshAtMs = nowMs;
    this.loadMeasuredResultCacheFromFile();
    this.loadPersistentKeywordCacheFromFile();
    if (!this.running) {
      this.pruneBoard();
    }
  }

  async runOnce(): Promise<MobileLiveGoldenRadarSnapshot> {
    if (this.running) return this.snapshot();
    const gate = normalizeGate(this.shouldRun());
    if (!gate.ok) {
      this.skippedRuns += 1;
      this.lastMessage = gate.message || 'skipped because worker is busy';
      return this.snapshot();
    }

    this.running = true;
    this.totalRuns += 1;
    this.lastStartedAt = this.now().toISOString();
    this.lastError = undefined;
    const categoryId = this.nextCategory();
    const startedAtMs = Date.now();
    this.refreshMeasuredCachesFromDisk(true);
    let referenceProbeCount = 0;
    const sssReadyBeforeRun = this.measuredSssReadyBoardCount();
    const desiredSssReady = this.desiredSssReadyBoardCount();
    const sssDepthShort = sssReadyBeforeRun < desiredSssReady;
    const runLimit = sssReadyBeforeRun < desiredSssReady
      ? Math.min(
        120,
        Math.max(
          this.runLimitForCurrentBoard(),
          Math.ceil(this.boardTarget * 0.7),
          desiredSssReady - sssReadyBeforeRun,
        ),
      )
      : this.runLimitForCurrentBoard();
    const discoveryLimit = sssDepthShort
      ? Math.min(300, Math.max(runLimit * 2, this.boardTarget, this.cycleLimit))
      : Math.min(420, Math.max(runLimit * 4, this.cycleLimit));

    try {
      const env = this.getEnvConfig();
      if (!env.naverClientId || !env.naverClientSecret) {
        throw new Error('Naver Open API config missing');
      }
      const documentQuotaBlocked = isNaverBlogOpenApiQuotaBlocked({
        clientId: env.naverClientId,
        clientSecret: env.naverClientSecret,
      }, this.now().getTime());
      const currentBoardCount = this.sortedBoard().length;
      const minimumVisibleBoard = Math.max(1, Math.min(this.publicPreviewCount || 1, this.boardTarget));
      const retryAt = documentQuotaBlocked
        ? getNaverBlogOpenApiQuotaBlockedUntil({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, this.now().getTime())
        : null;
      const canUseScrapeDocumentCounts = documentQuotaBlocked
        && hasSearchAdCredentials(env)
        && this.enableBackfill;
      if (documentQuotaBlocked && currentBoardCount < minimumVisibleBoard && !canUseScrapeDocumentCounts) {
        this.skippedRuns += 1;
        this.lastMessage = `Naver OpenAPI document quota exhausted; waiting for reset before publishing measured-only golden keywords${formatKstRetryAt(retryAt)}`;
        this.scheduleQuotaRetry(retryAt);
        this.running = false;
        this.lastFinishedAt = this.now().toISOString();
        return this.snapshot();
      }
      this.documentQuotaBlockedForRun = documentQuotaBlocked;
      if (documentQuotaBlocked) {
        this.scheduleQuotaRetry(retryAt);
      } else {
        this.clearQuotaRetryTimer();
      }
      referenceProbeCount = this.refreshMeasuredReferenceSssProbeQueue();

      const shouldAttemptCachePromotion = hasSearchAdCredentials(env)
        || currentBoardCount < minimumVisibleBoard;
      const catchUpModeBeforeCache = currentBoardCount < this.boardTarget;
      const promotedCacheCount = shouldAttemptCachePromotion
        ? await this.promotePendingMeasuredCacheWithSearchAdMetrics({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, Math.max(runLimit, this.boardTarget - currentBoardCount))
        : 0;
      const boardAfterCachePromotion = this.sortedBoard();
      const boardCountAfterCachePromotion = boardAfterCachePromotion.length;
      const desiredBoardSssCount = this.desiredSssReadyBoardCount();
      const boardSssReadyAfterCachePromotion = boardAfterCachePromotion
        .filter((item) => isMeasuredSssBoardCandidate(item, this.now()))
        .length;
      const shouldContinueAfterCachePromotion = boardSssReadyAfterCachePromotion < desiredBoardSssCount;
      if (
        catchUpModeBeforeCache
        && promotedCacheCount > 0
        && !shouldContinueAfterCachePromotion
        && (
          boardCountAfterCachePromotion >= this.boardTarget
          || boardCountAfterCachePromotion > currentBoardCount
        )
      ) {
        this.successfulRuns += 1;
        this.lastMessage = `cache catch-up promoted ${promotedCacheCount}; board ${boardCountAfterCachePromotion}/${this.boardTarget}; SSS ${boardSssReadyAfterCachePromotion}/${desiredBoardSssCount}`;
        return this.snapshot();
      }
      const liveSeeds = await this.collectLiveSeeds(categoryId);
      const directMaxCandidates = directCandidateBudget(this.maxCandidates, runLimit);
      const existingIdsForRun = new Set(this.board.keys());
      const existingClustersForRun = new Set([...this.board.values()]
        .filter((item) => !isOverbroadNoEffectBoardKeyword(item))
        .map((item) => keywordClusterKey(item.keyword))
        .filter(Boolean));
      const catchUpMode = this.sortedBoard().length < this.boardTarget;
      const backfillCategoryId = catchUpMode || sssDepthShort ? 'all' : categoryId;
      const hasRunnableProbeQueueForRun = this.runnableMeasuredProbeQueueItems(backfillCategoryId, runLimit).length > 0;
      let qualityDirect: MDPResult[] = [];
      let queuedProbeAttemptedCount = 0;
      let queuedProbeResultCount = 0;
      if (this.enableBackfill) {
        const queuedProbeDirect = await this.discoverQueuedProbeBackfill({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, backfillCategoryId, runLimit);
        queuedProbeAttemptedCount = queuedProbeDirect.attemptedCount;
        queuedProbeResultCount = queuedProbeDirect.results.length;
        if (queuedProbeDirect.results.length > 0) {
          qualityDirect = [...qualityDirect, ...queuedProbeDirect.results];
        }
        const shouldRunExpansionBackfill = queuedProbeDirect.attemptedCount === 0
          || queuedProbeDirect.results.length >= Math.min(3, runLimit)
          || sssDepthShort;
        const backfill = shouldRunExpansionBackfill
          ? await withTimeout(
            this.discoverBackfill({
            clientId: env.naverClientId,
            clientSecret: env.naverClientSecret,
            }, backfillCategoryId, liveSeeds, runLimit),
            LIVE_BACKFILL_STAGE_TIMEOUT_MS,
            [],
          )
          : [];
        if (backfill.length > 0) {
          qualityDirect = [...qualityDirect, ...backfill];
        }
      }

      let novelQualityCount = qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)).length;
      const desiredRunSssCount = Math.max(3, Math.min(runLimit, Math.ceil(runLimit * 0.65)));
      const novelSssCount = countSss(
        qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)),
      );
      const shouldDeferHeavyDirectToProbeQueue = this.enableBackfill
        && catchUpMode
        && hasRunnableProbeQueueForRun
        && !sssDepthShort
        && queuedProbeAttemptedCount > 0
        && queuedProbeResultCount > 0;
      const shouldRunHeavyDirect = (
        !shouldDeferHeavyDirectToProbeQueue
        && (
          !catchUpMode
          || !this.enableBackfill
          || novelQualityCount < runLimit
          || novelSssCount < desiredRunSssCount
        )
      ) && (
        novelQualityCount < runLimit
        || qualityDirect.length < runLimit
        || novelSssCount < desiredRunSssCount
      );
      if (shouldRunHeavyDirect && (
        novelQualityCount < runLimit
        || qualityDirect.length < runLimit
        || novelSssCount < desiredRunSssCount
      )) {
        const direct = await withTimeout(this.discover({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, {
          category: categoryId,
          limit: discoveryLimit,
          maxSeeds: this.maxSeeds,
          maxCandidates: directMaxCandidates,
          liveSeeds,
          includeCrossCategory: runLimit > this.cycleLimit,
          requireCategoryMatch: false,
          includeSearchAdSuggestions: !catchUpMode || sssDepthShort,
          suggestionSeedLimit: sssDepthShort
            ? Math.min(16, Math.max(8, Math.ceil(runLimit / 8)))
            : Math.min(48, Math.max(12, runLimit)),
          suggestionsPerSeed: sssDepthShort
            ? Math.min(30, Math.max(12, Math.ceil(runLimit * 0.25)))
            : Math.min(60, Math.max(18, Math.ceil(runLimit * 1.5))),
          maxSimilarPerCluster: 2,
        }), LIVE_DISCOVERY_TIMEOUT_MS, []);
        const directQuality = direct.filter(isLiveRadarQualityResult);
        if (directQuality.length > 0) {
          qualityDirect = [...qualityDirect, ...directQuality];
        }
      }

      novelQualityCount = qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)).length;
      if (this.enableBackfill && novelQualityCount < runLimit) {
        const globalBackfill = backfillCategoryId === 'all'
          ? []
          : await withTimeout(
            this.discoverBackfill({
              clientId: env.naverClientId,
              clientSecret: env.naverClientSecret,
            }, 'all', liveSeeds, runLimit),
            LIVE_GLOBAL_BACKFILL_STAGE_TIMEOUT_MS,
            [],
          );
        if (globalBackfill.length > 0) {
          qualityDirect = [...qualityDirect, ...globalBackfill];
        }
      }

      novelQualityCount = qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)).length;
      const matchedDirect = qualityDirect.filter((item) => item.categoryMatched === true);
      const unmatchedDirect = qualityDirect.filter((item) => item.categoryMatched !== true);
      const primaryPool = matchedDirect.length > 0 ? matchedDirect : qualityDirect;
      const rankedPrimary = rankGoldenDiscoveryResults(
        primaryPool,
        discoveryLimit,
        false,
        {
          honorRequestedLimit: true,
          diversifySimilarIntents: true,
          maxSimilarPerCluster: 2,
          strictVisibleSssOnly: false,
          requireActionableIntent: false,
          qualityBackfillToTarget: true,
        },
      );
      const rankedBackfill = rankedPrimary.length < runLimit && matchedDirect.length > 0
        ? rankGoldenDiscoveryResults(
          unmatchedDirect,
          discoveryLimit - rankedPrimary.length,
          false,
          {
            honorRequestedLimit: true,
            diversifySimilarIntents: true,
            maxSimilarPerCluster: 2,
            strictVisibleSssOnly: false,
            requireActionableIntent: false,
            qualityBackfillToTarget: true,
          },
        )
        : [];
      const existingIds = existingIdsForRun;
      const existingClusters = existingClustersForRun;
      const seen = new Set<string>();
      const ranked: MDPResult[] = [];
      const isNovel = (item: MDPResult) => isNovelMdpResult(item, existingIds, existingClusters);
      const rankedNovel = rankGoldenDiscoveryResults(
        qualityDirect.filter(isNovel),
        runLimit,
        false,
        {
          honorRequestedLimit: true,
          diversifySimilarIntents: true,
          maxSimilarPerCluster: 2,
          strictVisibleSssOnly: false,
          requireActionableIntent: false,
          qualityBackfillToTarget: true,
        },
      );
      appendUniqueMdpResults(ranked, rankedNovel, seen, runLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedPrimary, seen, runLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedBackfill, seen, runLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedPrimary, seen, runLimit);
      appendUniqueMdpResults(ranked, rankedBackfill, seen, runLimit);
      const rankedMetrics = ranked.map((item) => mapDirectResult(item, categoryId));
      const liveIssueFallback = rankedMetrics.length < runLimit && (this.enableBackfill || this.hasCustomLiveDocumentMeasure)
        ? await withTimeout(
          this.discoverLiveIssueFallback({
            clientId: env.naverClientId,
            clientSecret: env.naverClientSecret,
          }, categoryId, liveSeeds, runLimit),
          LIVE_ISSUE_FALLBACK_TIMEOUT_MS,
          [],
        )
        : [];
      const resultMetrics: MobileKeywordMetric[] = [...rankedMetrics];
      const metricSeen = new Set<string>();
      for (const metric of rankedMetrics) {
        metricSeen.add(`id:${keywordId(metric.keyword)}`);
        metricSeen.add(`compact:${keywordCompactId(metric.keyword)}`);
      }
      for (const metric of liveIssueFallback) {
        if (resultMetrics.length >= runLimit) break;
        const id = keywordId(metric.keyword);
        const compactId = keywordCompactId(metric.keyword);
        const cluster = keywordClusterKey(metric.keyword);
        if (
          metricSeen.has(`id:${id}`)
          || metricSeen.has(`compact:${compactId}`)
          || existingIds.has(id)
          || (cluster && existingClusters.has(cluster))
        ) {
          continue;
        }
        metricSeen.add(`id:${id}`);
        metricSeen.add(`compact:${compactId}`);
        resultMetrics.push(metric);
      }
      const publishableResultMetrics = resultMetrics
        .map((metric) => applyKeywordAiJudge(metric, { now: this.now() }))
        .filter((metric) => (
          isPublishableLiveResultMetric(metric, this.now())
          || isMeasuredProBoardFallbackMetric(metric as MobileLiveGoldenBoardItem, this.now())
        ));
      const result = resultFromMetrics(
        publishableResultMetrics,
        startedAtMs,
      );
      this.mergeBoard(result.keywords);
      const enrichedExisting = hasSearchAdCredentials(env)
        ? await this.enrichExistingBoardSearchAdMetrics({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        })
        : 0;
      const published = this.notificationInbox?.publishFromResult({
        product: 'golden-discovery',
        kind: 'live-golden',
        title: '실시간 황금키워드 발견',
        targetLabel: categoryId,
        result,
        limit: Math.min(4, runLimit),
      }) || [];

      this.publishedCount += published.length;
      this.successfulRuns += 1;
      const fallbackCount = result.keywords.filter((item) => item.source === 'mobile-live-issue-document-radar').length;
      const enrichParts = [
        promotedCacheCount > 0 ? `${promotedCacheCount} cache-promoted` : '',
        referenceProbeCount > 0 ? `${referenceProbeCount} sss-probes-queued` : '',
        enrichedExisting > 0 ? `${enrichedExisting} split-enriched` : '',
      ].filter(Boolean);
      const enrichSuffix = enrichParts.length > 0 ? `, ${enrichParts.join(', ')}` : '';
      this.lastMessage = fallbackCount > 0
        ? `${categoryId} ${result.summary.total} found (${fallbackCount} live issue fallback), ${published.length} published${enrichSuffix}`
        : `${categoryId} ${result.summary.total} found, ${published.length} published${enrichSuffix}`;
    } catch (err) {
      this.failedRuns += 1;
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = this.lastError;
    } finally {
      this.running = false;
      this.documentQuotaBlockedForRun = false;
      this.lastFinishedAt = this.now().toISOString();
    }

    return this.snapshot();
  }

  async runUntilTarget(maxCycles = this.startupCatchUpCycles): Promise<MobileLiveGoldenRadarSnapshot> {
    const cycleBudget = Math.max(1, Math.min(8, Math.floor(maxCycles)));
    let snapshot = this.snapshot();
    for (let cycle = 0; cycle < cycleBudget && this.needsSssDepthRefresh(snapshot); cycle += 1) {
      const beforeAttempts = this.totalRuns + this.skippedRuns + this.failedRuns;
      const beforeBoardCount = snapshot.boardCount;
      const beforeSssReady = snapshot.board.filter((item) => isMeasuredSssBoardCandidate(item, this.now())).length;
      snapshot = await this.runOnce();
      const afterAttempts = this.totalRuns + this.skippedRuns + this.failedRuns;
      const afterSssReady = snapshot.board.filter((item) => isMeasuredSssBoardCandidate(item, this.now())).length;
      if (snapshot.running || afterAttempts === beforeAttempts) break;
      if (this.skippedRuns > 0 && /busy|skipped/i.test(snapshot.lastMessage || '')) break;
      if (snapshot.boardCount <= beforeBoardCount && afterSssReady <= beforeSssReady) {
        const runnableQueueRemaining = this.runnableMeasuredProbeQueueItems('all', this.runLimitForCurrentBoard()).length;
        if (runnableQueueRemaining > 0 && cycle + 1 < cycleBudget) {
          this.lastMessage = `catch-up continuing: board ${snapshot.boardCount}/${this.boardTarget}; probe queue ${runnableQueueRemaining} runnable`;
          snapshot = this.snapshot();
          continue;
        }
        const queueSuffix = this.pendingMeasuredProbeQueue.length > 0
          ? `; probe queue ${this.pendingMeasuredProbeQueue.length} waiting for next interval`
          : '';
        this.lastMessage = `catch-up paused: no new measured publishable rows; board ${snapshot.boardCount}/${this.boardTarget}${queueSuffix}`;
        snapshot = this.snapshot();
        break;
      }
    }
    return snapshot;
  }

  private queueMeasuredProbeCandidates(
    candidates: string[],
    categoryId: string,
    source: string,
    priorityBoost = 0,
    persist = true,
  ): number {
    const now = this.now();
    const stamp = now.toISOString();
    const existingById = new Map(
      this.pendingMeasuredProbeQueue.map((item) => [keywordCompactId(item.keyword), item]),
    );
    let changed = 0;
    for (const raw of candidates) {
      const clean = normalizeKeyword(raw);
      if (!clean) continue;
      if (isWeakAutogeneratedProbeCombo(clean)) continue;
      const compact = keywordCompactId(clean);
      if (!compact) continue;
      const inferred = inferLiveCategory(clean, categoryId || 'all');
      if (!isLiveRadarUsableKeyword(clean, null, null, now)) continue;
      if (!isLiveMeasuredProbeCandidate(clean, inferred || categoryId, now)) continue;
      if (!isHighYieldSearchAdSpendCandidate(clean, inferred || categoryId, now)) continue;
      if (this.board.has(keywordId(clean))) continue;
      const directNeedBase = isMeasuredDirectNeedBase(clean, inferred || categoryId);
      const cacheDerivedPenalty = source === 'cache-derived-probe' && !directNeedBase
        ? 320
        : source === 'measured-reference-sss-probe' && !directNeedBase
          ? 180
          : 0;
      const priority = Math.round(
        preVolumeCandidateScore(clean, inferred || categoryId)
        + priorityBoost
        + writerReadySssProbePriorityScore(clean, inferred || categoryId)
        + (isLiveMeasuredProbeCandidate(clean, inferred || categoryId, now) ? 180 : 0)
        - cacheDerivedPenalty,
      );
      const existing = existingById.get(compact);
      if (existing) {
        if (priority > existing.priority || source !== existing.source) {
          existing.priority = Math.max(existing.priority, priority);
          existing.source = uniqueKeywords([existing.source, source], 4).join(',');
          existing.category = existing.category || inferred || categoryId || 'all';
          changed += 1;
        }
        continue;
      }
      this.pendingMeasuredProbeQueue.push({
        keyword: clean,
        category: inferred || categoryId || 'all',
        source,
        priority,
        firstSeenAt: stamp,
        attempts: 0,
        misses: 0,
      });
      changed += 1;
    }
    if (changed > 0) {
      this.pendingMeasuredProbeQueue.sort((a, b) => b.priority - a.priority || a.attempts - b.attempts);
      const trimmed = trimMeasuredProbeQueueFamilyFlood(this.pendingMeasuredProbeQueue)
        .slice(0, LIVE_PROBE_QUEUE_MAX_ITEMS);
      this.pendingMeasuredProbeQueue.splice(0, this.pendingMeasuredProbeQueue.length, ...trimmed);
      if (persist) this.saveMeasuredProbeQueueToFile();
    }
    return changed;
  }

  private runnableMeasuredProbeQueueItems(categoryId = 'all', targetLimit = this.cycleLimit): LiveMeasuredProbeQueueItem[] {
    const now = this.now();
    const nowMs = now.getTime();
    const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
    const limit = Math.max(72, Math.min(720, targetLimit * 24));
    const boardIds = new Set([...this.board.values()].map((item) => keywordCompactId(item.keyword)).filter(Boolean));
    const sorted = this.pendingMeasuredProbeQueue
      .filter((item) => {
        const compact = keywordCompactId(item.keyword);
        if (!compact || boardIds.has(compact)) return false;
        const effectiveCategory = measuredProbeEffectiveCategory(item, normalizedCategory);
        if (!isLiveMeasuredProbeCandidate(item.keyword, effectiveCategory, now)) return false;
        if (!isHighYieldSearchAdSpendCandidate(item.keyword, effectiveCategory, now)) return false;
        if (item.attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS) return false;
        if (item.misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) return false;
        const lastTriedAt = Date.parse(item.lastTriedAt || '');
        if (Number.isFinite(lastTriedAt) && nowMs - lastTriedAt < LIVE_PROBE_QUEUE_RETRY_DELAY_MS) return false;
        if (normalizedCategory === 'all') return true;
        if (effectiveCategory === normalizedCategory) return true;
        return categoryAcceptsMeasuredProbe(item.keyword, normalizedCategory);
      })
      .sort((a, b) => {
        const scoreDiff = measuredProbeQueueEffectiveScore(b) - measuredProbeQueueEffectiveScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt);
      });
    return selectDiverseMeasuredProbeQueueItems(sorted, limit);
  }

  private priorityMeasuredProbeQueueItems(categoryId = 'all', limit = this.cycleLimit): LiveMeasuredProbeQueueItem[] {
    const now = this.now();
    const nowMs = now.getTime();
    const normalizedCategory = normalizeKeyword(categoryId || 'all') || 'all';
    const boardIds = new Set([...this.board.values()].map((item) => keywordCompactId(item.keyword)).filter(Boolean));
    const seen = new Set<string>();
    const eligible: LiveMeasuredProbeQueueItem[] = [];
    for (const item of [...this.pendingMeasuredProbeQueue].sort((a, b) => {
      const scoreDiff = measuredProbeQueueEffectiveScore(b) - measuredProbeQueueEffectiveScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt);
    })) {
      const compact = keywordCompactId(item.keyword);
      if (!compact || seen.has(compact) || boardIds.has(compact)) continue;
      const effectiveCategory = measuredProbeEffectiveCategory(item, normalizedCategory);
      if (!isLiveMeasuredProbeCandidate(item.keyword, effectiveCategory, now)) continue;
      if (!isHighYieldSearchAdSpendCandidate(item.keyword, effectiveCategory, now)) continue;
      if (item.attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS || item.misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) continue;
      const lastTriedAt = Date.parse(item.lastTriedAt || '');
      if (Number.isFinite(lastTriedAt) && nowMs - lastTriedAt < LIVE_PROBE_QUEUE_RETRY_DELAY_MS) continue;
      if (
        normalizedCategory !== 'all'
        && effectiveCategory !== normalizedCategory
        && !categoryAcceptsMeasuredProbe(item.keyword, normalizedCategory)
      ) continue;
      seen.add(compact);
      eligible.push({
        ...item,
        category: effectiveCategory,
      });
    }
    return selectDiverseMeasuredProbeQueueItems(eligible, limit);
  }

  private hasRunnableMeasuredProbeQueue(): boolean {
    return this.runnableMeasuredProbeQueueItems('all', this.cycleLimit).length > 0;
  }

  private pendingMeasuredProbeKeywordsForRun(categoryId: string, targetLimit: number): string[] {
    return this.runnableMeasuredProbeQueueItems(categoryId, targetLimit).map((item) => item.keyword);
  }

  private updateMeasuredProbeQueueAfterMeasurement(
    attemptedKeywords: string[],
    volumeRows: LiveSearchVolumeRow[],
    enrichedRows: LiveSearchVolumeRow[],
  ): void {
    const attemptedIds = new Set(attemptedKeywords.map((keyword) => keywordCompactId(keyword)).filter(Boolean));
    if (attemptedIds.size === 0 || this.pendingMeasuredProbeQueue.length === 0) return;
    const volumeHitIds = new Set(
      volumeRows
        .filter((row) => ((finiteNumber(row.pcSearchVolume) || 0) + (finiteNumber(row.mobileSearchVolume) || 0)) > 0)
        .map((row) => keywordCompactId(row.keyword))
        .filter(Boolean),
    );
    const completeIds = new Set(
      enrichedRows
        .filter((row) => {
          const volume = (finiteNumber(row.pcSearchVolume) || 0) + (finiteNumber(row.mobileSearchVolume) || 0);
          const docs = finiteNumber(row.documentCount);
          return volume > 0 && docs !== null && docs > 0;
        })
        .map((row) => keywordCompactId(row.keyword))
        .filter(Boolean),
    );
    const stamp = this.now().toISOString();
    let changed = false;
    for (let index = this.pendingMeasuredProbeQueue.length - 1; index >= 0; index -= 1) {
      const item = this.pendingMeasuredProbeQueue[index];
      const compact = keywordCompactId(item.keyword);
      if (!compact || !attemptedIds.has(compact)) continue;
      if (completeIds.has(compact)) {
        this.pendingMeasuredProbeQueue.splice(index, 1);
        changed = true;
        continue;
      }
      item.attempts += 1;
      item.lastTriedAt = stamp;
      if (!volumeHitIds.has(compact)) item.misses += 1;
      if (item.attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS || item.misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) {
        this.pendingMeasuredProbeQueue.splice(index, 1);
      }
      changed = true;
    }
    if (changed) this.saveMeasuredProbeQueueToFile();
  }

  private updateMeasuredProbeQueueAfterSelectedItems(
    selectedItems: LiveMeasuredProbeQueueItem[],
    attemptedKeywords: string[],
    volumeRows: LiveSearchVolumeRow[],
    enrichedRows: LiveSearchVolumeRow[],
  ): void {
    const selectedIds = new Set(selectedItems.map((item) => keywordCompactId(item.keyword)).filter(Boolean));
    const attemptedIds = new Set(attemptedKeywords.map((keyword) => keywordCompactId(keyword)).filter(Boolean));
    for (const item of this.pendingMeasuredProbeQueue) {
      const compact = keywordCompactId(item.keyword);
      if (compact && attemptedIds.has(compact)) selectedIds.add(compact);
    }
    if (selectedIds.size === 0 || this.pendingMeasuredProbeQueue.length === 0) return;

    const variantOwnerIds = new Map<string, Set<string>>();
    for (const item of selectedItems) {
      const ownerId = keywordCompactId(item.keyword);
      if (!ownerId) continue;
      const variants = uniqueKeywords([
        item.keyword,
        ...searchAdProbeMeasurementVariants(item.keyword),
        ...attemptedKeywords.filter((keyword) => {
          const compact = keywordCompactId(keyword);
          return compact === ownerId || compact.startsWith(ownerId) || ownerId.startsWith(compact);
        }),
      ], 12);
      for (const variant of variants) {
        const variantId = keywordCompactId(variant);
        if (!variantId) continue;
        if (!variantOwnerIds.has(variantId)) variantOwnerIds.set(variantId, new Set());
        variantOwnerIds.get(variantId)?.add(ownerId);
      }
    }
    for (const attempted of attemptedKeywords) {
      const attemptedId = keywordCompactId(attempted);
      if (!attemptedId || !selectedIds.has(attemptedId)) continue;
      if (!variantOwnerIds.has(attemptedId)) variantOwnerIds.set(attemptedId, new Set());
      variantOwnerIds.get(attemptedId)?.add(attemptedId);
    }

    const ownersForRows = (rows: LiveSearchVolumeRow[], predicate: (row: LiveSearchVolumeRow) => boolean): Set<string> => {
      const out = new Set<string>();
      for (const row of rows) {
        if (!predicate(row)) continue;
        const rowId = keywordCompactId(row.keyword);
        const owners = rowId ? variantOwnerIds.get(rowId) : null;
        if (!owners) continue;
        for (const owner of owners) out.add(owner);
      }
      return out;
    };
    const volumeHitIds = ownersForRows(volumeRows, (row) => rowSearchVolume(row) > 0);
    const completeIds = ownersForRows(enrichedRows, (row) => {
      const volume = rowSearchVolume(row);
      const docs = finiteNumber(row.documentCount);
      return volume > 0 && docs !== null && docs > 0;
    });

    const stamp = this.now().toISOString();
    let changed = false;
    let touched = 0;
    let removed = 0;
    for (let index = this.pendingMeasuredProbeQueue.length - 1; index >= 0; index -= 1) {
      const item = this.pendingMeasuredProbeQueue[index];
      const compact = keywordCompactId(item.keyword);
      if (!compact || !selectedIds.has(compact)) continue;
      touched += 1;
      if (completeIds.has(compact)) {
        this.pendingMeasuredProbeQueue.splice(index, 1);
        removed += 1;
        changed = true;
        continue;
      }
      item.attempts += 1;
      item.lastTriedAt = stamp;
      if (!volumeHitIds.has(compact)) item.misses += 1;
      if (item.attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS || item.misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) {
        this.pendingMeasuredProbeQueue.splice(index, 1);
        removed += 1;
      }
      changed = true;
    }
    if (changed) {
      this.saveMeasuredProbeQueueToFile();
      console.info('[LIVE-GOLDEN] measured probe queue advanced', {
        selected: selectedIds.size,
        touched,
        removed,
        volumeHits: volumeHitIds.size,
        complete: completeIds.size,
        remaining: this.pendingMeasuredProbeQueue.length,
      });
    }
  }

  private loadMeasuredProbeQueueFromFile(): void {
    if (!this.probeQueueFile) return;
    try {
      if (!fs.existsSync(this.probeQueueFile)) return;
      const raw = fs.readFileSync(this.probeQueueFile, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.queue)
          ? parsed.queue
          : Array.isArray(parsed)
            ? parsed
            : [];
      const now = this.now();
      const seen = new Set<string>();
      for (const row of rows) {
        const keyword = normalizeKeyword(row?.keyword);
        const compact = keywordCompactId(keyword);
        if (!keyword || !compact || seen.has(compact)) continue;
        if (!isLiveRadarUsableKeyword(keyword, null, null, now)) continue;
        const category = inferLiveCategory(keyword, normalizeKeyword(row?.category) || 'all');
        if (!isLiveMeasuredProbeCandidate(keyword, category || 'all', now)) continue;
        if (!isHighYieldSearchAdSpendCandidate(keyword, category || 'all', now)) continue;
        const attempts = Math.max(0, Math.floor(finiteNumber(row?.attempts) || 0));
        const misses = Math.max(0, Math.floor(finiteNumber(row?.misses) || 0));
        if (attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS || misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) continue;
        seen.add(compact);
        this.pendingMeasuredProbeQueue.push({
          keyword,
          category: category || 'all',
          source: normalizeKeyword(row?.source) || 'persistent-probe-queue',
          priority: finiteNumber(row?.priority) ?? preVolumeCandidateScore(keyword, category || 'all'),
          firstSeenAt: normalizeKeyword(row?.firstSeenAt) || this.now().toISOString(),
          lastTriedAt: normalizeKeyword(row?.lastTriedAt) || undefined,
          attempts,
          misses,
        });
      }
      this.pendingMeasuredProbeQueue.sort((a, b) => b.priority - a.priority || a.attempts - b.attempts);
      const trimmed = trimMeasuredProbeQueueFamilyFlood(this.pendingMeasuredProbeQueue)
        .slice(0, LIVE_PROBE_QUEUE_MAX_ITEMS);
      this.pendingMeasuredProbeQueue.splice(0, this.pendingMeasuredProbeQueue.length, ...trimmed);
      if (this.pendingMeasuredProbeQueue.length !== rows.length) this.saveMeasuredProbeQueueToFile();
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `measured probe queue load failed: ${this.lastError}`;
    }
  }

  private countMeasuredProbeQueueFile(): number | null {
    if (!this.probeQueueFile) return null;
    try {
      if (!fs.existsSync(this.probeQueueFile)) return 0;
      const raw = fs.readFileSync(this.probeQueueFile, 'utf8').trim();
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.queue)
          ? parsed.queue
          : Array.isArray(parsed)
            ? parsed
            : [];
      const now = this.now();
      const seen = new Set<string>();
      let count = 0;
      for (const row of rows) {
        const keyword = normalizeKeyword(row?.keyword);
        const compact = keywordCompactId(keyword);
        if (!keyword || !compact || seen.has(compact)) continue;
        if (!isLiveRadarUsableKeyword(keyword, null, null, now)) continue;
        const category = inferLiveCategory(keyword, normalizeKeyword(row?.category) || 'all');
        if (!isLiveMeasuredProbeCandidate(keyword, category || 'all', now)) continue;
        if (!isHighYieldSearchAdSpendCandidate(keyword, category || 'all', now)) continue;
        const attempts = Math.max(0, Math.floor(finiteNumber(row?.attempts) || 0));
        const misses = Math.max(0, Math.floor(finiteNumber(row?.misses) || 0));
        if (attempts >= LIVE_PROBE_QUEUE_MAX_ATTEMPTS || misses >= LIVE_PROBE_QUEUE_NO_RESULT_MAX) continue;
        seen.add(compact);
        count += 1;
      }
      return count;
    } catch {
      return null;
    }
  }

  private saveMeasuredProbeQueueToFile(): void {
    if (!this.probeQueueFile) return;
    try {
      fs.mkdirSync(path.dirname(this.probeQueueFile), { recursive: true });
      const now = this.now();
      const filteredItems = this.pendingMeasuredProbeQueue
        .map((item) => ({
          ...item,
          category: measuredProbeEffectiveCategory(item, item.category || 'all'),
        }))
        .filter((item) => isLiveMeasuredProbeCandidate(item.keyword, item.category || 'all', now))
        .filter((item) => isHighYieldSearchAdSpendCandidate(item.keyword, item.category || 'all', now))
        .filter((item) => item.attempts < LIVE_PROBE_QUEUE_MAX_ATTEMPTS && item.misses < LIVE_PROBE_QUEUE_NO_RESULT_MAX)
        .sort((a, b) => b.priority - a.priority || a.attempts - b.attempts);
      const trimmedItems = trimMeasuredProbeQueueFamilyFlood(filteredItems)
        .slice(0, LIVE_PROBE_QUEUE_MAX_ITEMS);
      this.pendingMeasuredProbeQueue.splice(0, this.pendingMeasuredProbeQueue.length, ...trimmedItems);
      const payload = {
        version: 1,
        savedAt: this.now().toISOString(),
        items: trimmedItems,
      };
      const tmpFile = `${this.probeQueueFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.probeQueueFile);
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `measured probe queue save failed: ${this.lastError}`;
      console.warn('[LIVE-GOLDEN] measured probe queue save failed', {
        file: this.probeQueueFile,
        error: this.lastError,
      });
    }
  }

  private cacheDerivedPriorityBoost(volume: number | null, documents: number | null): number {
    if (volume === null || documents === null || volume <= 0 || documents <= 0) return 0;
    const ratio = volume / documents;
    const volumeScore = Math.min(120, Math.round(Math.log10(volume + 1) * 22));
    const scarcityScore = documents <= 300
      ? 180
      : documents <= 1_000
        ? 140
        : documents <= 3_000
          ? 95
          : documents <= 5_000
            ? 55
            : 0;
    const ratioScore = Math.min(220, Math.round(ratio * 3));
    return Math.max(0, Math.min(420, volumeScore + scarcityScore + ratioScore));
  }

  private shouldExpandMeasuredCacheSeed(
    keyword: string,
    categoryId: string,
    volume: number | null,
    documents: number | null,
  ): boolean {
    const clean = normalizeKeyword(keyword);
    if (!clean || volume === null || documents === null || volume <= 0 || documents <= 0) return false;
    if (isLottoLookupKeyword(clean) || isLowAdsenseLookupKeyword(clean) || isBrandSafetyNewsKeyword(clean)) return false;
    if (isThinProfileIntentKeyword(clean) || isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean)) return false;
    const ratio = volume / documents;
    const category = inferLiveCategory(clean, categoryId || 'all');
    const strategicCategory = LIVE_PROMOTION_STRATEGIC_CATEGORIES.has(category);
    const productOrTravel = PRODUCT_BASE_SIGNAL_RE.test(clean) || VENUE_TRAVEL_BASE_RE.test(clean);
    const writerReady = hasWriterReadySpecificity(clean)
      || hasWriterReadySearchAdProbeIntent(clean)
      || hasLiveUltimateNeedIntent(clean)
      || hasRobustActionableIntent(clean)
      || isActionableGoldenKeyword(clean);
    if (isBroadHeadSssKeyword(clean) && !writerReady) return false;
    if (volume >= 1_000 && documents <= 5_000 && ratio >= 5 && writerReady) return true;
    if (volume >= 500 && documents <= 10_000 && ratio >= 2 && writerReady) return true;
    if (strategicCategory && volume >= 500 && documents <= 20_000 && ratio >= 1.2 && writerReady) return true;
    if (productOrTravel && volume >= 300 && documents <= 30_000 && ratio >= 0.8) return true;
    if ((category === 'policy' || category === 'finance') && volume >= 1_000 && documents <= 30_000 && ratio >= 1.5) return true;
    return false;
  }

  private rememberCacheDerivedLiveSeeds(keyword: string, categoryId: string, priorityBoost = 0): void {
    const clean = normalizeKeyword(keyword);
    if (!clean || isNoisyLiveSeed(clean) || isThinProfileIntentKeyword(clean) || isLowValueLiveCandidate(clean)) return;
    const inferredCategory = inferLiveCategory(clean, categoryId || 'all');
    const intentCandidates = ultimateIntentFragmentCount(clean) >= 2
      ? [clean]
      : getLiveSeedBackfillIntents(clean, inferredCategory)
        .slice(0, 5)
        .filter((intent) => isUltimateIntentCompatible(clean, intent, inferredCategory))
        .map((intent) => appendCompatibleIntent(clean, intent))
        .filter(Boolean);
    const candidates = uniqueKeywords([
      ...(isMeasuredDirectNeedBase(clean, inferredCategory) ? [clean] : []),
      ...buildWriterReadyProbeCandidatesForSeed(clean, inferredCategory, 24),
      ...buildCacheDerivedCompoundNeedSeeds(clean, inferredCategory, 30),
      ...buildUltimateNeedCandidatesForSeed(clean, inferredCategory, 8),
      ...intentCandidates,
    ], 42)
      .filter((candidate) => isLiveRadarUsableKeyword(candidate, null, null, this.now()));
    for (const candidate of candidates) {
      if (this.cacheDerivedLiveSeeds.length >= 1200) break;
      const compact = keywordCompactId(candidate);
      if (!compact) continue;
      if (this.cacheDerivedLiveSeeds.some((seed) => keywordCompactId(seed) === compact)) continue;
      this.cacheDerivedLiveSeeds.push(candidate);
    }
    const directQueueCandidates = uniqueKeywords(
      candidates.filter((candidate) => isMeasuredDirectNeedBase(candidate, inferredCategory)),
      12,
    );
    if (directQueueCandidates.length > 0) {
      this.queueMeasuredProbeCandidates(
        directQueueCandidates,
        inferredCategory,
        'cache-derived-probe',
        40 + Math.min(priorityBoost, 120),
        false,
      );
    }
  }

  private refreshMeasuredReferenceSssProbeQueue(): number {
    if (!this.enableBackfill) return 0;
    const now = this.now();
    const references = this.measuredReferenceBoard(Math.max(240, this.boardTarget * 10))
      .filter((item) => {
        const keyword = normalizeKeyword(item.keyword);
        const volume = finiteNumber(item.totalSearchVolume) || 0;
        const docs = finiteNumber(item.documentCount) || 0;
        const ratio = finiteNumber(item.goldenRatio) || (volume > 0 && docs > 0 ? volume / docs : 0);
        if (!keyword || volume < LIVE_REFERENCE_SSS_PROBE_MIN_VOLUME || docs <= 0) return false;
        if (ratio < LIVE_REFERENCE_SSS_PROBE_MIN_RATIO) return false;
        if (isLottoLookupKeyword(keyword) || isLowAdsenseLookupKeyword(keyword) || isBrandSafetyNewsKeyword(keyword)) return false;
        if (!isMeasuredBoardReferenceMetric(item, now)) return false;
        if (!this.shouldExpandMeasuredCacheSeed(keyword, item.category || 'all', volume, docs)) return false;
        return true;
      })
      .slice(0, LIVE_REFERENCE_SSS_PROBE_LIMIT);

    let changed = 0;
    for (const item of references) {
      const keyword = normalizeKeyword(item.keyword);
      const category = inferLiveCategory(keyword, item.category || 'all');
      const volume = finiteNumber(item.totalSearchVolume) || 0;
      const docs = finiteNumber(item.documentCount) || 0;
      const candidateLimit = isOverbroadNoEffectBoardKeyword(item) || isBroadHeadSssKeyword(keyword)
        ? 54
        : 36;
      const intentCandidates = getLiveSeedBackfillIntents(keyword, category)
        .slice(0, 6)
        .filter((intent) => isUltimateIntentCompatible(keyword, intent, category))
        .map((intent) => appendCompatibleIntent(keyword, intent))
        .filter(Boolean);
      const candidates = uniqueKeywords([
        ...buildWriterReadyProbeCandidatesForSeed(keyword, category, Math.min(24, candidateLimit)),
        ...buildCacheDerivedCompoundNeedSeeds(keyword, category, candidateLimit),
        ...buildUltimateNeedCandidatesForSeed(keyword, category, Math.min(10, candidateLimit)),
        ...intentCandidates,
      ], candidateLimit)
        .filter((candidate) => keywordCompactId(candidate) !== keywordCompactId(keyword))
        .filter((candidate) => isLiveRadarUsableKeyword(candidate, null, null, now));
      if (candidates.length === 0) continue;
      const boost = LIVE_REFERENCE_SSS_PROBE_PRIORITY_BOOST
        + Math.min(this.cacheDerivedPriorityBoost(volume, docs), 240)
        + (isOverbroadNoEffectBoardKeyword(item) || isBroadHeadSssKeyword(keyword) ? 180 : 0);
      changed += this.queueMeasuredProbeCandidates(
        candidates,
        category,
        'measured-reference-sss-probe',
        boost,
        false,
      );
    }
    if (changed > 0) this.saveMeasuredProbeQueueToFile();
    return changed;
  }

  private async collectLiveSeeds(categoryId: string): Promise<string[]> {
    try {
      if (this.liveSeedProvider) {
        return normalizeLiveSeeds(await this.liveSeedProvider(categoryId), 140)
          .filter(isStrongLiveIssueSeed);
      }
      const fallbackSeeds = getDiscoveryCategorySeeds(categoryId, 60);
      const [
        signalRows,
        policyRows,
        issueRows,
      ] = await Promise.all([
        withTimeout(
          import('../utils/signal-bz-crawler').then(({ getSignalBzKeywords }) => getSignalBzKeywords(30)),
          LIVE_SEED_COLLECTION_TIMEOUT_MS,
          [],
        ),
        withTimeout(
          import('../utils/policy-briefing-api').then(({ getPolicyBriefingKeywords }) => getPolicyBriefingKeywords(30)),
          LIVE_SEED_COLLECTION_TIMEOUT_MS,
          [],
        ),
        withTimeout(
          import('../utils/entertainment-news-aggregator').then(({ fetchEntertainmentAggregate }) => fetchEntertainmentAggregate({
            maxMinutesAgo: 360,
            limitPerSource: 20,
          })),
          LIVE_SEED_COLLECTION_TIMEOUT_MS,
          [],
        ),
      ]);
      const allSignals = [
        ...(signalRows as Array<{ keyword?: string }>).map((row) => ({ keyword: row.keyword, categoryId: '' })),
        ...(policyRows as Array<{ keyword?: string; title?: string }>).map((row) => ({ keyword: row.keyword || row.title, categoryId: 'policy' })),
        ...(issueRows as Array<{ title?: string; category?: string }>).map((row) => ({ keyword: row.title, categoryId: row.category || 'celeb' })),
      ];
      const matched: string[] = [];
      const fallback: string[] = [];
      const needMatched: string[] = [];
      const needFallback: string[] = [];
      for (const signal of allSignals) {
        const keyword = normalizeKeyword(signal.keyword);
        if (!keyword) continue;
        const signalCategory = normalizeKeyword(signal.categoryId);
        if (!shouldUseLiveSourceSignalForGoldenBoard(keyword, signalCategory, categoryId)) continue;
        const needCandidates = buildUltimateNeedCandidatesForSeed(keyword, signalCategory || categoryId, 8)
          .filter((candidate) => shouldUseLiveSourceSignalForGoldenBoard(candidate, signalCategory, categoryId));
        const inferredCategory = inferLiveCategory(keyword, signalCategory || categoryId);
        if (categoryId === 'all' || signalCategory === categoryId || inferredCategory === categoryId) {
          matched.push(keyword);
          needMatched.push(...needCandidates);
        } else {
          fallback.push(keyword);
          needFallback.push(...needCandidates);
        }
      }
      return uniqueKeywords([
        ...needMatched,
        ...this.cacheDerivedLiveSeeds,
        ...normalizeLiveSeeds(matched, 120),
        ...needFallback,
        ...normalizeLiveSeeds(fallback, 80),
        ...fallbackSeeds.flatMap((seed) => buildUltimateNeedCandidatesForSeed(seed, categoryId, 8)),
        ...fallbackSeeds,
      ], 540);
    } catch {
      const fallbackSeeds = getDiscoveryCategorySeeds(categoryId, 120);
      return uniqueKeywords([
        ...this.cacheDerivedLiveSeeds,
        ...fallbackSeeds.flatMap((seed) => buildUltimateNeedCandidatesForSeed(seed, categoryId, 8)),
        ...fallbackSeeds,
      ], 360);
    }
  }

  private async attachDocumentCountsToVolumeRows(
    rows: LiveSearchVolumeRow[],
    categoryId: string,
    targetLimit: number,
  ): Promise<LiveSearchVolumeRow[]> {
    const now = this.now();
    const ranked = rows
      .filter((row) => {
        const keyword = normalizeKeyword(row.keyword);
        const volume = rowSearchVolume(row);
        if (!keyword || volume < 100) return false;
        return isLiveRadarUsableKeyword(keyword, volume, null, now);
      })
      .sort((a, b) => {
        const scoreDiff = preDocumentCandidateScore(b, categoryId) - preDocumentCandidateScore(a, categoryId);
        if (scoreDiff !== 0) return scoreDiff;
        return rowSearchVolume(b) - rowSearchVolume(a);
      })
      .slice(0, Math.min(
        LIVE_BACKFILL_DOCUMENT_PASS_MAX,
        Math.max(targetLimit * 5, 72),
      ));

    const measured: Array<{ index: number; row: LiveSearchVolumeRow }> = [];
    let cursor = 0;
    const workers = Array.from({ length: LIVE_BACKFILL_DOCUMENT_CONCURRENCY }, async () => {
      while (cursor < ranked.length) {
        const index = cursor;
        cursor += 1;
        const row = ranked[index];
        const keyword = normalizeKeyword(row.keyword);
        const volume = rowSearchVolume(row);
        const existingDocumentCount = finiteNumber(row.documentCount);
        if (existingDocumentCount !== null && existingDocumentCount > 0) {
          measured.push({ index, row: { ...row, documentCount: existingDocumentCount } });
          continue;
        }
        const dc = await withTimeout(
          this.measureLiveDocumentCount(keyword, {
            searchVolume: volume,
            scrapeTimeoutMs: 1600,
            scrapeOnly: this.documentQuotaBlockedForRun,
          }).catch(() => null),
          5000,
          null,
        );
        if (!dc || dc.isEstimated || dc.dc <= 0) continue;
        measured.push({ index, row: { ...row, documentCount: dc.dc, ...measurementMetadataFromDocumentCount(dc) } });
      }
    });
    await Promise.all(workers);
    return measured
      .sort((a, b) => a.index - b.index)
      .map((item) => item.row);
  }

  private async discoverAutocompleteBackfillCandidates(
    config: { clientId: string; clientSecret: string },
    categoryId: string,
    liveSeeds: string[],
    targetLimit: number,
  ): Promise<string[]> {
    const now = this.now();
    const limit = Math.max(80, Math.min(360, Math.floor(targetLimit * 24)));
    const seedLimit = Math.max(20, Math.min(60, Math.ceil(targetLimit * 4)));
    const seeds = uniqueKeywords([
      ...this.cacheDerivedLiveSeeds,
      ...normalizeLiveSeeds(liveSeeds, 80),
    ], 420)
      .map((seed) => normalizeRobustLiveSeedBase(seed, now))
      .filter(Boolean)
      .filter((seed) => !isUltimateLowValueLookupKeyword(seed))
      .filter((seed) => !LIVE_LOW_VALUE_TOPIC_RE.test(seed) && !LIVE_NEWS_ONLY_TOPIC_RE.test(seed))
      .filter((seed) => !LOW_VALUE_POLICY_FRAGMENT_RE.test(seed) && !LOW_VALUE_SYNTHETIC_CHAIN_RE.test(seed))
      .filter((seed) => !LOW_VALUE_PERSON_COMMERCE_RE.test(seed) && !isOverExpandedLiveCandidate(seed))
      .filter((seed) => ultimateIntentFragmentCount(seed) <= 2)
      .slice(0, seedLimit);
    if (seeds.length === 0) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    let cursor = 0;
    const push = (keyword: string, fallbackCategory: string): void => {
      if (out.length >= limit) return;
      const clean = normalizeKeyword(keyword);
      if (!clean) return;
      const knownPolicyNeed = isKnownPolicyProductNeedKeyword(clean);
      if (!knownPolicyNeed && isLowValueLiveCandidate(clean)) return;
      if (!knownPolicyNeed && isOverExpandedLiveCandidate(clean)) return;
      if (!knownPolicyNeed && isNoisyLiveSeed(clean)) return;
      if (!knownPolicyNeed && !isLiveRadarUsableKeyword(clean, null, null, now)) return;
      const inferred = inferLiveCategory(clean, fallbackCategory || categoryId);
      if (
        categoryId !== 'all'
        && inferred !== categoryId
        && fallbackCategory !== categoryId
        && !(knownPolicyNeed && normalizeKeyword(categoryId) === 'policy')
      ) return;
      const hasNeed = knownPolicyNeed
        || hasLiveUltimateNeedIntent(clean)
        || isActionableLiveKeyword(clean)
        || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
      if (!hasNeed) return;
      const compact = keywordCompactId(clean);
      if (!compact || seen.has(compact)) return;
      seen.add(compact);
      out.push(clean);
    };
    const workers = Array.from({ length: Math.min(3, seeds.length) }, async () => {
      while (cursor < seeds.length && out.length < limit) {
        const seed = seeds[cursor];
        cursor += 1;
        const seedCategory = inferLiveCategory(seed, categoryId);
        const suggestions = await withTimeout(
          this.autocompleteProvider(seed, config).catch(() => [] as string[]),
          8000,
          [],
        );
        for (const suggestion of suggestions) {
          push(suggestion, seedCategory);
          if (out.length >= limit) break;
        }
      }
    });
    await Promise.all(workers);
    return uniqueKeywords(out, limit);
  }

  private async discoverSearchAdSuggestionBackfillCandidates(
    categoryId: string,
    liveSeeds: string[],
    targetLimit: number,
  ): Promise<LiveSearchVolumeRow[]> {
    const env = this.getEnvConfig();
    const searchAdConfig = searchAdConfigFromEnv(env);
    if (!searchAdConfig) return [];
    if (!this.hasCustomSearchAdSuggestionProvider && !hasLikelyProductionSearchAdCredentials(env)) return [];

    const now = this.now();
    const sssDepthMode = targetLimit >= Math.ceil(this.boardTarget * 0.5);
    const limit = Math.max(80, Math.min(
      sssDepthMode ? 420 : 220,
      Math.floor(targetLimit * (sssDepthMode ? 18 : 14)),
    ));
    const seedLimit = Math.max(12, Math.min(
      sssDepthMode ? 60 : 24,
      Math.ceil(targetLimit * (sssDepthMode ? 2.4 : 1.6)),
    ));
    const catalogSeeds = measuredProbeCategoryKeys(categoryId, liveSeeds)
      .flatMap((key) => LIVE_MEASURED_PROBE_BASES[key] || [])
      .map((seed) => normalizeKeyword(seed))
      .filter(Boolean);
    const seeds = uniqueKeywords([
      ...this.cacheDerivedLiveSeeds,
      ...catalogSeeds,
      ...catalogSeeds.map((seed) => seed.replace(/\s+/g, '')),
      ...normalizeLiveSeeds(liveSeeds, 80),
      ...getDiscoveryCategorySeeds(categoryId, 48),
    ], 520)
      .map((seed) => normalizeRobustLiveSeedBase(seed, now) || normalizeKeyword(seed))
      .filter(Boolean)
      .filter((seed) => !isUltimateLowValueLookupKeyword(seed))
      .filter((seed) => !isLowValueLiveCandidate(seed) && !isOverExpandedLiveCandidate(seed))
      .filter((seed) => !isNoisyLiveSeed(seed))
      .slice(0, seedLimit);
    if (seeds.length === 0) return [];

    const scored = new Map<string, { keyword: string; score: number; index: number; row: LiveSearchVolumeRow }>();
    let cursor = 0;
    let order = 0;
    const push = (
      suggestion: any,
      rowScore: number,
      fallbackCategory: string,
    ): void => {
      const keyword = (suggestion as any).keyword;
      const clean = normalizeKeyword(keyword);
      if (!clean || scored.size >= limit) return;
      if (isLowValueLiveCandidate(clean) || isOverExpandedLiveCandidate(clean) || isNoisyLiveSeed(clean)) return;
      const pc = finiteNumber((suggestion as any).pcSearchVolume) || 0;
      const mobile = finiteNumber((suggestion as any).mobileSearchVolume) || 0;
      const total = finiteNumber((suggestion as any).totalSearchVolume) ?? (pc + mobile);
      const writerReady = hasWriterReadySpecificity(clean) || hasWriterReadySearchAdProbeIntent(clean);
      const intentFragments = ultimateIntentFragmentCount(clean);
      if (total >= 100_000 && !writerReady) return;
      if (total >= 30_000 && intentFragments < 2 && !writerReady) return;
      const inferred = inferLiveCategory(clean, fallbackCategory || categoryId);
      if (
        categoryId !== 'all'
        && inferred !== categoryId
        && !categoryAcceptsMeasuredProbe(clean, categoryId)
      ) return;
      if (!isLiveRadarUsableKeyword(clean, null, null, now)) return;
      if (!isHighYieldSearchAdSpendCandidate(clean, inferred || categoryId, now)) return;
      const key = keywordCompactId(clean);
      if (!key) return;
      const score = rowScore
        + preVolumeCandidateScore(clean, inferred || categoryId)
        + livePromotionPriorityBonus(clean, inferred || categoryId)
        + writerReadySssProbePriorityScore(clean, inferred || categoryId)
        + (hasWriterReadyOpportunityIntent(clean) ? 180 : 0)
        + (writerReady ? 120 : 0)
        - (total >= 30_000 && intentFragments < 2 ? 160 : 0);
      const existing = scored.get(key);
      if (existing && existing.score >= score) return;
      scored.set(key, {
        keyword: clean,
        score,
        index: order++,
        row: {
          keyword: clean,
          pcSearchVolume: pc,
          mobileSearchVolume: mobile,
          documentCount: null,
          competition: normalizeKeyword((suggestion as any).competition) || null,
          monthlyAveCpc: finiteNumber((suggestion as any).monthlyAveCpc),
          searchVolumeSource: 'searchad',
          searchVolumeConfidence: 'high',
          isSearchVolumeEstimated: false,
        } as LiveSearchVolumeRow,
      });
    };

    const workers = Array.from({ length: Math.min(2, seeds.length) }, async () => {
      while (cursor < seeds.length && scored.size < limit) {
        const seed = seeds[cursor];
        cursor += 1;
        const fallbackCategory = inferLiveCategory(seed, categoryId);
        const suggestions = await withTimeout(
          this.searchAdSuggestionProvider(searchAdConfig, seed, 80).catch(() => []),
          10_000,
          [],
        );
        for (const suggestion of suggestions) {
          const total = finiteNumber((suggestion as any).totalSearchVolume)
            ?? ((finiteNumber((suggestion as any).pcSearchVolume) || 0) + (finiteNumber((suggestion as any).mobileSearchVolume) || 0));
          if (total === null || total < 300) continue;
          push(suggestion, Math.min(180, Math.log10(total + 10) * 34), fallbackCategory);
          if (scored.size >= limit) break;
        }
      }
    });
    await Promise.all(workers);

    return [...scored.values()]
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.row)
      .slice(0, limit);
  }

  private async discoverQueuedProbeBackfill(
    config: { clientId: string; clientSecret: string },
    categoryId: string,
    targetLimit = this.cycleLimit,
  ): Promise<{ results: MDPResult[]; attemptedCount: number }> {
    const measurementLimit = Math.min(240, this.backfillMeasurementLimit(targetLimit));
    const prioritizedItems = this.priorityMeasuredProbeQueueItems(categoryId, measurementLimit * 2);
    const diverseItems = this.runnableMeasuredProbeQueueItems(categoryId, targetLimit);
    const queuedProbeItems: LiveMeasuredProbeQueueItem[] = [];
    const queuedIds = new Set<string>();
    for (const item of [...prioritizedItems, ...diverseItems]) {
      if (queuedProbeItems.length >= measurementLimit) break;
      const compact = keywordCompactId(item.keyword);
      if (!compact || queuedIds.has(compact)) continue;
      queuedIds.add(compact);
      queuedProbeItems.push(item);
    }
    if (queuedProbeItems.length === 0) return { results: [], attemptedCount: 0 };

    const categoryById = new Map<string, string>();
    const candidates: string[] = [];
    const seenCandidateKeywords = new Set<string>();
    const candidateLimit = Math.min(480, Math.max(measurementLimit, measurementLimit * 2));
    const variantsByItem = queuedProbeItems.map((item) => {
      const effectiveCategory = measuredProbeEffectiveCategory(item, categoryId || 'all');
      return {
        effectiveCategory,
        variants: searchAdProbeMeasurementVariants(item.keyword)
          .filter((variant) => isHighYieldSearchAdSpendCandidate(variant, effectiveCategory, this.now())),
      };
    }).filter((entry) => entry.variants.length > 0);
    for (let depth = 0; candidates.length < candidateLimit; depth += 1) {
      let added = false;
      for (const entry of variantsByItem) {
        if (candidates.length >= candidateLimit) break;
        const variant = entry.variants[depth];
        if (!variant) continue;
        const compact = keywordCompactId(variant);
        const exact = normalizeKeyword(variant);
        if (!compact || !exact || seenCandidateKeywords.has(exact)) continue;
        if (!categoryById.has(compact)) categoryById.set(compact, entry.effectiveCategory);
        seenCandidateKeywords.add(exact);
        candidates.push(variant);
        added = true;
      }
      if (!added) break;
    }
    if (candidates.length === 0) return { results: [], attemptedCount: 0 };

    const volumeRows = await this.measureLiveSearchVolumeRows(config, candidates, {
      includeDocumentCount: false,
    }, Math.min(LIVE_BACKFILL_TIMEOUT_MS, 90_000));
    const rows = await this.attachDocumentCountsToVolumeRows(volumeRows, categoryId, targetLimit);
    this.updateMeasuredProbeQueueAfterSelectedItems(queuedProbeItems, candidates, volumeRows, rows);

    const seen = new Set<string>();
    const out: MDPResult[] = [];
    const rejectedRows: Array<{ keyword: string; volume: number; docs: number; ratio: number; grade?: MobileResultGrade }> = [];
    for (const row of rows) {
      const rowCategory = categoryById.get(keywordCompactId(row.keyword)) || categoryId || 'all';
      const item = rowToBackfillResult(row, rowCategory);
      if (!item) {
        const volume = rowSearchVolume(row);
        const docs = finiteNumber(row.documentCount) || 0;
        rejectedRows.push({
          keyword: normalizeKeyword(row.keyword),
          volume,
          docs,
          ratio: docs > 0 ? Number((volume / docs).toFixed(2)) : 0,
        });
        continue;
      }
      const id = mdpResultId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        ...item,
        score: Math.min(100, (item.score || 0) + 6),
        externalSources: uniqueKeywords([
          ...(item.externalSources || []),
          'queued-measured-probe-direct',
        ], 8),
      });
    }
    console.info('[LIVE-GOLDEN] queued probe direct pass', {
      categoryId,
      queuedItems: queuedProbeItems.length,
      candidates: candidates.length,
      sample: candidates.slice(0, 8),
      volumeRows: volumeRows.length,
      rows: rows.length,
      results: out.length,
      rejectedRows: rejectedRows.slice(0, 8),
    });
    return {
      results: rankGoldenDiscoveryResults(out, targetLimit, false, {
        honorRequestedLimit: true,
        diversifySimilarIntents: true,
        maxSimilarPerCluster: 2,
        strictVisibleSssOnly: false,
        requireActionableIntent: false,
        qualityBackfillToTarget: true,
      }),
      attemptedCount: candidates.length,
    };
  }

  private async discoverBackfill(
    config: { clientId: string; clientSecret: string },
    categoryId: string,
    liveSeeds: string[],
    targetLimit = this.cycleLimit,
  ): Promise<MDPResult[]> {
    const measuredProbeCandidates = buildMeasuredProbeCandidates(
      categoryId,
      liveSeeds,
      this.maxSeeds,
      this.now(),
    );
    const measurementLimit = this.backfillMeasurementLimit(targetLimit);
    const queuedProbeItems = this.runnableMeasuredProbeQueueItems(categoryId, targetLimit);
    const queuedProbeCandidates = queuedProbeItems.map((item) => item.keyword);
    const queueFirstMode = queuedProbeCandidates.length >= Math.min(
      measurementLimit,
      Math.max(24, targetLimit),
    );
    const hasMeasuredProbeCandidates = measuredProbeCandidates.length > 0;
    const autocompleteTargetLimit = hasMeasuredProbeCandidates
      ? Math.max(4, Math.ceil(targetLimit * 0.45))
      : targetLimit;
    const suggestionTargetLimit = queueFirstMode
      ? Math.max(targetLimit, Math.ceil(this.boardTarget * 0.7))
      : targetLimit;
    const autocompleteCandidates = queueFirstMode
      ? []
      : await this.discoverAutocompleteBackfillCandidates(
        config,
        categoryId,
        liveSeeds,
        autocompleteTargetLimit,
      );
    const searchAdSuggestionRows = await this.discoverSearchAdSuggestionBackfillCandidates(
      categoryId,
      liveSeeds,
      suggestionTargetLimit,
    );
    const searchAdSuggestionCandidates = searchAdSuggestionRows.map((row) => row.keyword);
    const queuedProbePriorityById = new Map(
      queuedProbeItems
        .map((item) => [keywordCompactId(item.keyword), item.priority] as const)
        .filter(([id]) => Boolean(id)),
    );
    const queuedProbeCategoryById = new Map(
      queuedProbeItems
        .map((item) => [keywordCompactId(item.keyword), normalizeKeyword(item.category) || categoryId || 'all'] as const)
        .filter(([id]) => Boolean(id)),
    );
    const measuredProbeCandidateIds = new Set(
      measuredProbeCandidates.map((keyword) => keywordCompactId(keyword)).filter(Boolean),
    );
    const autocompleteCandidateIds = new Set(
      autocompleteCandidates.map((keyword) => keywordCompactId(keyword)).filter(Boolean),
    );
    const searchAdSuggestionCandidateIds = new Set(
      searchAdSuggestionCandidates.map((keyword) => keywordCompactId(keyword)).filter(Boolean),
    );
    const queuedProbeCandidateIds = new Set(
      queuedProbeCandidates.map((keyword) => keywordCompactId(keyword)).filter(Boolean),
    );
    const candidates = uniqueKeywords([
      ...queuedProbeCandidates,
      ...measuredProbeCandidates,
      ...searchAdSuggestionCandidates,
      ...autocompleteCandidates,
      ...buildBackfillCandidates(categoryId, liveSeeds, this.maxSeeds, this.now()),
    ], this.maxSeeds);
    if (candidates.length === 0) return [];
    this.queueMeasuredProbeCandidates(candidates, categoryId, 'backfill-candidate', 40, false);
    const rankedCandidates = candidates
      .map((keyword, index) => ({
        keyword,
        index,
        score: preVolumeCandidateScore(keyword, categoryId)
          + (
            measuredProbeCandidateIds.has(keywordCompactId(keyword))
            || isLiveMeasuredProbeCandidate(keyword, categoryId, this.now())
              ? 420
              : 0
          )
          + (autocompleteCandidateIds.has(keywordCompactId(keyword)) ? 40 : 0)
          + (searchAdSuggestionCandidateIds.has(keywordCompactId(keyword)) ? 260 : 0)
          + (queuedProbeCandidateIds.has(keywordCompactId(keyword))
            ? 420 + Math.min(260, Math.max(0, queuedProbePriorityById.get(keywordCompactId(keyword)) || 0))
            : 0),
      }))
      .filter((item) => item.score > -100)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return a.index - b.index;
      })
      .map((item) => item.keyword);
    const probeCategoryFor = (keyword: string): string => (
      queuedProbeCategoryById.get(keywordCompactId(keyword)) || categoryId || 'all'
    );
    const queuedSearchAdCandidates = queuedProbeCandidates
      .filter((keyword) => isHighYieldSearchAdSpendCandidate(keyword, probeCategoryFor(keyword), this.now()));
    const measuredSearchAdCandidates = uniqueKeywords([
      ...queuedSearchAdCandidates,
      ...measuredProbeCandidates,
    ], measurementLimit)
      .filter((keyword) => isHighYieldSearchAdSpendCandidate(keyword, probeCategoryFor(keyword), this.now()));
    const measuredSearchAdIds = new Set(
      measuredSearchAdCandidates.map((keyword) => keywordCompactId(keyword)).filter(Boolean),
    );
    const suggestedRowIds = new Set(
      searchAdSuggestionRows.map((row) => keywordCompactId(row.keyword)).filter(Boolean),
    );
    const fallbackSearchAdCandidates = rankedCandidates
      .filter((keyword) => !measuredSearchAdIds.has(keywordCompactId(keyword)))
      .filter((keyword) => !suggestedRowIds.has(keywordCompactId(keyword)))
      .filter((keyword) => isHighYieldSearchAdSpendCandidate(keyword, probeCategoryFor(keyword), this.now()));
    const suggestionRowsForRun = uniqueVolumeRows(searchAdSuggestionRows, measurementLimit);
    const searchAdCandidates = uniqueKeywords([
      ...measuredSearchAdCandidates,
      ...fallbackSearchAdCandidates,
    ], Math.max(0, measurementLimit - suggestionRowsForRun.length));
    const measuredVolumeRows = searchAdCandidates.length > 0
      ? await this.measureLiveSearchVolumeRows(config, searchAdCandidates, {
        includeDocumentCount: false,
      }, LIVE_BACKFILL_TIMEOUT_MS)
      : [];
    const volumeRows = uniqueVolumeRows([
      ...suggestionRowsForRun,
      ...measuredVolumeRows,
    ], measurementLimit);
    const rows = await this.attachDocumentCountsToVolumeRows(volumeRows, categoryId, targetLimit);
    this.updateMeasuredProbeQueueAfterMeasurement(
      uniqueKeywords([
        ...suggestionRowsForRun.map((row) => row.keyword),
        ...searchAdCandidates,
      ], measurementLimit * 2),
      volumeRows,
      rows,
    );
    const seen = new Set<string>();
    const out: MDPResult[] = [];
    let documentCountSupplements = 0;
    for (const row of rows) {
      const pc = finiteNumber(row.pcSearchVolume) || 0;
      const mobile = finiteNumber(row.mobileSearchVolume) || 0;
      const volume = pc + mobile;
      let enrichedRow = row;
      if (
        (row.documentCount === null || row.documentCount === undefined || row.documentCount <= 0)
        && volume >= 100
        && documentCountSupplements < LIVE_BACKFILL_DOCUMENT_SUPPLEMENT_MAX
      ) {
        documentCountSupplements += 1;
        const measuredDc = await withTimeout(
          this.measureLiveDocumentCount(row.keyword, {
            searchVolume: volume,
            scrapeTimeoutMs: 1500,
            scrapeOnly: this.documentQuotaBlockedForRun,
          }).catch(() => null),
          3500,
          null,
        );
        if (measuredDc && !measuredDc.isEstimated && measuredDc.dc > 0) {
          enrichedRow = { ...row, documentCount: measuredDc.dc, ...measurementMetadataFromDocumentCount(measuredDc) };
        }
      }
      const item = rowToBackfillResult(enrichedRow, categoryId);
      if (!item) continue;
      const isAutocompleteExact = autocompleteCandidateIds.has(keywordCompactId(enrichedRow.keyword));
      const prioritizedItem = isAutocompleteExact
        ? {
          ...item,
          score: Math.min(100, (item.score || 0) + 8),
          goldenReason: `${item.goldenReason || ''} · 자동완성 실측 원문 우선`,
          externalSources: uniqueKeywords([
            ...(item.externalSources || []),
            'autocomplete-exact-measured',
          ], 8),
        }
        : item;
      const id = mdpResultId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(prioritizedItem);
    }
    return rankGoldenDiscoveryResults(out, targetLimit, false, {
      honorRequestedLimit: true,
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: false,
      requireActionableIntent: false,
      qualityBackfillToTarget: true,
    });
  }

  private async discoverLiveIssueFallback(
    config: { clientId: string; clientSecret: string },
    categoryId: string,
    liveSeeds: string[],
    targetLimit = this.cycleLimit,
  ): Promise<MobileKeywordMetric[]> {
    const liveSeedBases = normalizeLiveSeeds(liveSeeds, 36).filter(isStrongLiveIssueSeed);
    if (liveSeedBases.length === 0) return [];

    const liveBaseIds = liveSeedBases.map((seed) => keywordCompactId(seed)).filter(Boolean);
    const maxPerLiveSeed = Math.max(2, Math.ceil(targetLimit / Math.max(1, liveBaseIds.length)) + 1);
    const isFromLiveSeed = (keyword: string): boolean => {
      const compact = keywordCompactId(keyword);
      return liveBaseIds.some((seedId) => compact.startsWith(seedId) || seedId.startsWith(compact));
    };
    const liveSeedKeyForCandidate = (keyword: string): string => {
      const compact = keywordCompactId(keyword);
      return liveBaseIds.find((seedId) => compact.startsWith(seedId) || seedId.startsWith(compact)) || compact;
    };
    const candidateCountsBySeed = new Map<string, number>();
    const candidates = buildBackfillCandidates(categoryId, liveSeedBases, Math.min(this.maxSeeds, 240), this.now())
      .filter(isFromLiveSeed)
      .filter((keyword) => {
        const clean = normalizeKeyword(keyword);
        if (!clean || isMalformedLiveKeyword(clean) || isThinProfileIntentKeyword(clean)) return false;
        if (!isLiveRadarUsableKeyword(clean, null, null)) return false;
        return isActionableLiveKeyword(clean) || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
      })
      .filter((keyword) => {
        const sourceKey = liveSeedKeyForCandidate(keyword);
        const count = candidateCountsBySeed.get(sourceKey) || 0;
        if (count >= maxPerLiveSeed) return false;
        candidateCountsBySeed.set(sourceKey, count + 1);
        return true;
      })
      .filter((keyword) => isHighYieldSearchAdSpendCandidate(keyword, categoryId, this.now()))
      .slice(0, Math.max(LIVE_ISSUE_FALLBACK_DOCUMENT_LIMIT, targetLimit * 2));

    const seen = new Set<string>();
    const out: MobileKeywordMetric[] = [];
    const pushMetric = (metric: MobileKeywordMetric): void => {
      const compactId = keywordCompactId(metric.keyword);
      if (!compactId || seen.has(compactId)) return;
      seen.add(compactId);
      out.push(metric);
    };
    const volumeRows = await this.measureLiveSearchVolumeRows(config, candidates, {
      includeDocumentCount: false,
    }, LIVE_BACKFILL_TIMEOUT_MS);
    let documentCountSupplements = 0;
    for (const row of volumeRows) {
      const pc = finiteNumber(row.pcSearchVolume) || 0;
      const mobile = finiteNumber(row.mobileSearchVolume) || 0;
      const volume = pc + mobile;
      let enrichedRow = row;
      if (
        (row.documentCount === null || row.documentCount === undefined || row.documentCount <= 0)
        && volume >= 100
        && documentCountSupplements < LIVE_ISSUE_DOCUMENT_SUPPLEMENT_MAX
      ) {
        documentCountSupplements += 1;
        const measuredDc = await withTimeout(
          this.measureLiveDocumentCount(row.keyword, {
            searchVolume: volume,
            scrapeTimeoutMs: 1500,
            scrapeOnly: this.documentQuotaBlockedForRun,
          }).catch(() => null),
          3500,
          null,
        );
        if (measuredDc && !measuredDc.isEstimated && measuredDc.dc > 0) {
          enrichedRow = { ...row, documentCount: measuredDc.dc, ...measurementMetadataFromDocumentCount(measuredDc) };
        }
      }
      const result = rowToBackfillResult(enrichedRow, categoryId);
      if (!result) continue;
      pushMetric({
        ...mapDirectResult(result, categoryId),
        source: 'mobile-live-issue-measured-radar',
        intent: result.intent || 'live-issue-measured-gap',
        evidence: [
          'mobile-live-issue-measured-radar',
          'searchad-live-issue-volume',
          result.goldenReason || '',
          ...(result.externalSources || []),
        ].filter(Boolean),
      });
      if (out.length >= targetLimit) break;
    }
    return out
      .sort((a, b) => {
        const gradeDelta = (GRADE_WEIGHT[b.grade] || 0) - (GRADE_WEIGHT[a.grade] || 0);
        if (gradeDelta !== 0) return gradeDelta;
        const scoreDelta = (b.score || 0) - (a.score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return (a.documentCount || Number.MAX_SAFE_INTEGER) - (b.documentCount || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, targetLimit);
  }

  snapshot(): MobileLiveGoldenRadarSnapshot {
    const nowMs = Date.now();
    if (
      !this.running
      && this.refreshBoardFileOnSnapshot
      && this.cachedSnapshot
      && nowMs - this.cachedSnapshotAtMs < LIVE_SNAPSHOT_CACHE_MS
    ) {
      return this.cachedSnapshot;
    }
    if (!this.running && this.refreshBoardFileOnSnapshot) {
      this.refreshBoardFromFile(false);
    } else if (!this.running) {
      this.refreshMeasuredCachesFromDisk(false);
    }
    const board = this.sortedBoard();
    const publicPreviewIds = new Set(this.selectPublicPreview(board).map((item) => item.id));
    const markedBoard = board.map((item) => applyKeywordAiJudge({
      ...item,
      isPublicPreview: publicPreviewIds.has(item.id),
      publishDecision: evaluatePublishDecision(item),
    }));
    const filePendingProbeQueueCount = !this.running && this.refreshBoardFileOnSnapshot
      ? this.countMeasuredProbeQueueFile()
      : null;
    const snapshot: MobileLiveGoldenRadarSnapshot = {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      cycleLimit: this.cycleLimit,
      maxCandidates: this.maxCandidates,
      boardTarget: this.boardTarget,
      boardCount: markedBoard.length,
      pendingProbeQueueCount: filePendingProbeQueueCount ?? this.pendingMeasuredProbeQueue.length,
      publicPreviewCount: markedBoard.filter((item) => item.isPublicPreview).length,
      boardUpdatedAt: this.boardUpdatedAt,
      board: markedBoard,
      publicPreview: markedBoard.filter((item) => item.isPublicPreview),
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      skippedRuns: this.skippedRuns,
      failedRuns: this.failedRuns,
      publishedCount: this.publishedCount,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      nextRetryAt: this.quotaRetryAtMs ? new Date(this.quotaRetryAtMs).toISOString() : undefined,
      lastError: this.lastError,
      lastMessage: this.lastMessage,
      nextCategoryId: this.categories[this.categoryIndex] || 'all',
      categories: [...this.categories],
    };
    if (!this.running && this.refreshBoardFileOnSnapshot) {
      this.cachedSnapshot = snapshot;
      this.cachedSnapshotAtMs = Date.now();
    }
    return snapshot;
  }

  findMeasuredBoardItem(keyword: string): MobileLiveGoldenBoardItem | null {
    const compact = keywordCompactId(keyword);
    if (!compact) return null;
    const now = this.now();
    const nowMs = now.getTime();
    return [...this.board.values()]
      .filter((item) => keywordCompactId(item.keyword) === compact)
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .filter((item) => isMeasuredBoardReferenceMetric(item, now))
      .sort((a, b) => {
        const scoreDiff = boardSortScore(b, nowMs) - boardSortScore(a, nowMs);
        if (scoreDiff !== 0) return scoreDiff;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })[0] || null;
  }

  private measuredReferenceBoard(limit: number = Math.max(240, this.boardTarget * 12)): MobileLiveGoldenBoardItem[] {
    const now = this.now();
    const nowMs = now.getTime();
    return [...this.board.values()]
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .filter((item) => isMeasuredBoardReferenceMetric(item, now))
      .sort((a, b) => {
        const scoreDiff = boardSortScore(b, nowMs) - boardSortScore(a, nowMs);
        if (scoreDiff !== 0) return scoreDiff;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, limit);
  }

  private persistedBoardItems(): MobileLiveGoldenBoardItem[] {
    const visible = this.sortedBoard();
    const seen = new Set(visible.map((item) => item.id));
    const references = this.measuredReferenceBoard()
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    return [...visible, ...references];
  }

  private clearQuotaRetryTimer(): void {
    if (this.quotaRetryTimer !== null) {
      this.clearTimeoutFn(this.quotaRetryTimer);
      this.quotaRetryTimer = null;
    }
    this.quotaRetryAtMs = null;
  }

  private scheduleQuotaRetry(retryAtMs: number | null): void {
    if (!retryAtMs || !this.enabled) return;
    const delayMs = liveQuotaRetryDelayMs(retryAtMs, this.now().getTime(), this.intervalMs);
    this.clearQuotaRetryTimer();
    this.quotaRetryAtMs = retryAtMs;
    this.quotaRetryTimer = this.setTimeoutFn(() => {
      this.quotaRetryTimer = null;
      this.quotaRetryAtMs = null;
      if (!this.enabled) return;
      const snapshot = this.snapshot();
      void (snapshot.boardCount < this.boardTarget
        ? this.runUntilTarget(this.startupCatchUpCycles)
        : this.runOnce());
    }, delayMs);
  }

  private selectPublicPreview(board: MobileLiveGoldenBoardItem[]): MobileLiveGoldenBoardItem[] {
    if (this.publicPreviewCount <= 0 || board.length <= 0) return [];
    const now = this.now();
    const nowMs = now.getTime();
    const requestedPreviewCount = Math.min(this.publicPreviewCount, board.length);
    const protectedTopCount = board.length > requestedPreviewCount
      ? Math.min(PUBLIC_PREVIEW_PROTECTED_TOP_COUNT, Math.max(0, board.length - requestedPreviewCount))
      : 0;
    const freeBoard = board.slice(protectedTopCount);
    const count = Math.min(this.publicPreviewCount, freeBoard.length);
    if (count <= 0) return [];
    const isFresh = (item: MobileLiveGoldenBoardItem) => ageMsFrom(item.updatedAt, nowMs) <= PUBLIC_PREVIEW_MAX_AGE_MS;
    const isPreviewGrade = (item: MobileLiveGoldenBoardItem) => {
      if (item.grade === 'B' || item.grade === 'C') return false;
      const decision = evaluatePublishDecision(item);
      return decision.verdict === 'publish' && decision.score >= 80;
    };
    const sourceMap = new Map<string, MobileLiveGoldenBoardItem>();
    const pushSource = (items: MobileLiveGoldenBoardItem[]) => {
      for (const item of items) {
        if (!sourceMap.has(item.id)) sourceMap.set(item.id, item);
      }
    };
    const previewSource = freeBoard
      .filter(isPublicPreviewCandidate)
      .filter(isFresh);
    const metricSource = freeBoard
      .filter(isPreviewGrade)
      .filter((item) => isLiveRadarUsableMetric(item, now))
      .filter(isFresh);
    const freshFallback = freeBoard
      .filter(isPublicPreviewFallbackCandidate)
      .filter(isFresh);
    const warmMetricSource = protectedTopCount > 0
      ? freeBoard
        .filter(isPreviewGrade)
        .filter((item) => isLiveRadarUsableMetric(item, now))
        .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      : [];
    const warmFallback = protectedTopCount > 0
      ? freeBoard
        .filter(isPublicPreviewFallbackCandidate)
        .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      : [];
    const protectedBackfill = protectedTopCount > count * 2
      ? board
        .slice(Math.max(count * 2, protectedTopCount - count), protectedTopCount)
        .filter(isPublicPreviewFallbackCandidate)
        .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      : [];
    pushSource(previewSource);
    pushSource(metricSource);
    pushSource(freshFallback);
    pushSource(warmMetricSource);
    pushSource(warmFallback);
    pushSource(protectedBackfill);
    const source = [...sourceMap.values()];

    const lowerRecent = [...source]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, count * 4);
    const lowerTail = source.slice(-count * 4);
    const poolMap = new Map<string, MobileLiveGoldenBoardItem>();
    for (const item of [...lowerRecent, ...lowerTail]) {
      poolMap.set(item.id, item);
    }
    const pool = [...poolMap.values()];
    const rotation = Math.floor(this.now().getTime() / PUBLIC_PREVIEW_ROTATION_MS) + this.totalRuns;
    const rotated = rotateItems(pool, rotation);
    const selected: MobileLiveGoldenBoardItem[] = [];
    const selectedCategories = new Set<string>();
    const selectedClusters = new Set<string>();
    let selectedProfileIntents = 0;

    for (const item of rotated) {
      if (selected.length >= count) break;
      const profileIntent = isThinProfileIntentKeyword(item.keyword);
      if (profileIntent && selectedProfileIntents >= PUBLIC_PREVIEW_PROFILE_INTENT_MAX) continue;
      const cluster = publicPreviewClusterKey(item.keyword);
      if (cluster && selectedClusters.has(cluster)) continue;
      const category = normalizeKeyword(item.category);
      if (category && selectedCategories.has(category) && selectedCategories.size < count) continue;
      selected.push(item);
      if (profileIntent) selectedProfileIntents++;
      if (category) selectedCategories.add(category);
      if (cluster) selectedClusters.add(cluster);
    }

    for (const item of rotated) {
      if (selected.length >= count) break;
      if (selected.some((entry) => entry.id === item.id)) continue;
      const profileIntent = isThinProfileIntentKeyword(item.keyword);
      if (profileIntent && selectedProfileIntents >= PUBLIC_PREVIEW_PROFILE_INTENT_MAX) continue;
      const cluster = publicPreviewClusterKey(item.keyword);
      if (cluster && selectedClusters.has(cluster) && rotated.length - selected.length >= count) continue;
      selected.push(item);
      if (profileIntent) selectedProfileIntents++;
      if (cluster) selectedClusters.add(cluster);
    }

    for (const item of rotated) {
      if (selected.length >= count) break;
      if (selected.some((entry) => entry.id === item.id)) continue;
      const profileIntent = isThinProfileIntentKeyword(item.keyword);
      if (profileIntent && selectedProfileIntents >= PUBLIC_PREVIEW_PROFILE_INTENT_MAX) continue;
      selected.push(item);
      if (profileIntent) selectedProfileIntents++;
    }

    return selected;
  }

  private nextCategory(): string {
    const categoryId = this.categories[this.categoryIndex] || 'all';
    this.categoryIndex = (this.categoryIndex + 1) % Math.max(1, this.categories.length);
    return categoryId;
  }

  private mergeBoard(
    keywords: MobileKeywordMetric[],
    options: { pruneAndSave?: boolean } = {},
  ): void {
    if (keywords.length === 0) return;
    const shouldPruneAndSave = options.pruneAndSave !== false;
    const stamp = this.now().toISOString();
    const now = this.now();
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeKeyword(keyword.keyword);
      if (!normalizedKeyword || keyword.grade === 'C') continue;
      if (!hasCompleteLiveGoldenMetrics(keyword)) continue;
      const normalizedMetric = { ...keyword, keyword: normalizedKeyword };
      if (!isLiveRadarUsableMetric(normalizedMetric, now) && !isMeasuredProExactKeywordMetric(normalizedMetric, now)) continue;
      const id = keywordId(normalizedKeyword);
      const compactId = keywordCompactId(normalizedKeyword);
      const existing = this.board.get(id)
        || [...this.board.values()].find((item) => keywordCompactId(item.keyword) === compactId);
      const incomingVolume = finiteNumber(keyword.totalSearchVolume);
      const docs = finiteNumber(keyword.documentCount);
      const incomingPc = finiteNumber(keyword.pcSearchVolume);
      const incomingMobile = finiteNumber(keyword.mobileSearchVolume);
      const incomingSplitTotal = incomingPc !== null && incomingMobile !== null
        ? incomingPc + incomingMobile
        : 0;
      const existingPc = finiteNumber(existing?.pcSearchVolume);
      const existingMobile = finiteNumber(existing?.mobileSearchVolume);
      const existingSplitTotal = existingPc !== null && existingMobile !== null
        ? existingPc + existingMobile
        : 0;
      const pcSearchVolume = incomingSplitTotal > 0
        ? incomingPc
        : existingSplitTotal > 0
          ? existingPc
          : incomingPc;
      const mobileSearchVolume = incomingSplitTotal > 0
        ? incomingMobile
        : existingSplitTotal > 0
          ? existingMobile
          : incomingMobile;
      const splitTotal = pcSearchVolume !== null && mobileSearchVolume !== null
        ? pcSearchVolume + mobileSearchVolume
        : 0;
      const volume = splitTotal > 0 ? splitTotal : incomingVolume;
      const ratio = volume !== null && docs !== null && docs > 0
        ? Number((volume / docs).toFixed(2))
        : finiteNumber(keyword.goldenRatio);
      const opportunityScore = volume !== null && docs !== null && docs > 0 && ratio !== null
        ? liveUltimateOpportunityScore(normalizedKeyword, volume, docs, ratio)
        : finiteNumber(keyword.score);
      const incomingCpc = finiteNumber(keyword.cpc);
      const existingCpc = finiteNumber(existing?.cpc);
      const cpc = incomingCpc !== null && incomingCpc > 0
        ? incomingCpc
        : existingCpc !== null && existingCpc > 0
          ? existingCpc
          : incomingCpc ?? existingCpc;
      const searchVolumeSource = incomingSplitTotal > 0
        ? keyword.searchVolumeSource
        : existing?.searchVolumeSource || keyword.searchVolumeSource;
      const searchVolumeConfidence = incomingSplitTotal > 0
        ? keyword.searchVolumeConfidence
        : existing?.searchVolumeConfidence || keyword.searchVolumeConfidence;
      const isSearchVolumeEstimated = incomingSplitTotal > 0
        ? keyword.isSearchVolumeEstimated
        : existing?.isSearchVolumeEstimated ?? keyword.isSearchVolumeEstimated;
      const documentCountSource = keyword.documentCountSource || existing?.documentCountSource;
      const documentCountConfidence = keyword.documentCountConfidence || existing?.documentCountConfidence;
      const isDocumentCountEstimated = keyword.isDocumentCountEstimated ?? existing?.isDocumentCountEstimated;
      const metric = {
        ...keyword,
        pcSearchVolume,
        mobileSearchVolume,
        totalSearchVolume: volume ?? keyword.totalSearchVolume,
        cpc,
        searchVolumeSource,
        searchVolumeConfidence,
        isSearchVolumeEstimated,
        documentCountSource,
        documentCountConfidence,
        isDocumentCountEstimated,
      };
      const grade = volume !== null && docs !== null && docs > 0 && ratio !== null
        ? normalizeLiveMetricGrade(normalizedKeyword, keyword.grade, opportunityScore, volume, docs, ratio)
        : keyword.grade;
      if (grade === 'C') continue;
      const judgedMetric = applyKeywordAiJudge({
        ...metric,
        keyword: normalizedKeyword,
        grade,
        score: opportunityScore ?? finiteNumber(keyword.score),
        goldenRatio: ratio,
      });
      if (judgedMetric.aiJudge?.verdict === 'exclude') continue;
      const boardId = existing?.id || id;
      const item: MobileLiveGoldenBoardItem = {
        ...judgedMetric,
        keyword: normalizedKeyword,
        grade: judgedMetric.grade,
        goldenRatio: ratio,
        id: boardId,
        rank: existing?.rank || 0,
        discoveredAt: existing?.discoveredAt || stamp,
        updatedAt: stamp,
        freshness: 'live',
        isPublicPreview: false,
        publicSearchVolumeLabel: formatRange(metric.totalSearchVolume, 'search'),
        publicDocumentCountLabel: formatRange(keyword.documentCount, 'document'),
        publicReason: publicReason({ ...metric, grade, goldenRatio: ratio }),
      };
      this.board.set(boardId, item);
    }

    if (shouldPruneAndSave) {
      this.pruneBoard();
      this.boardUpdatedAt = stamp;
      this.saveBoardToFile();
    }
  }

  private async enrichExistingBoardSearchAdMetrics(config: { clientId: string; clientSecret: string }): Promise<number> {
    const nowMs = this.now().getTime();
    const candidates = [...this.board.values()]
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .filter((item) => hasCompleteLiveGoldenMetrics(item))
      .filter((item) => isLiveRadarUsableMetric(item, this.now()))
      .filter((item) => !hasMeasuredPcMobileSplit(item) || !hasRealCpcValue(item))
      .filter((item) => isHighYieldSearchAdSpendCandidate(item.keyword, item.category || 'all', this.now()))
      .sort((a, b) => splitEnrichmentPriorityScore(b, nowMs) - splitEnrichmentPriorityScore(a, nowMs))
      .slice(0, LIVE_BOARD_SPLIT_ENRICHMENT_LIMIT);
    if (candidates.length === 0) return 0;

    const rows = await this.measureLiveSearchVolumeRows(config, candidates.map((item) => item.keyword), {
      includeDocumentCount: false,
    }, LIVE_SPLIT_ENRICHMENT_TIMEOUT_MS);
    if (rows.length === 0) return 0;

    const byCompactId = new Map<string, MobileLiveGoldenBoardItem>();
    for (const item of candidates) {
      const compactId = keywordCompactId(item.keyword);
      if (compactId) byCompactId.set(compactId, item);
    }

    const stamp = this.now().toISOString();
    let changed = 0;
    for (const row of rows) {
      const keyword = normalizeKeyword(row.keyword);
      const item = this.board.get(keywordId(keyword)) || byCompactId.get(keywordCompactId(keyword));
      if (!item) continue;
      const pc = finiteNumber(row.pcSearchVolume);
      const mobile = finiteNumber(row.mobileSearchVolume);
      const measuredVolume = (pc || 0) + (mobile || 0);
      if (pc === null || mobile === null || measuredVolume <= 0) continue;
      const docs = finiteNumber(item.documentCount);
      if (docs === null || docs <= 0) continue;
      const ratio = Number((measuredVolume / docs).toFixed(2));
      const cpcValue = finiteNumber(row.monthlyAveCpc);
      const existingCpc = finiteNumber(item.cpc);
      const cpc = cpcValue !== null && cpcValue > 0
        ? cpcValue
        : existingCpc !== null && existingCpc > 0
          ? existingCpc
          : null;
      const grade = normalizeLiveMetricGrade(
        item.keyword,
        item.grade,
        finiteNumber(item.score),
        measuredVolume,
        docs,
        ratio,
      );
      const opportunityScore = liveUltimateOpportunityScore(item.keyword, measuredVolume, docs, ratio);
      const evidence = [
        ...(Array.isArray(item.evidence) ? item.evidence : []),
        'searchad-pc-mobile-split-enriched',
        (row as any).svEstimated ? 'searchad-volume-estimated' : '',
      ].map((entry) => normalizeKeyword(entry)).filter(Boolean);
      this.board.set(item.id, {
        ...item,
        grade,
        pcSearchVolume: pc,
        mobileSearchVolume: mobile,
        totalSearchVolume: measuredVolume,
        goldenRatio: ratio,
        score: opportunityScore,
        cpc,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: (row as any).svEstimated === true,
        updatedAt: stamp,
        freshness: 'live',
        evidence: [...new Set(evidence)].slice(0, 10),
        publicSearchVolumeLabel: formatRange(measuredVolume, 'search'),
        publicDocumentCountLabel: formatRange(docs, 'document'),
      });
      changed += 1;
    }

    if (changed > 0) {
      this.pruneBoard();
      this.boardUpdatedAt = stamp;
      this.saveBoardToFile();
    }
    return changed;
  }

  private async promotePendingMeasuredCacheWithSearchAdMetrics(
    config: { clientId: string; clientSecret: string },
    targetLimit: number,
  ): Promise<number> {
    const nowMs = this.now().getTime();
    const now = this.now();
    const measurementLimit = Math.min(
      LIVE_CACHE_PROMOTION_MAX_CANDIDATES,
      Math.max(5, Math.floor(targetLimit * 4)),
    );
    const candidates = [...this.board.values()]
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .filter((item) => hasCompleteLiveGoldenMetrics(item))
      .filter((item) => isCachePromotionMeasurementCandidate(item, now))
      .filter((item) => !hasMeasuredPcMobileSplit(item))
      .filter((item) => isMeasuredCacheSearchAdSplitCandidate(item.keyword, item.category || 'all', now))
      .filter((item) => !LIVE_PROMOTION_SYNTHETIC_INTENT_CHAIN_RE.test(normalizeKeyword(item.keyword)))
      .filter((item) => livePromotionPriorityBonus(item.keyword, item.category || 'all') > -300)
      .sort((a, b) => splitEnrichmentPriorityScore(b, nowMs) - splitEnrichmentPriorityScore(a, nowMs))
      .slice(0, measurementLimit);
    if (candidates.length === 0) {
      console.info('[LIVE-GOLDEN] cache promotion skipped: no candidates', {
        boardSize: this.board.size,
        targetLimit,
      });
      return 0;
    }

    const rows: Awaited<ReturnType<typeof this.measureLiveSearchVolumeSeparate>> = [];
    for (let i = 0; i < candidates.length; i += LIVE_CACHE_PROMOTION_BATCH_SIZE) {
      const batch = candidates.slice(i, i + LIVE_CACHE_PROMOTION_BATCH_SIZE);
      const batchRows = await this.measureLiveSearchVolumeRows(config, batch.map((item) => item.keyword), {
        includeDocumentCount: false,
      }, LIVE_CACHE_PROMOTION_BATCH_TIMEOUT_MS);
      rows.push(...batchRows);
      if (rows.length >= measurementLimit) {
        break;
      }
    }
    if (rows.length === 0) {
      console.info('[LIVE-GOLDEN] cache promotion skipped: no SearchAd rows', {
        candidates: candidates.length,
        targetLimit,
        sample: candidates.slice(0, 8).map((item) => item.keyword),
      });
      return 0;
    }

    const byCompactId = new Map<string, MobileLiveGoldenBoardItem>();
    for (const item of candidates) {
      const compactId = keywordCompactId(item.keyword);
      if (compactId) byCompactId.set(compactId, item);
    }

    const stamp = this.now().toISOString();
    let changed = 0;
    let promotedCount = 0;
    const rejectedSamples: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const keyword = normalizeKeyword(row.keyword);
      const item = byCompactId.get(keywordCompactId(keyword));
      if (!item) continue;
      const pc = finiteNumber(row.pcSearchVolume);
      const mobile = finiteNumber(row.mobileSearchVolume);
      const measuredVolume = (pc || 0) + (mobile || 0);
      const docs = finiteNumber(item.documentCount);
      if (pc === null || mobile === null || measuredVolume <= 0 || docs === null || docs <= 0) continue;
      const ratio = Number((measuredVolume / docs).toFixed(2));
      const opportunityScore = liveUltimateOpportunityScore(item.keyword, measuredVolume, docs, ratio);
      const grade = normalizeLiveMetricGrade(
        item.keyword,
        item.grade,
        opportunityScore,
        measuredVolume,
        docs,
        ratio,
      );
      if (grade === 'C') continue;
      const promoted: MobileLiveGoldenBoardItem = {
        ...item,
        grade,
        score: opportunityScore,
        pcSearchVolume: pc,
        mobileSearchVolume: mobile,
        totalSearchVolume: measuredVolume,
        goldenRatio: ratio,
        cpc: finiteNumber(row.monthlyAveCpc) ?? finiteNumber(item.cpc),
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: (row as any).svEstimated === true,
        documentCountSource: item.documentCountSource || 'cache',
        documentCountConfidence: item.documentCountConfidence || 'medium',
        isDocumentCountEstimated: item.isDocumentCountEstimated === true,
        updatedAt: stamp,
        freshness: 'live',
        evidence: [...new Set([
          ...(Array.isArray(item.evidence) ? item.evidence : []),
          'persistent-cache-split-promoted',
          'searchad-pc-mobile-split-enriched',
        ].map((entry) => normalizeKeyword(entry)).filter(Boolean))].slice(0, 10),
        publicSearchVolumeLabel: formatRange(measuredVolume, 'search'),
        publicDocumentCountLabel: formatRange(docs, 'document'),
      };
      const judged = applyKeywordAiJudge(promoted, { now: this.now() });
      this.board.set(item.id, judged);
      const now = this.now();
      const publishable = isPublishableLiveResultMetric(judged, now) || isMeasuredProBoardItem(judged, now);
      const fallbackReason = measuredProBoardFallbackRejectReason(judged, now);
      if (!publishable && fallbackReason !== 'ok') {
        if (rejectedSamples.length < 12) {
          rejectedSamples.push({
            keyword: judged.keyword,
            grade: judged.grade,
            score: judged.score,
            totalSearchVolume: judged.totalSearchVolume,
            documentCount: judged.documentCount,
            goldenRatio: judged.goldenRatio,
            category: judged.category,
            aiVerdict: judged.aiJudge?.verdict,
            aiScore: judged.aiJudge?.score,
            needIntent: judged.aiJudge?.needIntent,
            promotionBonus: livePromotionPriorityBonus(judged.keyword, judged.category || 'all'),
            reason: fallbackReason,
          });
        }
        changed += 1;
        continue;
      }
      this.board.set(item.id, judged);
      changed += 1;
      promotedCount += 1;
    }

    if (changed > 0) {
      this.pruneBoard();
      this.boardUpdatedAt = stamp;
      this.saveBoardToFile();
    }
    console.info('[LIVE-GOLDEN] cache promotion completed', {
      candidates: candidates.length,
      rows: rows.length,
      changed,
      promotedCount,
      targetLimit,
      rejectedSamples,
    });
    return promotedCount;
  }

  private sortedBoard(): MobileLiveGoldenBoardItem[] {
    const now = this.now();
    const nowMs = now.getTime();
    const sorted = [...this.board.values()]
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .filter(hasCompleteLiveGoldenMetrics)
      .filter((item) => isLiveRadarUsableMetric(item, now) || isMeasuredProExactKeywordMetric(item, now))
      .filter(isBlogActionableBoardMetric)
      .map((item) => ({
        ...item,
        freshness: freshnessFrom(item.updatedAt, nowMs),
      }))
      .sort((a, b) => {
        const scoreDiff = boardSortScore(b, nowMs) - boardSortScore(a, nowMs);
        if (scoreDiff !== 0) return scoreDiff;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    const selected = selectLiveBoardItems(sorted, this.boardTarget, now);
    const resilientSelected = appendMeasuredPublishableFallbackItems(selected, sorted, this.boardTarget, now);
    return resilientSelected
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
  }

  private pruneBoard(): void {
    const keepIds = new Set(this.sortedBoard().map((item) => item.id));
    const now = this.now();
    const nowMs = now.getTime();
    const minimumVisibleBoard = Math.min(this.publicPreviewCount, this.boardTarget);
    if (keepIds.size < minimumVisibleBoard) {
      const fallbackItems = [...this.board.values()]
        .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
        .filter(hasCompleteLiveGoldenMetrics)
        .filter((item) => isLiveRadarUsableMetric(item, now) || isMeasuredProExactKeywordMetric(item, now))
        .filter(isBlogActionableBoardMetric)
        .sort((a, b) => {
          const scoreDiff = boardSortScore(b, nowMs) - boardSortScore(a, nowMs);
          if (scoreDiff !== 0) return scoreDiff;
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        });
      for (const item of selectMeasuredPublishableFallbackItems(fallbackItems, this.boardTarget, now)) {
        if (keepIds.size >= minimumVisibleBoard) break;
        keepIds.add(item.id);
      }
    }
    for (const item of [...this.board.values()]) {
      if (keepIds.has(item.id)) continue;
      const pendingSplitEnrichment = ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS
        && hasCompleteLiveGoldenMetrics(item)
        && (isLiveRadarUsableMetric(item, now) || isMeasuredProExactKeywordMetric(item, now))
        && (!hasMeasuredPcMobileSplit(item) || !hasRealCpcValue(item));
      if (pendingSplitEnrichment) continue;
      if (isMeasuredBoardReferenceMetric(item, now)) continue;
      this.board.delete(item.id);
    }
  }

  private loadMeasuredResultCacheFromFile(): void {
    if (!this.resultCacheFile) return;
    try {
      if (!fs.existsSync(this.resultCacheFile)) return;
      const raw = fs.readFileSync(this.resultCacheFile, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const metrics: MobileKeywordMetric[] = [];
      const pushKeyword = (row: any, fallbackCategory: string): void => {
        const keyword = normalizeKeyword(row?.keyword);
        if (!keyword) return;
        this.rememberCacheDerivedLiveSeeds(keyword, fallbackCategory);
        const measurementMeta = measurementMetadataWithPersistentDefaults(row);
        const pcSearchVolume = finiteNumber(row?.pcSearchVolume);
        const mobileSearchVolume = finiteNumber(row?.mobileSearchVolume);
        const totalSearchVolume = finiteNumber(row?.totalSearchVolume)
          || ((pcSearchVolume || 0) + (mobileSearchVolume || 0))
          || finiteNumber(row?.searchVolume);
        const documentCount = finiteNumber(row?.documentCount);
        const goldenRatio = finiteNumber(row?.goldenRatio)
          || (totalSearchVolume !== null && documentCount !== null && documentCount > 0
            ? Number((totalSearchVolume / documentCount).toFixed(2))
            : null);
        const score = totalSearchVolume !== null && documentCount !== null && documentCount > 0 && goldenRatio !== null
          ? liveUltimateOpportunityScore(keyword, totalSearchVolume, documentCount, goldenRatio)
          : finiteNumber(row?.score);
        const grade = totalSearchVolume !== null && documentCount !== null && documentCount > 0 && goldenRatio !== null
          ? normalizeLiveMetricGrade(keyword, row?.grade, score, totalSearchVolume, documentCount, goldenRatio)
          : normalizeGrade(row?.grade, score || 0);
        const metric: MobileKeywordMetric = {
          keyword,
          grade,
          score,
          pcSearchVolume,
          mobileSearchVolume,
          totalSearchVolume,
          documentCount,
          goldenRatio,
          cpc: finiteNumber(row?.cpc),
          category: inferLiveCategory(keyword, normalizeKeyword(row?.category) || fallbackCategory || 'live'),
          source: normalizeKeyword(row?.source) || 'mobile-measured-result-cache',
          intent: normalizeKeyword(row?.intent) || 'measured-cache-golden-discovery',
          evidence: Array.isArray(row?.evidence)
            ? row.evidence.map((entry: unknown) => normalizeKeyword(entry)).filter(Boolean).slice(0, 8)
            : ['mobile-measured-result-cache'],
          isMeasured: row?.isMeasured !== false && totalSearchVolume !== null && documentCount !== null,
          ...measurementMeta,
        };
        if (!hasCompleteLiveGoldenMetrics(metric)) return;
        if (
          !isLiveRadarUsableMetric(metric, this.now())
          && !isMeasuredProExactKeywordMetric(metric, this.now())
          && !isMeasuredBoardReferenceMetric(metric, this.now())
        ) return;
        metrics.push(metric);
      };

      if (Array.isArray(parsed?.entries)) {
        for (const entry of parsed.entries) {
          const fallbackCategory = normalizeKeyword(entry?.category || entry?.product || entry?.mode || 'live');
          const result = entry?.result;
          if (Array.isArray(result?.keywords)) {
            for (const row of result.keywords) pushKeyword(row, fallbackCategory);
          }
          if (Array.isArray(entry?.keywords)) {
            for (const row of entry.keywords) pushKeyword(row, fallbackCategory);
          }
        }
      }
      if (Array.isArray(parsed?.keywords)) {
        for (const row of parsed.keywords) pushKeyword(row, 'live');
      }
      if (metrics.length > 0) {
        this.mergeBoard(metrics, { pruneAndSave: false });
        this.saveMeasuredProbeQueueToFile();
        this.lastMessage = `loaded ${metrics.length} measured cache candidates`;
      }
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `measured result cache load failed: ${this.lastError}`;
    }
  }

  private loadPersistentKeywordCacheFromFile(): void {
    if (!this.keywordCacheFile) return;
    try {
      if (!fs.existsSync(this.keywordCacheFile)) return;
      const raw = fs.readFileSync(this.keywordCacheFile, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const metrics: MobileKeywordMetric[] = [];
      const pushKeyword = (key: unknown, row: any): void => {
        const keyword = normalizeKeyword(row?.keyword || key);
        if (!keyword || keyword === '__schemaVersion') return;
        const measurementMeta = measurementMetadataWithPersistentDefaults(row);
        const pcSearchVolume = finiteNumber(row?.pcSearchVolume);
        const mobileSearchVolume = finiteNumber(row?.mobileSearchVolume);
        const pairedSearchVolume = pcSearchVolume !== null || mobileSearchVolume !== null
          ? (pcSearchVolume || 0) + (mobileSearchVolume || 0)
          : null;
        const totalSearchVolume = finiteNumber(row?.totalSearchVolume)
          ?? finiteNumber(row?.searchVolume)
          ?? pairedSearchVolume;
        const documentCount = finiteNumber(row?.documentCount)
          ?? finiteNumber(row?.documents)
          ?? finiteNumber(row?.docs);
        if (totalSearchVolume === null || documentCount === null || documentCount <= 0) return;
        const sourceCategory = normalizeKeyword(row?.category) || 'persistent-cache';
        if (this.shouldExpandMeasuredCacheSeed(keyword, sourceCategory, totalSearchVolume, documentCount)) {
          this.rememberCacheDerivedLiveSeeds(
            keyword,
            sourceCategory,
            this.cacheDerivedPriorityBoost(totalSearchVolume, documentCount),
          );
        }
        const goldenRatio = finiteNumber(row?.goldenRatio)
          ?? Number((totalSearchVolume / documentCount).toFixed(2));
        const actionable = hasRobustActionableIntent(keyword)
          || isActionableGoldenKeyword(keyword)
          || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(keyword);
        const computedScore = liveMetricScore(totalSearchVolume, documentCount, goldenRatio, actionable);
        const score = Math.max(computedScore, liveUltimateOpportunityScore(keyword, totalSearchVolume, documentCount, goldenRatio));
        const grade = normalizeLiveMetricGrade(keyword, row?.grade, score, totalSearchVolume, documentCount, goldenRatio);
        const metric: MobileKeywordMetric = {
          keyword,
          grade,
          score,
          pcSearchVolume,
          mobileSearchVolume,
          totalSearchVolume,
          documentCount,
          goldenRatio,
          cpc: finiteNumber(row?.cpc) ?? finiteNumber(row?.realCpc),
          category: inferLiveCategory(keyword, normalizeKeyword(row?.category) || 'persistent-cache'),
          source: normalizeKeyword(row?.source) || 'persistent-keyword-cache',
          intent: normalizeKeyword(row?.intent) || 'persistent-measured-golden-cache',
          evidence: Array.isArray(row?.evidence)
            ? row.evidence.map((entry: unknown) => normalizeKeyword(entry)).filter(Boolean).slice(0, 8)
            : ['persistent-keyword-cache', 'measured-search-volume', 'measured-document-count'],
          isMeasured: true,
          ...measurementMeta,
        };
        if (metric.grade === 'C') return;
        if (!hasCompleteLiveGoldenMetrics(metric)) return;
        if (
          !isLiveRadarUsableMetric(metric, this.now())
          && !isMeasuredProExactKeywordMetric(metric, this.now())
          && !isMeasuredBoardReferenceMetric(metric, this.now())
        ) return;
        metrics.push(metric);
      };

      if (Array.isArray(parsed?.keywords)) {
        for (const row of parsed.keywords) pushKeyword(row?.keyword, row);
      }
      if (Array.isArray(parsed?.items)) {
        for (const row of parsed.items) pushKeyword(row?.keyword, row);
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, row] of Object.entries(parsed)) {
          if (key === '__schemaVersion') continue;
          if (!row || typeof row !== 'object') continue;
          pushKeyword(key, row);
        }
      }

      if (metrics.length > 0) {
        metrics.sort((a, b) => {
          const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
          const scoreDiff = (b.score || 0) - (a.score || 0);
          const volumeDiff = (b.totalSearchVolume || 0) - (a.totalSearchVolume || 0);
          if (scoreDiff !== 0) return scoreDiff;
          if (ratioDiff !== 0) return ratioDiff;
          return volumeDiff;
        });
        this.mergeBoard(metrics.slice(0, Math.max(180, this.boardTarget * 12)), { pruneAndSave: false });
        this.saveMeasuredProbeQueueToFile();
        this.lastMessage = `loaded ${metrics.length} persistent measured keyword candidates`;
      }
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `persistent keyword cache load failed: ${this.lastError}`;
    }
  }

  private loadBoardFromFile(replaceExisting = false): void {
    if (!this.boardFile) return;
    try {
      if (!fs.existsSync(this.boardFile)) return;
      const raw = fs.readFileSync(this.boardFile, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.board)
          ? parsed.board
          : [];
      const stamp = this.now().toISOString();
      const now = this.now();
      if (replaceExisting) {
        this.board.clear();
      }
      for (const row of rows) {
        const keyword = normalizeKeyword(row?.keyword);
        if (!keyword) continue;
        const measurementMeta = measurementMetadataWithPersistentDefaults(row);
        const totalSearchVolume = finiteNumber(row?.totalSearchVolume);
        const documentCount = finiteNumber(row?.documentCount);
        const isMeasured = Boolean(row?.isMeasured) || (totalSearchVolume !== null && documentCount !== null);
        const goldenRatio = finiteNumber(row?.goldenRatio)
          || (totalSearchVolume !== null && documentCount !== null && documentCount > 0
            ? Number((totalSearchVolume / documentCount).toFixed(2))
            : null);
        const score = totalSearchVolume !== null && documentCount !== null && documentCount > 0 && goldenRatio !== null
          ? liveUltimateOpportunityScore(keyword, totalSearchVolume, documentCount, goldenRatio)
          : finiteNumber(row?.score);
        const grade = totalSearchVolume !== null && documentCount !== null && documentCount > 0 && goldenRatio !== null
          ? normalizeLiveMetricGrade(keyword, row?.grade, score, totalSearchVolume, documentCount, goldenRatio)
          : normalizeGrade(row?.grade, score || 0);
        if (grade === 'C') continue;
        if (!hasCompleteLiveGoldenMetrics({ totalSearchVolume, documentCount, isMeasured })) continue;
        if (
          !isLiveRadarUsableKeyword(keyword, totalSearchVolume, documentCount, now)
          && !isMeasuredProExactKeywordMetric({
            keyword,
            grade,
            score,
            totalSearchVolume,
            documentCount,
            goldenRatio,
            isMeasured,
            ...measurementMeta,
          }, now)
          && !isMeasuredBoardReferenceMetric({
            keyword,
            grade,
            score,
            totalSearchVolume,
            documentCount,
            goldenRatio,
            isMeasured,
            ...measurementMeta,
          }, now)
        ) continue;
        const id = normalizeKeyword(row?.id) || keywordId(keyword);
        const item: MobileLiveGoldenBoardItem = {
          keyword,
          grade,
          score,
          pcSearchVolume: finiteNumber(row?.pcSearchVolume),
          mobileSearchVolume: finiteNumber(row?.mobileSearchVolume),
          totalSearchVolume,
          documentCount,
          goldenRatio,
          cpc: finiteNumber(row?.cpc),
          category: inferLiveCategory(keyword, normalizeKeyword(row?.category) || 'live'),
          source: normalizeKeyword(row?.source) || 'mobile-live-golden-radar',
          intent: normalizeKeyword(row?.intent) || 'live-golden-discovery',
          evidence: Array.isArray(row?.evidence)
            ? row.evidence.map((entry: unknown) => normalizeKeyword(entry)).filter(Boolean).slice(0, 8)
            : [],
          isMeasured,
          id,
          rank: finiteNumber(row?.rank) || 0,
          discoveredAt: normalizeKeyword(row?.discoveredAt) || normalizeKeyword(row?.updatedAt) || stamp,
          updatedAt: normalizeKeyword(row?.updatedAt) || normalizeKeyword(row?.discoveredAt) || stamp,
          freshness: 'warm',
          isPublicPreview: false,
          publicSearchVolumeLabel: normalizeKeyword(row?.publicSearchVolumeLabel) || formatRange(totalSearchVolume, 'search'),
          publicDocumentCountLabel: normalizeKeyword(row?.publicDocumentCountLabel) || formatRange(documentCount, 'document'),
          publicReason: normalizeKeyword(row?.publicReason) || publicReason({
            keyword,
            grade,
            score,
            pcSearchVolume: finiteNumber(row?.pcSearchVolume),
            mobileSearchVolume: finiteNumber(row?.mobileSearchVolume),
            totalSearchVolume,
            documentCount,
            goldenRatio,
            cpc: finiteNumber(row?.cpc),
            category: normalizeKeyword(row?.category) || 'live',
            source: normalizeKeyword(row?.source) || 'mobile-live-golden-radar',
            intent: normalizeKeyword(row?.intent) || 'live-golden-discovery',
            evidence: [],
            isMeasured,
          }),
          ...measurementMeta,
        };
        this.board.set(id, item);
      }
      if (!this.refreshBoardFileOnSnapshot) {
        this.pruneBoard();
      }
      const newestUpdatedAt = [...this.board.values()]
        .map((item) => normalizeKeyword(item.updatedAt))
        .filter(Boolean)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      this.boardUpdatedAt = normalizeKeyword(parsed?.boardUpdatedAt) || newestUpdatedAt;
      this.cachedSnapshot = null;
      this.cachedSnapshotAtMs = 0;
      this.lastMessage = `loaded ${this.board.size} live golden board items`;
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `live golden board load failed: ${this.lastError}`;
    }
  }

  private refreshBoardFromFile(force = false): void {
    if (!this.boardFile) return;
    const nowMs = Date.now();
    if (!force && nowMs - this.lastBoardFileRefreshAtMs < LIVE_BOARD_FILE_REFRESH_MS) return;
    this.lastBoardFileRefreshAtMs = nowMs;
    this.loadBoardFromFile(true);
  }

  private saveBoardToFile(): void {
    if (!this.boardFile) return;
    try {
      fs.mkdirSync(path.dirname(this.boardFile), { recursive: true });
      const payload = {
        version: 1,
        boardUpdatedAt: this.boardUpdatedAt,
        savedAt: this.now().toISOString(),
        items: this.persistedBoardItems(),
      };
      const tmpFile = `${this.boardFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.boardFile);
      this.cachedSnapshot = null;
      this.cachedSnapshotAtMs = 0;
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `live golden board save failed: ${this.lastError}`;
    }
  }
}

export function createMobileLiveGoldenRadarFromEnv(
  notificationInbox: MobileNotificationInbox | null,
  shouldRun?: () => MobileLiveGoldenRadarRunGate | boolean,
): MobileLiveGoldenRadar | null {
  if (!notificationInbox) return null;
  if (process.env['LEWORD_MOBILE_LIVE_GOLDEN_ENABLED'] === 'false') return null;
  const intervalMinutes = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_INTERVAL_MINUTES'] || 0);
  const cycleLimit = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_LIMIT'] || 0);
  const maxSeeds = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_MAX_SEEDS'] || 0);
  const maxCandidates = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_MAX_CANDIDATES'] || 0);
  const startupCatchUpCycles = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_STARTUP_CYCLES'] || 0);
  const boardTarget = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_BOARD_TARGET'] || 0);
  const publicPreviewCount = Number(process.env['LEWORD_PUBLIC_GOLDEN_PREVIEW_COUNT'] || 0);
  const boardFile = normalizeKeyword(process.env['LEWORD_MOBILE_LIVE_GOLDEN_BOARD_FILE'] || '');
  const resultCacheFile = normalizeKeyword(process.env['LEWORD_MOBILE_CACHE_FILE'] || '');
  const keywordCacheFile = normalizeKeyword(process.env['LEWORD_MOBILE_KEYWORD_CACHE_FILE'] || '');
  const readOnly = process.env['LEWORD_MOBILE_LIVE_GOLDEN_READONLY'] === 'true';
  const runOnStart = !readOnly && process.env['LEWORD_MOBILE_LIVE_GOLDEN_ON_START'] !== 'false';
  const rawRunOnStartDelayMs = Number(process.env['LEWORD_MOBILE_LIVE_GOLDEN_START_DELAY_MS'] || 0);
  const defaultRunOnStartDelayMs = process.env['NODE_ENV'] === 'production' ? 300_000 : undefined;
  const effectiveShouldRun = readOnly
    ? () => ({ ok: false, message: 'live golden read-only snapshot mode' })
    : shouldRun;
  return new MobileLiveGoldenRadar({
    notificationInbox,
    shouldRun: effectiveShouldRun,
    intervalMs: Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? intervalMinutes * 60 * 1000
      : undefined,
    cycleLimit: Number.isFinite(cycleLimit) && cycleLimit > 0 ? cycleLimit : undefined,
    boardTarget: Number.isFinite(boardTarget) && boardTarget > 0 ? boardTarget : undefined,
    publicPreviewCount: Number.isFinite(publicPreviewCount) && publicPreviewCount > 0 ? publicPreviewCount : undefined,
    boardFile: boardFile || undefined,
    resultCacheFile: resultCacheFile || undefined,
    keywordCacheFile: keywordCacheFile || undefined,
    maxSeeds: Number.isFinite(maxSeeds) && maxSeeds > 0 ? maxSeeds : undefined,
    maxCandidates: Number.isFinite(maxCandidates) && maxCandidates > 0 ? maxCandidates : undefined,
    startupCatchUpCycles: Number.isFinite(startupCatchUpCycles) && startupCatchUpCycles > 0
      ? startupCatchUpCycles
      : undefined,
    runOnStart,
    refreshBoardFileOnSnapshot: readOnly,
    runOnStartDelayMs: Number.isFinite(rawRunOnStartDelayMs) && rawRunOnStartDelayMs > 0
      ? Math.floor(rawRunOnStartDelayMs)
      : defaultRunOnStartDelayMs,
  });
}
