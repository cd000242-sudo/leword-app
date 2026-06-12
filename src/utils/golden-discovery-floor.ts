import type { GoldenGrade } from './mdp-engine';

export const GOLDEN_DISCOVERY_SSS_FLOOR = 30;

export interface GoldenDiscoveryLike {
  keyword: string;
  grade?: GoldenGrade | string;
  score?: number;
  searchVolume?: number | null;
  totalSearchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
  cpc?: number | null;
  measurementOnly?: boolean;
}

export interface GoldenDiscoveryScanOptions {
  categoryFirst?: boolean;
  honorRequestedLimit?: boolean;
}

export interface GoldenDiscoveryTargetOptions {
  honorRequestedLimit?: boolean;
  diversifySimilarIntents?: boolean;
  maxSimilarPerCluster?: number;
  strictSssGate?: boolean;
  strictVisibleSssOnly?: boolean;
  requireActionableIntent?: boolean;
  qualityBackfillToTarget?: boolean;
}

function gradeRank(grade: unknown): number {
  const g = String(grade || '').toUpperCase();
  if (g === 'SSS') return 6;
  if (g === 'SS') return 5;
  if (g === 'S') return 4;
  if (g === 'A') return 3;
  if (g === 'B') return 2;
  return 1;
}

export function compactGoldenKeyword(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function readFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readSearchVolume(item: GoldenDiscoveryLike): number {
  return readFiniteNumber(item.searchVolume)
    ?? readFiniteNumber(item.totalSearchVolume)
    ?? 0;
}

function readDocumentCount(item: GoldenDiscoveryLike): number {
  return readFiniteNumber(item.documentCount) ?? 0;
}

function readGoldenRatio(item: GoldenDiscoveryLike): number {
  return readFiniteNumber(item.goldenRatio) ?? 0;
}

function readScore(item: GoldenDiscoveryLike): number | null {
  return readFiniteNumber(item.score);
}

const KOREAN_RE = /[가-힣]/;
const ACTIONABLE_INTENT_RE = /(추천|비교|후기|리뷰|가격|할인|세일|쿠폰|코디|사이즈|브랜드|순위|랭킹|베스트|구매|고르는법|선택|차이|장단점|방법|하는법|사용법|설정|오류|해결|신청|대상|자격|조건|서류|준비물|지급일|마감|조회|발표|일정|예매|티켓|티켓팅|예약|등급컷|답지|정답|기출|모의고사|컷|뜻|의미|원인|주의사항|부작용|효능|검사|증상|맛집|메뉴|위치|주차|영업시간|입장료|시간표|노선|실수|체크리스트|전망|배당|주가|공모주|청약|세액공제|환급|정산|비용|견적|방송시간|출연진|몇부작|재방송|시청률|다시보기|게스트|공개일|방영일|개봉일|쿠키|OTT|결말|해석|중계|하이라이트|라인업|공식입장|해명|근황|사전예약|개막전|올스타전|월드컵|프로야구|기자회견|회동|발언|입장|논란|비주얼|공개|MVP|급락|관련주|소식)/i;
const FAST_ISSUE_INTENT_RE = /(뜻|의미|근황|공식입장|해명|입장문|결말|몇부작|출연진|방송시간|재방송|중계|하이라이트|라인업|예매|티켓팅|등급컷|답지|정답|발표|신청|조회|마감|일정|개봉일|출시일|오픈|변경|업데이트|사전예약|개막전|올스타전|월드컵|프로야구|KBO|기자회견|회동|발언|입장|논란|비주얼|공개|MVP|급락|관련주|소식)/i;
const ISSUE_PROFILE_INTENT_RE = /(프로필|약력|인물정보|나이|인스타|근황|공식입장)/i;
const ISSUE_HOLIDAY_INTENT_RE = /(공휴일|대체공휴일|임시공휴일|쉬는날|빨간날)/i;
const ISSUE_LOTTERY_INTENT_RE = /(당첨번호|당첨지역|실수령액|판매점|추첨시간)/i;
const ISSUE_BROADCAST_INTENT_RE = /(공식영상|다시보기|재방송|예고편|방청신청|원작|인물관계도|등장인물)/i;
const ISSUE_FINANCE_INTENT_RE = /(주가|전망|배당|공모주|청약|환율|금리|실적|목표가|온누리상품권)/i;
const SPECIFIC_MODIFIER_RE = /((20\d{2}|[1-9]|1[0-2])\s*월|상반기|하반기|봄|여름|가을|겨울|최신|오늘|이번주|이번달|하객|출근|면접|휴양지|장마|장마철|키작녀|빅사이즈|통통|마른|체형|40대|50대|30대|20대|10대|남자|여자|여성|남성|초등|중등|고등|대학생|직장인|신혼|자취|원룸|민감성|지성|건성|임산부|반려견|반려묘|아기|아이|부산|서울|제주|대구|광주|인천|수원|세종|지역|만원대|가격대|전기세|환급|세액공제|월세|전세|청약|사전예약|올스타전|개막전|하이라이트|결말|공식입장|중계|티켓팅|지급일|등급컷|답지|서류|조건|대상|조회|신청|예약|예매|방송시간|출연진|라인업|주차|영업시간|입장료|위치|노선|시간표|비용|견적|체크리스트|기자회견|회동|발언|입장|논란|비주얼|공개|MVP|급락|관련주|소식)/i;
const BROAD_BARE_RE = /^(뉴스|실시간|오늘|이슈|연예|스포츠|정치|경제|사회|날씨|주식|코인|로또|추천|후기|비교|가격|랭킹|순위)$/i;
const SEMI_LARGE_COMPACT_RE = /^(봄|여름|가을|겨울|최신|202\d)?(원피스|블라우스|티셔츠|샌들|가방|선크림|화장품|쿠션|립스틱|에어컨|제습기|냉장고|노트북|휴대폰|아이폰|갤럭시|다이어트)(추천|코디|사이즈|사이즈비교|비교|후기|리뷰|가격|할인)$/i;

function keywordTokens(keyword: string): string[] {
  return String(keyword || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => token.trim())
    .filter(Boolean);
}

export function isActionableGoldenKeyword(keyword: string): boolean {
  const value = String(keyword || '').replace(/\s+/g, ' ').trim();
  const compact = compactGoldenKeyword(value).replace(/[^\p{L}\p{N}]/gu, '');
  if (!value || compact.length < 3) return false;
  if (!KOREAN_RE.test(value)) return false;
  if (BROAD_BARE_RE.test(value) || BROAD_BARE_RE.test(compact)) return false;
  if (SEMI_LARGE_COMPACT_RE.test(compact)) return false;

  const tokens = keywordTokens(value);
  const hasIntent = ACTIONABLE_INTENT_RE.test(value)
    || ACTIONABLE_INTENT_RE.test(compact)
    || ISSUE_PROFILE_INTENT_RE.test(value)
    || ISSUE_PROFILE_INTENT_RE.test(compact)
    || ISSUE_HOLIDAY_INTENT_RE.test(value)
    || ISSUE_HOLIDAY_INTENT_RE.test(compact)
    || ISSUE_LOTTERY_INTENT_RE.test(value)
    || ISSUE_LOTTERY_INTENT_RE.test(compact)
    || ISSUE_BROADCAST_INTENT_RE.test(value)
    || ISSUE_BROADCAST_INTENT_RE.test(compact)
    || ISSUE_FINANCE_INTENT_RE.test(value)
    || ISSUE_FINANCE_INTENT_RE.test(compact);
  if (!hasIntent) return false;

  const hasIssueIntent = FAST_ISSUE_INTENT_RE.test(value) || FAST_ISSUE_INTENT_RE.test(compact);
  if (hasIssueIntent && compact.length >= 4) return true;
  const hasProfileIssueIntent = ISSUE_PROFILE_INTENT_RE.test(value) || ISSUE_PROFILE_INTENT_RE.test(compact);
  if (
    hasProfileIssueIntent
    && compact.length >= 5
    && (tokens.length >= 2 || /(프로필|나이|인스타|근황|공식입장)$/.test(compact))
  ) return true;
  const hasHolidayIssueIntent = ISSUE_HOLIDAY_INTENT_RE.test(value) || ISSUE_HOLIDAY_INTENT_RE.test(compact);
  if (hasHolidayIssueIntent && (tokens.length >= 2 || /(20\d{2}|제헌절|광복절|추석|설날|한글날|개천절|어린이날|석가탄신일|부처님오신날|크리스마스)/.test(value))) return true;
  const hasLotteryIssueIntent = ISSUE_LOTTERY_INTENT_RE.test(value) || ISSUE_LOTTERY_INTENT_RE.test(compact);
  if (hasLotteryIssueIntent && /(로또|복권|[0-9]{3,4}회)/.test(value)) return true;
  const hasBroadcastIssueIntent = ISSUE_BROADCAST_INTENT_RE.test(value) || ISSUE_BROADCAST_INTENT_RE.test(compact);
  if (hasBroadcastIssueIntent && compact.length >= 5) return true;
  const hasFinanceIssueIntent = ISSUE_FINANCE_INTENT_RE.test(value) || ISSUE_FINANCE_INTENT_RE.test(compact);
  if (hasFinanceIssueIntent && tokens.length >= 2 && compact.length >= 5) return true;

  const hasSpecificModifier = SPECIFIC_MODIFIER_RE.test(value) || SPECIFIC_MODIFIER_RE.test(compact);
  if (hasSpecificModifier) return true;

  return tokens.length >= 4 && compact.length >= 8;
}

export function isStrictGoldenDiscoverySss(item: GoldenDiscoveryLike): boolean {
  if (String(item?.grade || '').toUpperCase() !== 'SSS') return false;
  if (item.measurementOnly === true) return false;
  const score = readScore(item);
  const volume = readSearchVolume(item);
  const docs = readDocumentCount(item);
  const ratio = readGoldenRatio(item);
  return (score === null || score >= 85)
    && volume >= 1000
    && docs > 0
    && docs <= 5000
    && ratio >= 5;
}

export function isActionableGoldenDiscoverySss(item: GoldenDiscoveryLike): boolean {
  return isStrictGoldenDiscoverySss(item) && isActionableGoldenKeyword(item.keyword);
}

export function isQualityGoldenDiscoveryResult(
  item: GoldenDiscoveryLike,
  options: Pick<GoldenDiscoveryTargetOptions, 'requireActionableIntent'> = {},
): boolean {
  if (!item || item.measurementOnly === true) return false;
  if (options.requireActionableIntent && !isActionableGoldenKeyword(item.keyword)) return false;
  if (isStrictGoldenDiscoverySss(item)) return true;

  const grade = String(item.grade || '').toUpperCase();
  const score = readScore(item);
  const volume = readSearchVolume(item);
  const docs = readDocumentCount(item);
  const ratio = readGoldenRatio(item);
  if (score === null || volume <= 0 || docs <= 0 || ratio <= 0) return false;

  if (grade === 'SS') {
    return score >= 75
      && volume >= 500
      && docs <= 10000
      && ratio >= 3;
  }

  if (grade === 'S') {
    return score >= 65
      && volume >= 300
      && ratio >= 2;
  }

  if (grade === 'A') {
    return score >= 60
      && volume >= 100
      && docs <= 8000
      && ratio >= 1.5;
  }

  return false;
}

function shouldDropInvalidSss(item: GoldenDiscoveryLike, options: GoldenDiscoveryTargetOptions): boolean {
  if (options.strictSssGate === false) return false;
  return String(item?.grade || '').toUpperCase() === 'SSS' && !isStrictGoldenDiscoverySss(item);
}

function similarityKey(keyword: string): string {
  return compactGoldenKeyword(keyword).replace(/[^\p{L}\p{N}]/gu, '');
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) {
    out.add(value.slice(i, i + 2));
  }
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;
  let overlap = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) overlap++;
  }
  return (2 * overlap) / (aGrams.size + bGrams.size);
}

function isSimilarIntent(a: string, b: string): boolean {
  const left = similarityKey(a);
  const right = similarityKey(b);
  if (!left || !right || left === right) return left === right;
  const minLen = Math.min(left.length, right.length);
  const maxLen = Math.max(left.length, right.length);
  if (minLen < 6) return false;
  if ((left.includes(right) || right.includes(left)) && minLen / maxLen >= 0.6) return true;
  return diceSimilarity(left, right) >= 0.76;
}

function diversifyGoldenResults<T extends GoldenDiscoveryLike>(
  sorted: T[],
  options: GoldenDiscoveryTargetOptions,
): T[] {
  if (!options.diversifySimilarIntents) return sorted;
  const maxSimilar = Math.max(1, Math.floor(Number(options.maxSimilarPerCluster) || 2));
  const clusters: Array<{ representative: string; count: number }> = [];
  const selected: T[] = [];

  for (const item of sorted) {
    const match = clusters.find(cluster => isSimilarIntent(cluster.representative, item.keyword));
    if (!match) {
      clusters.push({ representative: item.keyword, count: 1 });
      selected.push(item);
      continue;
    }
    if (match.count < maxSimilar) {
      match.count++;
      selected.push(item);
    }
  }

  return selected;
}

export interface GoldenSssTargetTracker {
  readonly uniqueSssCount: number;
  add(item: GoldenDiscoveryLike): number;
  shouldStop(): boolean;
}

export function resolveGoldenDiscoveryTarget(
  requestedLimit: number,
  options: GoldenDiscoveryTargetOptions = {},
): number {
  const requested = Math.max(1, Math.floor(Number(requestedLimit) || GOLDEN_DISCOVERY_SSS_FLOOR));
  return options.honorRequestedLimit
    ? requested
    : Math.max(GOLDEN_DISCOVERY_SSS_FLOOR, requested);
}

export function createGoldenSssTargetTracker(
  targetCount: number,
  options: GoldenDiscoveryTargetOptions = {},
): GoldenSssTargetTracker {
  const target = Math.max(
    1,
    resolveGoldenDiscoveryTarget(targetCount, options),
  );
  const seenSss = new Set<string>();
  const clusters: Array<{ representative: string; count: number }> = [];
  const diversify = options.diversifySimilarIntents === true;
  const maxSimilar = Math.max(1, Math.floor(Number(options.maxSimilarPerCluster) || 2));

  return {
    get uniqueSssCount() {
      return seenSss.size;
    },
    add(item: GoldenDiscoveryLike): number {
      if (!isStrictGoldenDiscoverySss(item)) return seenSss.size;
      if (options.requireActionableIntent && !isActionableGoldenKeyword(item.keyword)) return seenSss.size;
      const key = compactGoldenKeyword(item.keyword);
      if (!key || seenSss.has(key)) return seenSss.size;
      if (diversify) {
        const match = clusters.find(cluster => isSimilarIntent(cluster.representative, item.keyword));
        if (match) {
          if (match.count >= maxSimilar) return seenSss.size;
          match.count++;
        } else {
          clusters.push({ representative: item.keyword, count: 1 });
        }
      }
      seenSss.add(key);
      return seenSss.size;
    },
    shouldStop(): boolean {
      return seenSss.size >= target;
    },
  };
}

export function getGoldenDiscoveryScanLimit(
  requestedLimit: number,
  isUnlimited: boolean,
  seedCount = 0,
  options: GoldenDiscoveryScanOptions = {},
): number {
  const categoryFirst = options.categoryFirst === true;
  if (isUnlimited) return categoryFirst ? 12000 : 5000;
  const honorRequestedLimit = options.honorRequestedLimit === true;
  const displayTarget = resolveGoldenDiscoveryTarget(requestedLimit || GOLDEN_DISCOVERY_SSS_FLOOR, { honorRequestedLimit });
  const targetPressure = categoryFirst
    ? displayTarget * (honorRequestedLimit ? 36 : 80)
    : displayTarget * (honorRequestedLimit ? 8 : 12);
  const seedPressure = seedCount > 0
    ? Math.min(
      categoryFirst ? (honorRequestedLimit ? 1600 : 12000) : 2400,
      Math.max(0, seedCount * (categoryFirst ? (honorRequestedLimit ? 2 : 12) : 4)),
    )
    : 0;
  return Math.min(
    categoryFirst ? (honorRequestedLimit ? 1800 : 12000) : 5000,
    Math.max(targetPressure, categoryFirst ? (honorRequestedLimit ? 360 : 2400) : 180, seedPressure),
  );
}

export function countSss<T extends GoldenDiscoveryLike>(items: T[]): number {
  return items.filter(item => isStrictGoldenDiscoverySss(item)).length;
}

export function rankGoldenDiscoveryResults<T extends GoldenDiscoveryLike>(
  items: T[],
  requestedLimit: number,
  isUnlimited = false,
  options: GoldenDiscoveryTargetOptions = {},
): T[] {
  const candidates: T[] = [];
  for (const item of items || []) {
    if (shouldDropInvalidSss(item, options)) continue;
    if (options.strictVisibleSssOnly && !isStrictGoldenDiscoverySss(item)) {
      if (!options.qualityBackfillToTarget || !isQualityGoldenDiscoveryResult(item, options)) continue;
    }
    if (options.requireActionableIntent && !isActionableGoldenKeyword(item.keyword)) continue;
    if (!compactGoldenKeyword(item.keyword)) continue;
    candidates.push(item);
  }

  const sorted = candidates.sort((a, b) => {
    const gradeDiff = gradeRank(b.grade) - gradeRank(a.grade);
    if (gradeDiff !== 0) return gradeDiff;

    const scoreDiff = (readScore(b) || 0) - (readScore(a) || 0);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

    const ratioDiff = readGoldenRatio(b) - readGoldenRatio(a);
    if (Math.abs(ratioDiff) > 0.001) return ratioDiff;

    const docA = readDocumentCount(a);
    const docB = readDocumentCount(b);
    const dcA = docA > 0 ? docA : Number.MAX_SAFE_INTEGER;
    const dcB = docB > 0 ? docB : Number.MAX_SAFE_INTEGER;
    if (dcA !== dcB) return dcA - dcB;

    const svDiff = readSearchVolume(b) - readSearchVolume(a);
    if (svDiff !== 0) return svDiff;

    return (b.cpc || 0) - (a.cpc || 0);
  });

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of sorted) {
    const key = compactGoldenKeyword(item.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const diversified = diversifyGoldenResults(unique, options);
  if (isUnlimited) return diversified;
  const displayTarget = resolveGoldenDiscoveryTarget(requestedLimit || GOLDEN_DISCOVERY_SSS_FLOOR, options);
  return diversified.slice(0, displayTarget);
}
