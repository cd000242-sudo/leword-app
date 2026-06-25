/**
 * 쇼핑 커넥트 자동 추천 키워드
 *
 * 소스 우선순위:
 *   1. rich-feed 디스크 캐시(오늘의 황금키워드) — 있으면 최우선
 *   2. 정적 커머스 풀 (블루오션 + 고CPC 카테고리)
 *
 * UI 열리자마자 노출 → 클릭만 하면 검색 실행.
 */

// 카테고리별 커머스 키워드 — 블로그 전환율 높은 영역 중심
const COMMERCE_SEEDS: Record<string, string[]> = {
  '🎧 가전/디지털': [
    '무선 이어폰', '블루투스 스피커', '공기청정기', '로봇청소기',
    '무선 청소기', '에어프라이어', '가습기', '식기세척기',
    '스마트워치', '모니터', '게이밍 키보드', '노트북 거치대',
  ],
  '💄 뷰티/화장품': [
    '쿠션 팩트', '아이크림', '선크림', '앰플',
    '클렌징 오일', '토너패드', '시트 마스크', '남자 스킨로션',
  ],
  '💪 건강/다이어트': [
    '비타민D', '프로바이오틱스', '오메가3', '루테인',
    '콜라겐', '밀크씨슬', '단백질 보충제', '다이어트 보조제',
  ],
  '⛺ 캠핑/아웃도어': [
    '캠핑 의자', '텐트', '침낭', '등산 배낭',
    '캠핑 테이블', '랜턴', '화목난로', '캠핑카',
  ],
  '👶 육아/유아': [
    '유모차', '카시트', '분유', '기저귀',
    '젖병', '이유식 용기', '아기 침대', '아기 의자',
  ],
  '🏠 주방/생활': [
    '프라이팬', '식칼 세트', '전기밥솥', '커피머신',
    '밥그릇 세트', '물병', '텀블러', '수건 세트',
  ],
  '🏃 운동/피트니스': [
    '요가매트', '아령', '실내자전거', '러닝머신',
    '헬스 장갑', '줄넘기', '폼롤러', '요가복',
  ],
  '🐶 반려동물': [
    '강아지 사료', '고양이 모래', '자동 급식기', '반려견 하우스',
    '고양이 스크래쳐', '펫 카메라',
  ],
  '🛏️ 침구/인테리어': [
    '구스 이불', '메모리폼 베개', '라텍스 매트리스',
    '블랙아웃 커튼', 'LED 스탠드',
  ],
  '👟 패션/잡화': [
    '러닝화', '여성 가방', '남자 지갑', '레인부츠',
    '여름 샌들', '기능성 티셔츠', '노트북 백팩', '데일리 운동화',
  ],
  '🚗 차량용품': [
    '블랙박스', '차량용 청소기', '차량용 공기청정기', '타이어 공기압 주입기',
    '차량용 냉장고', '하이패스 단말기', '차량용 무선충전기', '엔진오일',
  ],
  '🎁 선물/시즌': [
    '집들이 선물', '부모님 선물', '어버이날 선물', '스승의날 선물',
    '생일 선물', '신혼부부 선물', '명절 선물세트', '회사 답례품',
  ],
};

export const SHOPPING_AUTO_DISCOVERY_MIN_SEEDS = 30;
export const SHOPPING_AUTO_DISCOVERY_MAX_SEEDS = 60;

const SHOPPING_DISCOVERY_INTENT_TOKENS = [
  '추천',
  '비교',
  '후기',
  '리뷰',
  '가성비',
  '순위',
  '가격',
  '할인',
  '구매',
  '체크포인트',
  '장단점',
] as const;

const SHOPPING_DISCOVERY_INTENT_PATTERN = new RegExp(SHOPPING_DISCOVERY_INTENT_TOKENS.join('|'));
const SHOPPING_DISCOVERY_SUFFIX_PATTERN = new RegExp(`\\s+(${SHOPPING_DISCOVERY_INTENT_TOKENS.join('|')})$`);

export function ensureShoppingDiscoveryIntentQuery(keyword: string): string {
  let cleaned = String(keyword || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (SHOPPING_DISCOVERY_INTENT_PATTERN.test(cleaned)) {
    return cleaned.slice(0, 35).trim();
  }

  const suffix = '추천';
  const maxBaseLength = Math.max(2, 35 - suffix.length - 1);
  if (cleaned.length > maxBaseLength) {
    cleaned = cleaned.slice(0, maxBaseLength).trim();
  }
  return `${cleaned} ${suffix}`.trim();
}

export function normalizeShoppingAutoDiscoveryLimit(limit?: number | string | null): number {
  const raw = Number(limit);
  const base = Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : SHOPPING_AUTO_DISCOVERY_MIN_SEEDS;
  return Math.min(
    Math.max(base, SHOPPING_AUTO_DISCOVERY_MIN_SEEDS),
    SHOPPING_AUTO_DISCOVERY_MAX_SEEDS
  );
}

export function getShoppingRecommendationLimit(
  autoDiscovery: boolean,
  requestedLimit?: number | string | null
): number {
  void autoDiscovery;
  return normalizeShoppingAutoDiscoveryLimit(requestedLimit);
}

export function getShoppingAutoDiscoveryExpansionLimit(
  seedCount: number,
  requestedLimit?: number | string | null
): number {
  const target = normalizeShoppingAutoDiscoveryLimit(requestedLimit);
  const seedCapacity = Math.max(0, Math.floor(seedCount) - 1);
  return Math.min(
    SHOPPING_AUTO_DISCOVERY_MAX_SEEDS,
    Math.max(24, target - 1, seedCapacity)
  );
}

export function getShoppingAutoDiscoverySearchLimit(
  seedCount: number,
  requestedLimit?: number | string | null
): number {
  const target = normalizeShoppingAutoDiscoveryLimit(requestedLimit);
  const seedCapacity = Math.max(0, Math.floor(seedCount) - 1);
  return Math.min(
    30,
    Math.max(24, Math.ceil(target * 0.8), Math.min(seedCapacity, 30))
  );
}

export interface SuggestionGroup {
  category: string;
  keywords: string[];
}

/**
 * 정적 풀 + (옵션) 동적 피드 합병
 * 각 카테고리에서 4개씩 회전 샘플링 → 무입력 발굴도 30개 이상 확보
 */
export function getStaticShoppingSuggestions(perCategory: number = 4): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  for (const [category, all] of Object.entries(COMMERCE_SEEDS)) {
    // 시간 기반 회전(6시간마다 다른 샘플) — Math.random 금지 (grading 규칙이 아니라 샘플링이라 허용되나, 회전으로 대체)
    const shift = Math.floor(Date.now() / (6 * 60 * 60_000)) % Math.max(1, all.length);
    const rotated = [...all.slice(shift), ...all.slice(0, shift)];
    groups.push({ category, keywords: rotated.slice(0, perCategory) });
  }
  return groups;
}

/**
 * rich-feed 디스크 캐시에서 커머스성 키워드 추출
 * - 문서수 보유 + 카테고리가 전체/정보성 아닌 것
 * - 최근 24시간 내 것만
 */
export function getDynamicSuggestionsFromRichFeed(): string[] {
  try {
    const fs = require('fs');
    const path = require('path');
    let cachePath: string;
    try {
      const { app } = require('electron');
      cachePath = path.join(app.getPath('userData'), 'rich-feed-cache.json');
    } catch {
      const os = require('os');
      cachePath = path.join(os.tmpdir(), 'leword-rich-feed-cache.json');
    }

    if (!fs.existsSync(cachePath)) return [];
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!data || !Array.isArray(data.rows)) return [];
    if (Date.now() - (data.timestamp || 0) > 24 * 60 * 60_000) return [];

    // 커머스 가능한 것만 필터 — 인물명·이슈 제외
    const commerceCategories = new Set([
      '뷰티/화장품', '주방용품', '차량관리/정비', '노트북/PC/태블릿',
      '요리/레시피', 'AI도구', '취업/이직', '생활 꿀팁', '전체',
    ]);

    return data.rows
      .filter((r: any) => {
        if (!r.keyword) return false;
        if (r.documentCount <= 0) return false;
        if (commerceCategories.has(r.category)) return true;
        // 기본 카테고리가 이슈/인물명성이면 제외
        return false;
      })
      .slice(0, 15)
      .map((r: any) => String(r.keyword).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================
// 정적 풀 실시간 황금순 검증
// ============================================================

export interface VerifiedKeyword {
  keyword: string;
  category: string;
  pcSearchVolume?: number;
  mobileSearchVolume?: number;
  searchVolume: number;
  documentCount: number;
  goldenRatio: number;
}

export type ShoppingDiscoverySeedSource = 'verified' | 'dynamic' | 'static';

export interface ShoppingDiscoverySeed {
  keyword: string;
  source: ShoppingDiscoverySeedSource;
  reason: string;
  category?: string;
  pcSearchVolume?: number;
  mobileSearchVolume?: number;
  searchVolume?: number;
  documentCount?: number;
  goldenRatio?: number;
  priorityScore: number;
}

interface VerifiedCache {
  timestamp: number;
  items: VerifiedKeyword[];
}

const VERIFIED_CACHE_TTL = 24 * 60 * 60_000; // 24시간

function getVerifiedCachePath(): string {
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      const path = require('path');
      return path.join(app.getPath('userData'), 'shopping-suggestions-verified.json');
    }
  } catch {}
  const os = require('os');
  const path = require('path');
  return path.join(os.tmpdir(), 'leword-shopping-suggestions-verified.json');
}

function readVerifiedCache(): VerifiedCache | null {
  try {
    const fs = require('fs');
    const file = getVerifiedCachePath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - (parsed.timestamp || 0) > VERIFIED_CACHE_TTL) return null;
    if (parsed.items.some((item: any) =>
      item
        && typeof item.searchVolume === 'number'
        && (typeof item.pcSearchVolume !== 'number' || typeof item.mobileSearchVolume !== 'number')
    )) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeVerifiedCache(cache: VerifiedCache): void {
  try {
    const fs = require('fs');
    fs.writeFileSync(getVerifiedCachePath(), JSON.stringify(cache), 'utf8');
  } catch {}
}

function normalizeSeedKey(keyword: string): string {
  return String(keyword || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(SHOPPING_DISCOVERY_SUFFIX_PATTERN, '');
}

function clampPriority(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

function sortShoppingDiscoverySeeds(seeds: ShoppingDiscoverySeed[]): ShoppingDiscoverySeed[] {
  return [...seeds].sort((a, b) =>
    b.priorityScore - a.priorityScore ||
    (b.searchVolume || 0) - (a.searchVolume || 0) ||
    a.keyword.localeCompare(b.keyword, 'ko')
  );
}

function shoppingSeedCategoryKey(seed: ShoppingDiscoverySeed): string {
  return String(seed.category || seed.source || 'unknown').replace(/\s+/g, ' ').trim();
}

function selectBalancedShoppingDiscoverySeeds(
  seeds: ShoppingDiscoverySeed[],
  limit: number,
): ShoppingDiscoverySeed[] {
  const sorted = sortShoppingDiscoverySeeds(seeds);
  const perCategorySoftCap = Math.max(2, Math.ceil(limit / 10));
  const selected: ShoppingDiscoverySeed[] = [];
  const used = new Set<string>();
  const categoryCounts = new Map<string, number>();

  const take = (seed: ShoppingDiscoverySeed, enforceCap: boolean): void => {
    if (selected.length >= limit) return;
    const key = normalizeSeedKey(seed.keyword);
    if (!key || used.has(key)) return;
    const categoryKey = shoppingSeedCategoryKey(seed);
    const current = categoryCounts.get(categoryKey) || 0;
    if (enforceCap && current >= perCategorySoftCap) return;
    used.add(key);
    categoryCounts.set(categoryKey, current + 1);
    selected.push(seed);
  };

  sorted.forEach(seed => take(seed, true));
  if (selected.length < limit) sorted.forEach(seed => take(seed, false));
  return selected.slice(0, limit);
}

export function buildShoppingDiscoverySeeds(input: {
  verified?: VerifiedKeyword[];
  dynamic?: string[];
  staticGroups?: SuggestionGroup[];
  limit?: number;
}): ShoppingDiscoverySeed[] {
  const limit = Math.min(
    Math.max(Number(input.limit) || SHOPPING_AUTO_DISCOVERY_MIN_SEEDS, 1),
    SHOPPING_AUTO_DISCOVERY_MAX_SEEDS
  );
  const out: ShoppingDiscoverySeed[] = [];
  const seen = new Set<string>();

  const add = (seed: ShoppingDiscoverySeed) => {
    const rawKeyword = String(seed.keyword || '').replace(/\s+/g, ' ').trim();
    const keyword = ensureShoppingDiscoveryIntentQuery(rawKeyword);
    if (keyword.length < 2 || keyword.length > 35) return;
    const key = normalizeSeedKey(keyword);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...seed, keyword, priorityScore: clampPriority(seed.priorityScore) });
  };

  for (const v of input.verified || []) {
    const svBoost = Math.min(8, Math.log10(Math.max(10, v.searchVolume || 0)) * 1.7);
    const ratioBoost = Math.min(14, Math.max(0, v.goldenRatio || 0) * 1.6);
    add({
      keyword: v.keyword,
      source: 'verified',
      category: v.category,
      pcSearchVolume: v.pcSearchVolume,
      mobileSearchVolume: v.mobileSearchVolume,
      searchVolume: v.searchVolume,
      documentCount: v.documentCount,
      goldenRatio: v.goldenRatio,
      reason: `검증 황금비율 ${v.goldenRatio} · 검색량 ${v.searchVolume.toLocaleString()} / 문서수 ${v.documentCount.toLocaleString()}`,
      priorityScore: 78 + ratioBoost + svBoost,
    });
  }

  (input.dynamic || []).forEach((keyword, index) => {
    add({
      keyword,
      source: 'dynamic',
      reason: '오늘의 황금키워드 캐시에서 잡힌 커머스 후보',
      priorityScore: 68 - index * 0.8,
    });
  });

  for (const group of input.staticGroups || []) {
    group.keywords.forEach((keyword, index) => {
      add({
        keyword,
        source: 'static',
        category: group.category,
        reason: `${group.category.replace(/^[^\s]+\s*/, '')} 카테고리 탐색 시드`,
        priorityScore: 48 - index * 0.6,
      });
    });
  }

  return selectBalancedShoppingDiscoverySeeds(out, limit);
}

/**
 * 키워드 무입력 상태에서 쇼핑커넥트가 바로 발굴을 시작할 때 쓰는 시드.
 * 속도를 위해 네이버 검증을 여기서 기다리지 않고, 캐시/동적 피드/정적 풀을 즉시 합친다.
 */
export async function getShoppingDiscoverySeeds(limit: number = SHOPPING_AUTO_DISCOVERY_MIN_SEEDS): Promise<ShoppingDiscoverySeed[]> {
  const cached = readVerifiedCache();
  let verified = cached?.items || [];
  if (!cached) {
    try {
      verified = await getVerifiedShoppingSuggestions(Math.max(limit, SHOPPING_AUTO_DISCOVERY_MIN_SEEDS));
    } catch {
      verified = [];
    }
  }

  return buildShoppingDiscoverySeeds({
    verified,
    dynamic: getDynamicSuggestionsFromRichFeed(),
    staticGroups: getStaticShoppingSuggestions(6),
    limit,
  });
}

/**
 * 모든 정적 키워드를 네이버 API로 검증 → goldenRatio 계산 → 상위 N개 반환
 * 24h 캐시 사용 (첫 호출 시 10~15초 소요, 이후 즉시)
 */
export async function getVerifiedShoppingSuggestions(limit: number = 30): Promise<VerifiedKeyword[]> {
  const cached = readVerifiedCache();
  if (cached) {
    return cached.items.slice(0, limit);
  }

  // 캐시 없으면 실시간 검증
  const allSeeds: Array<{ keyword: string; category: string }> = [];
  for (const [category, keywords] of Object.entries(COMMERCE_SEEDS)) {
    for (const kw of keywords) {
      allSeeds.push({ keyword: kw, category });
    }
  }

  try {
    const { EnvironmentManager } = require('./environment-manager');
    const cfg: any = EnvironmentManager.getInstance().getConfig();
    const clientId = cfg.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = cfg.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    if (!clientId || !clientSecret) return [];

    const { getNaverKeywordSearchVolumeSeparate } = require('./naver-datalab-api');
    const keywords = allSeeds.map(s => s.keyword);

    // 배치 30개씩 조회
    const verified: VerifiedKeyword[] = [];
    for (let i = 0; i < keywords.length; i += 30) {
      const batch = keywords.slice(i, i + 30);
      const seedInfo = allSeeds.slice(i, i + 30);
      try {
        const sigs = await getNaverKeywordSearchVolumeSeparate(
          { clientId, clientSecret },
          batch,
          { includeDocumentCount: true }
        );
        for (let j = 0; j < sigs.length; j++) {
          const sig = sigs[j];
          const info = seedInfo[j];
          if (!sig || !info) continue;
          const sv = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
          const dc = sig.documentCount ?? 0;
          if (sv < 100 || dc <= 0) continue;
          const goldenRatio = sv / Math.max(1, dc);
          verified.push({
            keyword: info.keyword,
            category: info.category,
            pcSearchVolume: sig.pcSearchVolume || 0,
            mobileSearchVolume: sig.mobileSearchVolume || 0,
            searchVolume: sv,
            documentCount: dc,
            goldenRatio: parseFloat(goldenRatio.toFixed(2)),
          });
        }
      } catch (e: any) {
        console.warn('[shopping-suggestions] 배치 검증 실패:', e?.message);
      }
    }

    // v2.42.55 Phase 2: 커머스 의도 점수 × 황금비율 곱셈으로 정렬
    //   기존: ratio 단독 → "탈모 원인" (정보형, ratio 10) 같은 비-커머스 키워드가 상위
    //   변경: ratio × commercialIntent → "탈모 샴푸 추천" (구매형, ratio 5×의도0.9=4.5) 가 위로
    const commercialIntentScore = (kw: string): number => {
        let s = 0.3; // 중립
        // 구매 의도 어미 +
        if (/추천$/.test(kw)) s += 0.35;
        if (/비교$/.test(kw)) s += 0.30;
        if (/순위$/.test(kw)) s += 0.30;
        if (/가격$/.test(kw)) s += 0.25;
        if (/리뷰$/.test(kw)) s += 0.25;
        if (/후기$/.test(kw)) s += 0.20;
        if (/베스트|TOP\s*\d|랭킹/.test(kw)) s += 0.20;
        if (/할인|세일|쿠폰|특가|최저가/.test(kw)) s += 0.25;
        if (/(천원|만원|원대|만대)/.test(kw)) s += 0.20;
        // 구매 명사 (브랜드/제품/구체 사양)
        if (/(사용법|착용법|입는법|쓰는법|매는법)/.test(kw)) s += 0.15;
        // 정보형 어미 - (구매 의도 약함)
        if (/(원인|증상|효능|효과|뜻|의미|이유|차이|방법|꿀팁|팁|정리|소개|설명|정보)$/.test(kw)) s -= 0.25;
        if (/(작동|원리|구조|역사|유래|기원)$/.test(kw)) s -= 0.30;
        return Math.max(0.05, Math.min(1.0, s));
    };
    for (const v of verified) {
        (v as any).commercialIntent = parseFloat(commercialIntentScore(v.keyword).toFixed(2));
        (v as any).commerceScore = parseFloat((v.goldenRatio * (v as any).commercialIntent).toFixed(2));
    }
    verified.sort((a: any, b: any) => (b.commerceScore || 0) - (a.commerceScore || 0));

    // 캐시 저장
    writeVerifiedCache({ timestamp: Date.now(), items: verified });

    return verified.slice(0, limit);
  } catch (e: any) {
    console.error('[shopping-suggestions] 검증 실패:', e?.message);
    return [];
  }
}

/**
 * 통합 제안 — 동적 피드(황금순) + 정적 검증(황금순) + 미검증 카테고리(탐색용)
 */
export async function getShoppingSuggestions(): Promise<{
  dynamic: string[];
  verified: VerifiedKeyword[];
  static: SuggestionGroup[];
}> {
  const dynamic = getDynamicSuggestionsFromRichFeed();

  // 정적 풀 검증은 캐시 있을 때만 즉시 반환. 없으면 백그라운드로.
  const cached = readVerifiedCache();
  const verified = cached ? cached.items.slice(0, 30) : [];

  // 캐시 없으면 백그라운드에서 트리거 (await 안 함)
  if (!cached) {
    getVerifiedShoppingSuggestions(SHOPPING_AUTO_DISCOVERY_MIN_SEEDS).catch(() => {});
  }

  return {
    dynamic,
    verified,
    static: getStaticShoppingSuggestions(4),
  };
}
