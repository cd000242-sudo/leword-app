/**
 * Phase 2: 지식인 signal 보강 (검색량 / CPC / 블로그 문서수)
 *
 * 목적:
 *   기본 크롤 signal(조회/답변/신선도) 위에 외부 데이터를 덧붙여
 *   SSS 등급 판정을 "진짜 가치 있는 질문"에 집중.
 *
 * 동작:
 *   1. 제목에서 대표 키워드 추출
 *   2. api-cache 확인 (24h TTL)
 *   3. 네이버 검색광고 API → 월 검색량
 *   4. 네이버 블로그 API → 문서수
 *   5. profit-engine estimateCPC → CPC 추정
 *   6. 쿼터 초과/에러 시 degraded mode (base signals만)
 *
 * 활성화:
 *   환경변수 `LEWORD_KIN_ENRICH=1` 또는 명시적 enableEnrichment()
 *   (기본 off — API 쿼터 보호)
 */

import type { KinSignals } from './naver-kin-golden-config';

// ============================================================
// 쿼터 카운터 (사용자당 일일 한도)
// ============================================================

interface QuotaState {
  date: string;    // YYYY-MM-DD
  searchAd: number;
  blogApi: number;
}

const DAILY_LIMIT_SEARCHAD = 200;
const DAILY_LIMIT_BLOG = 200;
const state: QuotaState = { date: '', searchAd: 0, blogApi: 0 };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureDate() {
  const today = todayStr();
  if (state.date !== today) {
    state.date = today;
    state.searchAd = 0;
    state.blogApi = 0;
  }
}

function canCallSearchAd(): boolean {
  ensureDate();
  return state.searchAd < DAILY_LIMIT_SEARCHAD;
}

function canCallBlog(): boolean {
  ensureDate();
  return state.blogApi < DAILY_LIMIT_BLOG;
}

export function getEnrichmentQuota() {
  ensureDate();
  return {
    date: state.date,
    searchAd: { used: state.searchAd, limit: DAILY_LIMIT_SEARCHAD },
    blogApi: { used: state.blogApi, limit: DAILY_LIMIT_BLOG },
  };
}

// ============================================================
// 활성화 플래그
// ============================================================

let enrichEnabled = process.env.LEWORD_KIN_ENRICH === '1';

export function enableEnrichment(v: boolean) {
  enrichEnabled = v;
}

export function isEnrichmentEnabled(): boolean {
  return enrichEnabled;
}

// ============================================================
// 키워드 추출
// ============================================================

/**
 * 지식인 제목에서 대표 키워드 추출.
 * 한글/영문/숫자 외 제거 후 가장 긴 의미 단어 2개 선정.
 */
export function extractKeywordFromTitle(title: string): string {
  if (!title) return '';
  const cleaned = title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopwords = new Set([
    '어떻게', '무엇', '언제', '어디', '왜', '얼마', '어느', '어떤',
    '궁금', '질문', '문의', '알려', '주세', '주시', '부탁', '해요',
    '이거', '저거', '그거', '이게', '저게', '그게', 'the', 'and', 'for', 'with',
  ]);

  const words = cleaned
    .split(' ')
    .filter(w => w.length >= 2 && !stopwords.has(w))
    .sort((a, b) => b.length - a.length);

  return words.slice(0, 2).join(' ') || cleaned.slice(0, 20);
}

// ============================================================
// 인메모리 TTL 캐시 (24h)
// ============================================================

interface CacheEntry {
  value: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached(key: string, value: any) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

// ============================================================
// 신호 enrichment 메인
// ============================================================

/**
 * 제목으로부터 확장 signal 4종을 조회 (캐시 + 쿼터 + degraded mode).
 * 실패/비활성/쿼터초과 시 { enrichmentAvailable: false } 반환.
 */
export async function enrichKinSignals(
  title: string
): Promise<Partial<KinSignals>> {
  if (!enrichEnabled) {
    return { enrichmentAvailable: false };
  }

  const keyword = extractKeywordFromTitle(title);
  if (!keyword) return { enrichmentAvailable: false };

  const cacheKey = `kin:enrich:${keyword}`;
  const cached = getCached<Partial<KinSignals>>(cacheKey);
  if (cached) return cached;

  const out: Partial<KinSignals> = { enrichmentAvailable: false };

  // 1. 월 검색량
  if (canCallSearchAd()) {
    try {
      const { EnvironmentManager } = require('./environment-manager');
      const { getNaverSearchAdKeywordVolume } = require('./naver-searchad-api');
      const envManager = EnvironmentManager.getInstance();
      const config = envManager.getConfig();
      if (config.naverSearchAdAccessLicense && config.naverSearchAdSecretKey) {
        state.searchAd++;
        const results = await getNaverSearchAdKeywordVolume(
          {
            accessLicense: config.naverSearchAdAccessLicense,
            secretKey: config.naverSearchAdSecretKey,
            customerId: config.naverSearchAdCustomerId,
          },
          [keyword]
        );
        if (results && results.length > 0) {
          out.monthlySearchVolume = results[0].totalSearchVolume ?? 0;
          out.enrichmentAvailable = true;
        }
      }
    } catch (err: any) {
      console.warn(`[KIN-ENRICH] 검색량 조회 실패 | kw=${keyword} | ${err?.message}`);
    }
  }

  // 2. 블로그 문서수
  if (canCallBlog()) {
    try {
      const { getNaverBlogDocumentCount } = require('./naver-blog-api');
      state.blogApi++;
      const count = await getNaverBlogDocumentCount(keyword);
      if (count !== null && count !== undefined) {
        out.blogDocCount = count;
        out.enrichmentAvailable = true;
      }
    } catch (err: any) {
      console.warn(`[KIN-ENRICH] 블로그 문서수 조회 실패 | kw=${keyword} | ${err?.message}`);
    }
  }

  // 3. CPC 추정 (로컬 계산, API 호출 없음)
  try {
    const { estimateCPC } = require('./profit-golden-keyword-engine');
    const cpc = estimateCPC(keyword, 'default');
    if (typeof cpc === 'number' && cpc > 0) {
      out.estimatedCpc = cpc;
    }
  } catch (err: any) {
    console.warn(`[KIN-ENRICH] CPC 추정 실패 | kw=${keyword} | ${err?.message}`);
  }

  setCached(cacheKey, out);
  return out;
}

/**
 * 배치 enrichment (병렬 처리, 순서 보존).
 */
export async function enrichKinSignalsBatch(
  titles: string[]
): Promise<Partial<KinSignals>[]> {
  if (!enrichEnabled) {
    return titles.map(() => ({ enrichmentAvailable: false }));
  }
  // 순차 호출로 API 쿼터 보호 (병렬이면 쿼터 카운터 race condition)
  const results: Partial<KinSignals>[] = [];
  for (const t of titles) {
    results.push(await enrichKinSignals(t));
  }
  return results;
}
