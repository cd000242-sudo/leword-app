import {
  MOBILE_PC_PARITY_SLA,
  type MobileLiveGoldenBoardItem,
  type MobileLiveGoldenFreshness,
  type MobileKeywordMetric,
  type MobileKeywordResult,
  type MobileLiveGoldenRadarSnapshot,
  type MobileResultGrade,
} from './contracts';
import type { MobileNotificationInbox } from './notification-inbox';
import { EnvironmentManager, type EnvConfig } from '../utils/environment-manager';
import { discoverDirectGoldenKeywords } from '../utils/direct-golden-keyword-miner';
import { classifyKeywordIntent, getNaverKeywordSearchVolumeSeparate } from '../utils/naver-datalab-api';
import * as fs from 'fs';
import * as path from 'path';
import {
  countSss,
  isActionableGoldenKeyword,
  isQualityGoldenDiscoveryResult,
  rankGoldenDiscoveryResults,
} from '../utils/golden-discovery-floor';
import type { MDPResult } from '../utils/mdp-engine';
import { classifyKeyword } from '../utils/categories';
import { getDiscoveryCategorySeeds } from '../utils/category-discovery-map';
import { measureDocumentCount } from '../utils/measure-dc';

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
  measureLiveDocumentCount?: typeof measureDocumentCount;
  enableBackfill?: boolean;
  shouldRun?: () => MobileLiveGoldenRadarRunGate | boolean;
  setIntervalFn?: (handler: () => void, intervalMs: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  now?: () => Date;
}

const DEFAULT_CATEGORIES = Object.freeze([
  'policy',
  'sports',
  'education',
  'drama',
  'broadcast',
  'movie',
  'music',
  'celeb',
  'finance',
  'life_tips',
  'home_life',
  'fashion',
  'beauty',
  'electronics',
  'travel_domestic',
  'travel_overseas',
  'health',
  'food',
  'recipe',
  'it',
  'ai_tool',
  'game',
]);

const PUBLIC_PREVIEW_ROTATION_MS = 60_000;
const LIVE_SEED_COLLECTION_TIMEOUT_MS = 5_000;
const LIVE_DISCOVERY_TIMEOUT_MS = 45_000;
const LIVE_BACKFILL_TIMEOUT_MS = 35_000;
const PUBLIC_PREVIEW_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const LIVE_BOARD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BROAD_KEYWORD_VOLUME_CEILING = 500_000;
const BROAD_KEYWORD_DOCUMENT_CEILING = 80_000;
const PUBLIC_PREVIEW_VOLUME_CEILING = 250_000;
const PUBLIC_PREVIEW_DOCUMENT_CEILING = 30_000;
const PUBLIC_PREVIEW_PROFILE_INTENT_MAX = 0;
const PUBLIC_PREVIEW_PROTECTED_TOP_COUNT = 3;
const LIVE_BOARD_CATEGORY_SHARE_CAP = 0.24;
const LIVE_BOARD_CLUSTER_MAX = 2;
const LIVE_DIRECT_CANDIDATE_MAX_PER_CYCLE = 600;
const LIVE_ISSUE_FALLBACK_DOCUMENT_LIMIT = 24;
const LIVE_ISSUE_FALLBACK_CONCURRENCY = 4;
const NEWS_HEADLINE_FRAGMENT_RE = /(?:\uBD80\uCE5C\uC0C1|\uC0AC\uACFC|\uAD6C\uC18D\uC601\uC7A5|\uD610\uC758|\uC870\uC0AC|\uB17C\uB780|\uC911\uB2E8|\uC778\uC99D|\uC9C0\uC5F0|\uBC15\uC218|\uC120\uC218\uB4E4|\uBC29\uBB38|\uC2AC\uD514|\uD574\uBA85|\uBC1C\uC5B8|\uC120\uACE0|\uCCB4\uD3EC|\uC555\uC218\uC218\uC0C9|\uC0AC\uB9DD|\uBCC4\uC138|\uACB0\uBCC4|\uC5F4\uC560|\uD63C\uC778)/u;
const SEMANTIC_CLUSTER_SUFFIX_RE = new RegExp(`(?:${[
  '\\uBA87\\uBD80\\uC791',
  '\\uCD9C\\uC5F0\\uC9C4',
  '\\uB4F1\\uAE09\\uCEF7',
  '\\uB2F5\\uC9C0',
  '\\uB2F9\\uCCA8\\uBC88\\uD638',
  '\\uC608\\uB9E4',
  '\\uC77C\\uC815',
  '\\uC2E0\\uCCAD',
  '\\uB300\\uC0C1',
  '\\uC790\\uACA9',
  '\\uC870\\uD68C',
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
  '\\uB9C8\\uAC10',
  '\\uBC1C\\uD45C',
  '\\uC911\\uACC4',
  '\\uB77C\\uC778\\uC5C5',
  '\\uD558\\uC774\\uB77C\\uC774\\uD2B8',
  '\\uC6D0\\uC791',
  '\\uC778\\uBB3C\\uAD00\\uACC4\\uB3C4',
].join('|')})+$`, 'u');
const SEASONAL_CONTENT_CLUSTER_SUFFIX_RE = new RegExp(`(?:${[
  '\\uBA87\\uBD80\\uC791',
  '\\uCD9C\\uC5F0\\uC9C4',
  '\\uB2E4\\uC2DC\\uBCF4\\uAE30',
  '\\uACB0\\uB9D0',
  '\\uCFE0\\uD0A4\\uC601\\uC0C1',
  '\\uC6D0\\uC791',
  '\\uC778\\uBB3C\\uAD00\\uACC4\\uB3C4',
].join('|')})+$`, 'u');

const GRADE_WEIGHT: Record<MobileResultGrade, number> = {
  SSS: 120,
  SS: 95,
  S: 75,
  A: 45,
  B: 20,
  C: 0,
};

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

function directCandidateBudget(maxCandidates: number, cycleLimit: number): number {
  return Math.max(
    120,
    Math.min(maxCandidates, LIVE_DIRECT_CANDIDATE_MAX_PER_CYCLE, Math.max(240, cycleLimit * 60)),
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
    .filter((keyword) => !isThinProfileIntentKeyword(keyword));
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
  const volume = Math.max(0, item.totalSearchVolume || 0);
  const documents = item.documentCount;
  const ratio = Math.max(0, item.goldenRatio || (
    volume > 0 && documents && documents > 0 ? volume / documents : 0
  ));
  const longTail = keywordLongTailScore(item.keyword);
  const need = keywordNeedScore(item.keyword, item.intent);
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
const LIVE_GENERAL_ISSUE_RE = /(합의|예상|심경|구형|사고|논란|수사|구속|체포|방문|회동|발언|입장|공식입장|사과|중단|침수|파업|인상|인하|확정|취소|변경|폐지)/;
const THIN_PROFILE_INTENT_RE = /(프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대)$/i;
const PROFILE_INTENT_TOKEN_RE = /(프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대|작품활동|필모그래피)/i;
const PROFILE_INTENT_EXEMPT_RE = /(카카오톡|카톡|인스타그램|블로그|프로필\s*(사진|설정|변경|꾸미기|삭제|비공개|차단)|사용법|오류|업데이트|방법|신청|조회|대상|자격|지급일|일정|예매|예약|중계|등급컷|답지|당첨번호|주가|전망)/i;
const RICH_PROFILE_CONTEXT_RE = /(공식입장|해명|논란|기자회견|회동|발언|입장|출연진|방송시간|몇부작|다시보기|결말|하이라이트|라인업|MVP|소식|공개|비주얼)/i;

function isMalformedLiveKeyword(keyword: string): boolean {
  const clean = normalizeKeyword(keyword);
  if (!clean) return true;
  const compact = clean.replace(/\s+/g, '');
  if (/^[가-힣]+[0-9]+[가-힣0-9]+$/.test(compact) && !/\s/.test(clean)) return true;
  if (/^[a-z0-9\s_-]+$/i.test(clean) && !/[가-힣]/.test(clean)) return true;
  return false;
}

function isActionableLiveKeyword(keyword: string): boolean {
  return ACTIONABLE_KEYWORD_HINT_RE.test(normalizeKeyword(keyword));
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
  return Math.max(3, Math.ceil(Math.max(1, boardTarget) * LIVE_BOARD_CATEGORY_SHARE_CAP));
}

function boardCategoryKey(item: MobileLiveGoldenBoardItem): string {
  return normalizeKeyword(item.category) || inferLiveCategory(item.keyword, 'live');
}

function selectLiveBoardItems<T extends MobileLiveGoldenBoardItem>(
  sorted: T[],
  boardTarget: number,
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

  const push = (item: T, options: { respectCategory?: boolean; respectCluster?: boolean } = {}): boolean => {
    if (selected.length >= target || selectedIds.has(item.id)) return false;
    const compactId = keywordCompactId(item.keyword);
    if (selectedCompactIds.has(compactId)) return false;
    const isProfileIntent = isThinProfileIntentKeyword(item.keyword);
    if (isProfileIntent && profileCount >= maxProfileCount) return false;
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
    push(item);
  }

  return selected;
}

function isLiveRadarUsableKeyword(keyword: string, volume: number | null, documents: number | null): boolean {
  if (isMalformedLiveKeyword(keyword)) return false;
  const clean = normalizeKeyword(keyword);
  if (isThinProfileIntentKeyword(clean)) return false;
  const specific = SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
  if (volume !== null && volume >= BROAD_KEYWORD_VOLUME_CEILING) return false;
  if (documents !== null && documents >= BROAD_KEYWORD_DOCUMENT_CEILING) return false;
  if (volume !== null && documents !== null && volume >= 300_000 && documents >= 50_000) return false;
  if (!specific && volume !== null && volume >= 250_000) return false;
  if (!specific && documents !== null && documents >= 30_000) return false;
  if (!isActionableLiveKeyword(clean) && !specific) {
    return false;
  }
  return true;
}

function isPublicPreviewCandidate(item: MobileLiveGoldenBoardItem): boolean {
  if (!isLiveRadarUsableMetric(item)) return false;
  if (item.grade === 'B' || item.grade === 'C') return false;
  if (item.totalSearchVolume !== null && item.totalSearchVolume >= PUBLIC_PREVIEW_VOLUME_CEILING) return false;
  if (item.documentCount !== null && item.documentCount >= PUBLIC_PREVIEW_DOCUMENT_CEILING) return false;
  if (item.goldenRatio !== null && item.goldenRatio < 2) return false;
  return true;
}

function isPublicPreviewFallbackCandidate(item: MobileLiveGoldenBoardItem): boolean {
  if (isMalformedLiveKeyword(item.keyword) || isThinProfileIntentKeyword(item.keyword)) return false;
  if (item.grade === 'B' || item.grade === 'C') return false;
  if (item.totalSearchVolume !== null && item.totalSearchVolume >= PUBLIC_PREVIEW_VOLUME_CEILING) return false;
  if (
    item.totalSearchVolume !== null
    && item.documentCount !== null
    && item.documentCount > 0
  ) {
    const ratio = item.goldenRatio !== null ? item.goldenRatio : item.totalSearchVolume / item.documentCount;
    if (item.totalSearchVolume < 100) return false;
    if (ratio < 0.75) return false;
    if (item.documentCount >= 120_000 && ratio < 1.5) return false;
    if (item.documentCount >= 60_000 && ratio < 1.0) return false;
  }
  return isActionableLiveKeyword(item.keyword) || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(item.keyword);
}

function inferLiveCategory(keyword: string, fallbackCategory: string): string {
  const clean = normalizeKeyword(keyword);
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

function isLiveRadarUsableMetric(item: MobileKeywordMetric): boolean {
  return isLiveRadarUsableKeyword(item.keyword, item.totalSearchVolume, item.documentCount);
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
  const specific = SPECIFIC_LIVE_KEYWORD_HINT_RE.test(normalizeKeyword(item.keyword));
  if (!isActionableGoldenKeyword(item.keyword) && !specific) return false;
  const volume = finiteNumber(item.searchVolume) || 0;
  const docs = finiteNumber(item.documentCount) || 0;
  const ratio = finiteNumber(item.goldenRatio) || (docs > 0 ? volume / docs : 0);
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
  if (categoryId === 'education') return ['등급컷', '답지', '시험일정', '접수', '준비물'];
  if (categoryId === 'life_tips') return ['당첨번호', '당첨지역', '실수령액', '판매점', '추첨시간', '조회'];
  if (categoryId === 'fashion') return ['코디', '브랜드', '사이즈', '후기', '할인'];
  if (categoryId === 'beauty') return ['성분', '피부타입', '후기', '추천', '순서'];
  if (categoryId === 'travel_domestic' || categoryId === 'travel_overseas') return ['일정', '준비물', '예약', '주차', '경비'];
  if (categoryId === 'food') return ['맛집', '메뉴', '예약', '가격', '주차'];
  if (categoryId === 'recipe') return ['황금레시피', '재료', '만드는법', '보관법'];
  if (categoryId === 'it' || categoryId === 'ai_tool') return ['사용법', '설정', '오류 해결', '비교', '추천'];
  if (categoryId === 'live_issue') return ['정리', '현재 상황', '이유', '공식입장', '전망', '관련주', '일정', '소식'];
  return ['추천', '비교', '후기', '가격', '방법', '일정', '조회', '발표', '기자회견', '논란 정리'];
}

function getLiveSeedBackfillIntents(seed: string, categoryId: string): string[] {
  const inferred = inferLiveCategory(seed, categoryId);
  const clean = normalizeKeyword(seed);
  if (LIVE_LOTTERY_SIGNAL_RE.test(clean)) return getBackfillIntents('life_tips');
  if (LIVE_SPORTS_SIGNAL_RE.test(clean)) return getBackfillIntents('sports');
  if (LIVE_POLICY_SIGNAL_RE.test(clean)) return getBackfillIntents('policy');
  if (LIVE_FINANCE_SIGNAL_RE.test(clean)) return getBackfillIntents('finance');
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

function buildBackfillCandidates(categoryId: string, liveSeeds: string[], maxSeeds: number): string[] {
  const liveSeedBases = normalizeLiveSeeds(liveSeeds, 36);
  const candidateLimit = Math.max(120, Math.min(1000, Math.floor(maxSeeds || 240)));
  const baseSeeds = uniqueKeywords([
    ...liveSeedBases,
    ...getDiscoveryCategorySeeds(categoryId, Math.max(24, Math.min(80, maxSeeds))),
  ], Math.max(80, Math.min(240, maxSeeds || 120)));
  const intents = getBackfillIntents(categoryId);
  const liveSeedSet = new Set(liveSeedBases.map((seed) => seed.toLowerCase().replace(/\s+/g, '')));
  const candidates: string[] = [];
  for (const seed of baseSeeds) {
    candidates.push(seed);
    const key = seed.toLowerCase().replace(/\s+/g, '');
    const seedIsLive = liveSeedSet.has(key);
    const seedAlreadySpecific = isActionableLiveKeyword(seed);
    const seedIntents = seedIsLive ? getLiveSeedBackfillIntents(seed, categoryId) : intents;
    const intentLimit = seedIsLive
      ? (seedAlreadySpecific ? Math.min(2, seedIntents.length) : Math.min(8, seedIntents.length))
      : intents.length;
    for (const intent of seedIntents.slice(0, intentLimit)) {
      if (!seed.includes(intent)) candidates.push(`${seed} ${intent}`);
      if (candidates.length >= candidateLimit) break;
    }
    if (candidates.length >= candidateLimit) break;
  }
  return uniqueKeywords(candidates, candidateLimit);
}

function liveMetricScore(volume: number, docs: number, ratio: number, actionable: boolean): number {
  const ratioScore = ratio >= 50 ? 100 : ratio >= 20 ? 94 : ratio >= 10 ? 86 : ratio >= 5 ? 76 : ratio >= 3 ? 66 : 48;
  const volumeScore = volume >= 10_000 ? 92 : volume >= 3_000 ? 86 : volume >= 1_000 ? 78 : volume >= 500 ? 68 : volume >= 100 ? 54 : 35;
  const docScore = docs <= 300 ? 100 : docs <= 1_000 ? 92 : docs <= 3_000 ? 86 : docs <= 8_000 ? 76 : docs <= 20_000 ? 58 : 35;
  const intentScore = actionable ? 100 : 0;
  return Math.round(ratioScore * 0.42 + volumeScore * 0.22 + docScore * 0.22 + intentScore * 0.14);
}

function liveGradeFromMetrics(score: number, volume: number, docs: number, ratio: number): MobileResultGrade {
  if (score >= 85 && volume >= 1000 && docs <= 5000 && ratio >= 5) return 'SSS';
  if (score >= 75 && volume >= 500 && docs <= 10000 && ratio >= 3) return 'SS';
  if (score >= 65 && volume >= 300 && ratio >= 2) return 'S';
  if (score >= 55 && volume >= 100) return 'A';
  if (score >= 45) return 'B';
  return 'C';
}

function rowToBackfillResult(
  row: Awaited<ReturnType<typeof getNaverKeywordSearchVolumeSeparate>>[number],
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
  const actionable = isActionableGoldenKeyword(keyword) || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(keyword);
  const score = liveMetricScore(volume, docs, ratio, actionable);
  const grade = liveGradeFromMetrics(score, volume, docs, ratio);
  const intentInfo = classifyKeywordIntent(keyword);
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
  return isLiveRadarQualityResult(result) ? result : null;
}

function liveIssueFallbackGrade(score: number, docs: number | null): MobileResultGrade {
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
  return {
    keyword,
    grade: normalizeGrade(result.grade, finiteNumber(result.score) || 0),
    score: finiteNumber(result.score),
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume,
    documentCount,
    goldenRatio: finiteNumber(result.goldenRatio),
    cpc: finiteNumber(result.cpc),
    category: inferLiveCategory(keyword, categoryId || 'live'),
    source: 'mobile-live-golden-radar',
    intent: result.intent || 'live-golden-discovery',
    evidence: [
      'mobile-live-golden-radar',
      result.goldenReason || '',
      ...(result.externalSources || []),
    ].filter(Boolean),
    isMeasured: totalSearchVolume !== null && documentCount !== null,
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
  getLiveSeedBackfillIntents,
  inferLiveCategory,
  normalizeLiveSeeds,
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
  private readonly measureLiveDocumentCount: typeof measureDocumentCount;
  private readonly hasCustomLiveDocumentMeasure: boolean;
  private readonly enableBackfill: boolean;
  private readonly shouldRun: () => MobileLiveGoldenRadarRunGate | boolean;
  private readonly setIntervalFn: (handler: () => void, intervalMs: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly setTimeoutFn: (handler: () => void, delayMs: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly now: () => Date;
  private timer: unknown = null;
  private startTimer: unknown = null;
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
  private lastStartedAt?: string;
  private lastFinishedAt?: string;
  private lastError?: string;
  private lastMessage?: string;

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
    this.maxSeeds = Math.max(20, Math.min(1000, Math.floor(
      options.maxSeeds || Math.max(240, this.boardTarget * 8),
    )));
    this.maxCandidates = Math.max(120, Math.min(3600, Math.floor(
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
    this.measureLiveDocumentCount = options.measureLiveDocumentCount || measureDocumentCount;
    this.hasCustomLiveDocumentMeasure = Boolean(options.measureLiveDocumentCount);
    this.enableBackfill = options.enableBackfill !== false;
    this.shouldRun = options.shouldRun || (() => true);
    this.setIntervalFn = options.setIntervalFn || ((handler, intervalMs) => setInterval(handler, intervalMs));
    this.clearIntervalFn = options.clearIntervalFn || ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.setTimeoutFn = options.setTimeoutFn || ((handler, delayMs) => setTimeout(handler, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn || ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now || (() => new Date());
    this.loadBoardFromFile();
  }

  start(): MobileLiveGoldenRadarSnapshot {
    if (this.enabled) return this.snapshot();
    this.enabled = true;
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
    this.enabled = false;
    this.lastMessage = 'live golden radar stopped';
    return this.snapshot();
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
    const discoveryLimit = Math.min(30, Math.max(this.cycleLimit * 3, this.cycleLimit));

    try {
      const env = this.getEnvConfig();
      if (!env.naverClientId || !env.naverClientSecret) {
        throw new Error('Naver Open API config missing');
      }

      const liveSeeds = await this.collectLiveSeeds(categoryId);
      const directMaxCandidates = directCandidateBudget(this.maxCandidates, this.cycleLimit);
      const existingIdsForRun = new Set(this.board.keys());
      const existingClustersForRun = new Set([...this.board.values()].map((item) => keywordClusterKey(item.keyword)).filter(Boolean));
      let qualityDirect: MDPResult[] = [];
      if (this.enableBackfill) {
        const backfill = await this.discoverBackfill({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, categoryId, liveSeeds);
        if (backfill.length > 0) {
          qualityDirect = [...qualityDirect, ...backfill];
        }
      }

      let novelQualityCount = qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)).length;
      if (novelQualityCount < this.cycleLimit || qualityDirect.length < this.cycleLimit) {
        const direct = await withTimeout(this.discover({
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
        }, {
          category: categoryId,
          limit: discoveryLimit,
          maxSeeds: this.maxSeeds,
          maxCandidates: directMaxCandidates,
          liveSeeds,
          includeCrossCategory: false,
          requireCategoryMatch: false,
          includeSearchAdSuggestions: true,
          suggestionSeedLimit: 12,
          suggestionsPerSeed: 18,
          maxSimilarPerCluster: 2,
        }), LIVE_DISCOVERY_TIMEOUT_MS, []);
        const directQuality = direct.filter(isLiveRadarQualityResult);
        if (directQuality.length > 0) {
          qualityDirect = [...qualityDirect, ...directQuality];
        }
      }

      novelQualityCount = qualityDirect.filter((item) => isNovelMdpResult(item, existingIdsForRun, existingClustersForRun)).length;
      if (this.enableBackfill && novelQualityCount < this.cycleLimit) {
        const globalBackfill = categoryId === 'all'
          ? []
          : await this.discoverBackfill({
            clientId: env.naverClientId,
            clientSecret: env.naverClientSecret,
          }, 'all', liveSeeds);
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
          requireActionableIntent: true,
          qualityBackfillToTarget: true,
        },
      );
      const rankedBackfill = rankedPrimary.length < this.cycleLimit && matchedDirect.length > 0
        ? rankGoldenDiscoveryResults(
          unmatchedDirect,
          discoveryLimit - rankedPrimary.length,
          false,
          {
            honorRequestedLimit: true,
            diversifySimilarIntents: true,
            maxSimilarPerCluster: 2,
            strictVisibleSssOnly: false,
            requireActionableIntent: true,
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
        this.cycleLimit,
        false,
        {
          honorRequestedLimit: true,
          diversifySimilarIntents: true,
          maxSimilarPerCluster: 2,
          strictVisibleSssOnly: false,
          requireActionableIntent: true,
          qualityBackfillToTarget: true,
        },
      );
      appendUniqueMdpResults(ranked, rankedNovel, seen, this.cycleLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedPrimary, seen, this.cycleLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedBackfill, seen, this.cycleLimit, isNovel);
      appendUniqueMdpResults(ranked, rankedPrimary, seen, this.cycleLimit);
      appendUniqueMdpResults(ranked, rankedBackfill, seen, this.cycleLimit);
      const rankedMetrics = ranked.map((item) => mapDirectResult(item, categoryId));
      const liveIssueFallback = rankedMetrics.length < this.cycleLimit && (this.enableBackfill || this.hasCustomLiveDocumentMeasure)
        ? await this.discoverLiveIssueFallback(categoryId, liveSeeds)
        : [];
      const resultMetrics: MobileKeywordMetric[] = [...rankedMetrics];
      const metricSeen = new Set<string>();
      for (const metric of rankedMetrics) {
        metricSeen.add(`id:${keywordId(metric.keyword)}`);
        metricSeen.add(`compact:${keywordCompactId(metric.keyword)}`);
      }
      for (const metric of liveIssueFallback) {
        if (resultMetrics.length >= this.cycleLimit) break;
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
      const result = resultFromMetrics(
        resultMetrics,
        startedAtMs,
      );
      this.mergeBoard(result.keywords);
      const published = this.notificationInbox?.publishFromResult({
        product: 'golden-discovery',
        kind: 'live-golden',
        title: '실시간 황금키워드 발견',
        targetLabel: categoryId,
        result,
        limit: Math.min(4, this.cycleLimit),
      }) || [];

      this.publishedCount += published.length;
      this.successfulRuns += 1;
      const fallbackCount = result.keywords.filter((item) => item.source === 'mobile-live-issue-document-radar').length;
      this.lastMessage = fallbackCount > 0
        ? `${categoryId} ${result.summary.total} found (${fallbackCount} live issue fallback), ${published.length} published`
        : `${categoryId} ${result.summary.total} found, ${published.length} published`;
    } catch (err) {
      this.failedRuns += 1;
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = this.lastError;
    } finally {
      this.running = false;
      this.lastFinishedAt = this.now().toISOString();
    }

    return this.snapshot();
  }

  async runUntilTarget(maxCycles = this.startupCatchUpCycles): Promise<MobileLiveGoldenRadarSnapshot> {
    const cycleBudget = Math.max(1, Math.min(8, Math.floor(maxCycles)));
    let snapshot = this.snapshot();
    for (let cycle = 0; cycle < cycleBudget && snapshot.boardCount < this.boardTarget; cycle += 1) {
      const beforeAttempts = this.totalRuns + this.skippedRuns + this.failedRuns;
      snapshot = await this.runOnce();
      const afterAttempts = this.totalRuns + this.skippedRuns + this.failedRuns;
      if (snapshot.running || afterAttempts === beforeAttempts) break;
      if (this.skippedRuns > 0 && /busy|skipped/i.test(snapshot.lastMessage || '')) break;
    }
    return snapshot;
  }

  private async collectLiveSeeds(categoryId: string): Promise<string[]> {
    try {
      if (this.liveSeedProvider) {
        return normalizeLiveSeeds(await this.liveSeedProvider(categoryId), 80);
      }
      const fallbackSeeds = getDiscoveryCategorySeeds(categoryId, 60);
      const [
        signalRows,
        policyRows,
        issueRows,
      ] = await Promise.all([
        withTimeout(
          import('../utils/signal-bz-crawler').then(({ getSignalBzKeywords }) => getSignalBzKeywords(16)),
          LIVE_SEED_COLLECTION_TIMEOUT_MS,
          [],
        ),
        withTimeout(
          import('../utils/policy-briefing-api').then(({ getPolicyBriefingKeywords }) => getPolicyBriefingKeywords(16)),
          LIVE_SEED_COLLECTION_TIMEOUT_MS,
          [],
        ),
        withTimeout(
          import('../utils/entertainment-news-aggregator').then(({ fetchEntertainmentAggregate }) => fetchEntertainmentAggregate({
            maxMinutesAgo: 360,
            limitPerSource: 8,
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
      for (const signal of allSignals) {
        const keyword = normalizeKeyword(signal.keyword);
        if (!keyword) continue;
        const signalCategory = normalizeKeyword(signal.categoryId);
        const inferredCategory = inferLiveCategory(keyword, signalCategory || categoryId);
        if (categoryId === 'all' || signalCategory === categoryId || inferredCategory === categoryId) {
          matched.push(keyword);
        } else {
          fallback.push(keyword);
        }
      }
      return uniqueKeywords([...normalizeLiveSeeds(matched, 50), ...normalizeLiveSeeds(fallback, 24), ...fallbackSeeds], 80);
    } catch {
      return uniqueKeywords(getDiscoveryCategorySeeds(categoryId, 60), 60);
    }
  }

  private async discoverBackfill(
    config: { clientId: string; clientSecret: string },
    categoryId: string,
    liveSeeds: string[],
  ): Promise<MDPResult[]> {
    const candidates = buildBackfillCandidates(categoryId, liveSeeds, this.maxSeeds);
    if (candidates.length === 0) return [];
    const measurementLimit = Math.max(60, Math.min(120, Math.floor(this.maxCandidates * 0.05)));
    const rows = await withTimeout(getNaverKeywordSearchVolumeSeparate(config, candidates.slice(0, measurementLimit), {
      includeDocumentCount: true,
    }), LIVE_BACKFILL_TIMEOUT_MS, []);
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
        && documentCountSupplements < 12
      ) {
        documentCountSupplements += 1;
        const measuredDc = await withTimeout(
          this.measureLiveDocumentCount(row.keyword, {
            searchVolume: volume,
            scrapeTimeoutMs: 1500,
          }).catch(() => null),
          3500,
          null,
        );
        if (measuredDc && !measuredDc.isEstimated && measuredDc.dc > 0) {
          enrichedRow = { ...row, documentCount: measuredDc.dc };
        }
      }
      const item = rowToBackfillResult(enrichedRow, categoryId);
      if (!item) continue;
      const id = mdpResultId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
    return rankGoldenDiscoveryResults(out, this.cycleLimit, false, {
      honorRequestedLimit: true,
      diversifySimilarIntents: true,
      maxSimilarPerCluster: 2,
      strictVisibleSssOnly: false,
      requireActionableIntent: true,
      qualityBackfillToTarget: true,
    });
  }

  private async discoverLiveIssueFallback(categoryId: string, liveSeeds: string[]): Promise<MobileKeywordMetric[]> {
    const liveSeedBases = normalizeLiveSeeds(liveSeeds, 36);
    if (liveSeedBases.length === 0) return [];

    const liveBaseIds = liveSeedBases.map((seed) => keywordCompactId(seed)).filter(Boolean);
    const isFromLiveSeed = (keyword: string): boolean => {
      const compact = keywordCompactId(keyword);
      return liveBaseIds.some((seedId) => compact.startsWith(seedId) || seedId.startsWith(compact));
    };
    const candidates = buildBackfillCandidates(categoryId, liveSeedBases, Math.min(this.maxSeeds, 240))
      .filter(isFromLiveSeed)
      .filter((keyword) => {
        const clean = normalizeKeyword(keyword);
        if (!clean || isMalformedLiveKeyword(clean) || isThinProfileIntentKeyword(clean)) return false;
        if (!isLiveRadarUsableKeyword(clean, null, null)) return false;
        return isActionableLiveKeyword(clean) || SPECIFIC_LIVE_KEYWORD_HINT_RE.test(clean);
      })
      .slice(0, LIVE_ISSUE_FALLBACK_DOCUMENT_LIMIT);

    const seen = new Set<string>();
    const out: MobileKeywordMetric[] = [];
    const measureOne = async (keyword: string): Promise<MobileKeywordMetric | null> => {
      const measured = await withTimeout(
        this.measureLiveDocumentCount(keyword, {
          searchVolume: 0,
          scrapeTimeoutMs: 1600,
        }).catch(() => null),
        3500,
        null,
      );
      if (!measured || measured.isEstimated || measured.dc <= 0 || measured.dc > 20_000) return null;
      const metric = metricFromLiveIssueFallback(keyword, categoryId, measured.dc);
      if (!metric) return null;
      return {
        ...metric,
        evidence: [
          ...metric.evidence,
          `document-source:${measured.source}`,
          `document-confidence:${measured.confidence}`,
        ],
      };
    };

    for (let i = 0; i < candidates.length && out.length < this.cycleLimit; i += LIVE_ISSUE_FALLBACK_CONCURRENCY) {
      const batch = candidates.slice(i, i + LIVE_ISSUE_FALLBACK_CONCURRENCY);
      const measured = await Promise.all(batch.map(measureOne));
      for (const metric of measured) {
        if (!metric) continue;
        const compactId = keywordCompactId(metric.keyword);
        if (seen.has(compactId)) continue;
        seen.add(compactId);
        out.push(metric);
        if (out.length >= this.cycleLimit) break;
      }
    }

    return out
      .sort((a, b) => {
        const gradeDelta = (GRADE_WEIGHT[b.grade] || 0) - (GRADE_WEIGHT[a.grade] || 0);
        if (gradeDelta !== 0) return gradeDelta;
        const scoreDelta = (b.score || 0) - (a.score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return (a.documentCount || Number.MAX_SAFE_INTEGER) - (b.documentCount || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, this.cycleLimit);
  }

  snapshot(): MobileLiveGoldenRadarSnapshot {
    const board = this.sortedBoard();
    const publicPreviewIds = new Set(this.selectPublicPreview(board).map((item) => item.id));
    const markedBoard = board.map((item) => ({
      ...item,
      isPublicPreview: publicPreviewIds.has(item.id),
    }));
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      cycleLimit: this.cycleLimit,
      maxCandidates: this.maxCandidates,
      boardTarget: this.boardTarget,
      boardCount: markedBoard.length,
      publicPreviewCount: Math.min(this.publicPreviewCount, markedBoard.length),
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
      lastError: this.lastError,
      lastMessage: this.lastMessage,
      nextCategoryId: this.categories[this.categoryIndex] || 'all',
      categories: [...this.categories],
    };
  }

  private selectPublicPreview(board: MobileLiveGoldenBoardItem[]): MobileLiveGoldenBoardItem[] {
    const count = Math.min(this.publicPreviewCount, board.length);
    if (count <= 0) return [];
    const nowMs = this.now().getTime();
    const protectedTopCount = board.length > count
      ? Math.min(PUBLIC_PREVIEW_PROTECTED_TOP_COUNT, Math.max(0, board.length - count))
      : 0;
    const freeBoard = protectedTopCount > 0 ? board.slice(protectedTopCount) : board;
    const isFresh = (item: MobileLiveGoldenBoardItem) => ageMsFrom(item.updatedAt, nowMs) <= PUBLIC_PREVIEW_MAX_AGE_MS;
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
      .filter(isLiveRadarUsableMetric)
      .filter(isFresh);
    const freshFallback = freeBoard
      .filter(isPublicPreviewFallbackCandidate)
      .filter(isFresh);
    const warmMetricSource = protectedTopCount > 0
      ? freeBoard
        .filter(isLiveRadarUsableMetric)
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

  private mergeBoard(keywords: MobileKeywordMetric[]): void {
    if (keywords.length === 0) return;
    const stamp = this.now().toISOString();
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeKeyword(keyword.keyword);
      if (!normalizedKeyword || keyword.grade === 'C') continue;
      if (!isLiveRadarUsableMetric({ ...keyword, keyword: normalizedKeyword })) continue;
      const id = keywordId(normalizedKeyword);
      const compactId = keywordCompactId(normalizedKeyword);
      const existing = this.board.get(id)
        || [...this.board.values()].find((item) => keywordCompactId(item.keyword) === compactId);
      const boardId = existing?.id || id;
      const item: MobileLiveGoldenBoardItem = {
        ...keyword,
        keyword: normalizedKeyword,
        id: boardId,
        rank: existing?.rank || 0,
        discoveredAt: existing?.discoveredAt || stamp,
        updatedAt: stamp,
        freshness: 'live',
        isPublicPreview: false,
        publicSearchVolumeLabel: formatRange(keyword.totalSearchVolume, 'search'),
        publicDocumentCountLabel: formatRange(keyword.documentCount, 'document'),
        publicReason: publicReason(keyword),
      };
      this.board.set(boardId, item);
    }

    this.pruneBoard();
    this.boardUpdatedAt = stamp;
    this.saveBoardToFile();
  }

  private sortedBoard(): MobileLiveGoldenBoardItem[] {
    const nowMs = this.now().getTime();
    const sorted = [...this.board.values()]
      .filter((item) => ageMsFrom(item.updatedAt, nowMs) <= LIVE_BOARD_MAX_AGE_MS)
      .map((item) => ({
        ...item,
        freshness: freshnessFrom(item.updatedAt, nowMs),
      }))
      .sort((a, b) => {
        const scoreDiff = boardSortScore(b, nowMs) - boardSortScore(a, nowMs);
        if (scoreDiff !== 0) return scoreDiff;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    return selectLiveBoardItems(sorted, this.boardTarget)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
  }

  private pruneBoard(): void {
    const keepIds = new Set(this.sortedBoard().map((item) => item.id));
    for (const item of [...this.board.values()]) {
      if (!keepIds.has(item.id)) this.board.delete(item.id);
    }
  }

  private loadBoardFromFile(): void {
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
      for (const row of rows) {
        const keyword = normalizeKeyword(row?.keyword);
        if (!keyword) continue;
        const totalSearchVolume = finiteNumber(row?.totalSearchVolume);
        const documentCount = finiteNumber(row?.documentCount);
        const grade = normalizeGrade(row?.grade, finiteNumber(row?.score) || 0);
        if (grade === 'C') continue;
        if (!isLiveRadarUsableKeyword(keyword, totalSearchVolume, documentCount)) continue;
        const id = normalizeKeyword(row?.id) || keywordId(keyword);
        const item: MobileLiveGoldenBoardItem = {
          keyword,
          grade,
          score: finiteNumber(row?.score),
          pcSearchVolume: finiteNumber(row?.pcSearchVolume),
          mobileSearchVolume: finiteNumber(row?.mobileSearchVolume),
          totalSearchVolume,
          documentCount,
          goldenRatio: finiteNumber(row?.goldenRatio),
          cpc: finiteNumber(row?.cpc),
          category: inferLiveCategory(keyword, normalizeKeyword(row?.category) || 'live'),
          source: normalizeKeyword(row?.source) || 'mobile-live-golden-radar',
          intent: normalizeKeyword(row?.intent) || 'live-golden-discovery',
          evidence: Array.isArray(row?.evidence)
            ? row.evidence.map((entry: unknown) => normalizeKeyword(entry)).filter(Boolean).slice(0, 8)
            : [],
          isMeasured: Boolean(row?.isMeasured) || (totalSearchVolume !== null && documentCount !== null),
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
            score: finiteNumber(row?.score),
            pcSearchVolume: finiteNumber(row?.pcSearchVolume),
            mobileSearchVolume: finiteNumber(row?.mobileSearchVolume),
            totalSearchVolume,
            documentCount,
            goldenRatio: finiteNumber(row?.goldenRatio),
            cpc: finiteNumber(row?.cpc),
            category: normalizeKeyword(row?.category) || 'live',
            source: normalizeKeyword(row?.source) || 'mobile-live-golden-radar',
            intent: normalizeKeyword(row?.intent) || 'live-golden-discovery',
            evidence: [],
            isMeasured: Boolean(row?.isMeasured) || (totalSearchVolume !== null && documentCount !== null),
          }),
        };
        this.board.set(id, item);
      }
      this.pruneBoard();
      this.boardUpdatedAt = normalizeKeyword(parsed?.boardUpdatedAt) || this.sortedBoard()[0]?.updatedAt;
      this.lastMessage = `loaded ${this.board.size} live golden board items`;
    } catch (err) {
      this.lastError = (err as Error).message || String(err);
      this.lastMessage = `live golden board load failed: ${this.lastError}`;
    }
  }

  private saveBoardToFile(): void {
    if (!this.boardFile) return;
    try {
      fs.mkdirSync(path.dirname(this.boardFile), { recursive: true });
      const payload = {
        version: 1,
        boardUpdatedAt: this.boardUpdatedAt,
        savedAt: this.now().toISOString(),
        items: this.sortedBoard(),
      };
      const tmpFile = `${this.boardFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.boardFile);
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
  const runOnStart = process.env['LEWORD_MOBILE_LIVE_GOLDEN_ON_START'] !== 'false';
  return new MobileLiveGoldenRadar({
    notificationInbox,
    shouldRun,
    intervalMs: Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? intervalMinutes * 60 * 1000
      : undefined,
    cycleLimit: Number.isFinite(cycleLimit) && cycleLimit > 0 ? cycleLimit : undefined,
    boardTarget: Number.isFinite(boardTarget) && boardTarget > 0 ? boardTarget : undefined,
    publicPreviewCount: Number.isFinite(publicPreviewCount) && publicPreviewCount > 0 ? publicPreviewCount : undefined,
    boardFile: boardFile || undefined,
    maxSeeds: Number.isFinite(maxSeeds) && maxSeeds > 0 ? maxSeeds : undefined,
    maxCandidates: Number.isFinite(maxCandidates) && maxCandidates > 0 ? maxCandidates : undefined,
    startupCatchUpCycles: Number.isFinite(startupCatchUpCycles) && startupCatchUpCycles > 0
      ? startupCatchUpCycles
      : undefined,
    runOnStart,
  });
}
