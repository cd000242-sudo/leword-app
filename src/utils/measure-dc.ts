/**
 * measure-dc.ts — Single Source of Truth (SSoT) for document count (dc) measurement.
 *
 * v2.49.16 Phase A 결과 (3 에이전트 토론):
 *   - dc=26 가짜 SSR root cause: scrapeWebDc pattern 4 `/([0-9,]+)\s*건/`
 *     → "<span>댓글 26건</span>" 같은 widget noise 매칭 → API value (352,837) 덮어쓰기
 *   - 같은 공격이 naver-datalab-api.ts v2.32.1 에서 이미 발견됨 ("아동수당 209,645 → 26")
 *     → sanity check 가 한 함수에만 적용. add-on patch 문화 잔존.
 *   - 9 path 가 각자 다른 scrape regex 보유 → SSoT 부재.
 *
 * 본 모듈의 책무 — 단일 진입점:
 *   1) API 성공값 전용 15분 캐시 → Naver blog.json total 재사용
 *   2) Naver blog.json API → return source='naver-api'
 *   3) API 실패 시에만 search.naver.com scrape → 비신뢰 보조값
 *   4) sv*0.5 fallback → return source='fallback', isEstimated=true
 *
 * 정책:
 *   - 일반 문서수는 따옴표 없는 broad OpenAPI total
 *   - OpenAPI와 HTML 숫자가 다르면 OpenAPI를 항상 신뢰
 *   - scrape 값은 persistent cache 미저장 (API 검증 없이 영구화 금지)
 *   - 추정값 fallback은 caller가 dcEstimated=true로 표시해 SSS를 차단
 */
import axios from 'axios';
import {
    getNaverBlogDocumentCount,
    normalizeNaverBlogBroadQuery,
    peekCachedNaverBlogDocumentCountMeasurement,
} from './naver-blog-api';
import {
    getCanonicalPersistentDocumentCount,
    getPersistent,
    setPersistent,
} from './persistent-keyword-cache';

export type DcSource = 'cache' | 'naver-api' | 'scrape' | 'fallback';
export type DcConfidence = 'high' | 'medium' | 'low';
export type DocumentCountQueryMode = 'broad' | 'exact-phrase';

/**
 * 사용자에게 "문서수"로 표시하는 제품 공통 정의.
 * 네이버 블로그 OpenAPI에 따옴표 없는 원문 질의를 보내는 확장검색 total이다.
 */
export const CANONICAL_DOCUMENT_COUNT_QUERY_MODE: DocumentCountQueryMode = 'broad';

export interface DcMeasurement {
    /** 측정된 dc 값. fallback 시 sv*0.5. */
    dc: number;
    /** 측정 경로. */
    source: DcSource;
    /** 신뢰도. high: API 또는 캐시. medium: scrape 단독. low: fallback. */
    confidence: DcConfidence;
    /** 추정값 여부. caller 가 r.dcEstimated 동기화 필수. */
    isEstimated: boolean;
    /** 실제 API/스크랩에 사용한 질의 의미. */
    queryMode?: DocumentCountQueryMode;
    /** Time at which the underlying source was actually measured. */
    measuredAt?: string;
    /** 진단용 — API/scrape 양쪽 값, cross-check 사유. */
    debug?: {
        apiDc?: number | null;
        scrapeDc?: number | null;
        crossCheck?: string;
        queryMode?: 'broad' | 'exact-phrase';
    };
}

export interface MeasureOpts {
    /** sv 값 — fallback (sv*0.5) 계산 + scrape sanity check 용. 0 이면 fallback dc=1. */
    searchVolume?: number;
    /** persistent cache 조회 차단 (verify path 에서 강제 재측정). 기본 false. */
    skipCache?: boolean;
    /** scrape 호출 차단 (API 만 사용). 기본 false. */
    skipScrape?: boolean;
    /** scrape timeout (ms). 기본 2000. */
    scrapeTimeoutMs?: number;
    /**
     * v2.49.17: scrape 만 사용 (API 호출 skip). verify path 가 rate-limit 회피용.
     * 기존 scrapeWebDc 동작과 동일 — API 다시 호출하지 않고 widget noise 만 차단.
     */
    scrapeOnly?: boolean;
    /**
     * Exact phrase competition for a SearchAd-proven keyword. This bypasses
     * the legacy broad persistent cache so the two document-count meanings
     * can never be mixed.
     */
    queryMode?: 'broad' | 'exact-phrase';
    /** Cancel the complete lookup, including the scrape fallback. */
    signal?: AbortSignal;
    /** Naver Blog OpenAPI request timeout (ms). */
    timeoutMs?: number;
}

const SCRAPE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// v2.49.17: n < 100 게이트가 진짜 롱테일 SSS (dc=50, sv=800) 도 차단 → n < 10 으로 완화.
//   widget noise 의 전형 값: 댓글 26건, 광고 5건, 인플루언서 12건 — 모두 < 30.
//   진짜 저경쟁 황금: dc 30~3000 — 통과시켜야 SSS 후보 살아남음.
//   메모리 규칙 "SSS-only 고정 + 대량 보장" 부합.
const SCRAPE_MIN_VALID_N = 10;

/**
 * v2.49.17: scrape pattern 복원. anchor 있는 안전 패턴만 사용.
 *   pattern 3 `약\s*([0-9,]+)\s*건` 만 제거 (anchor 없음 — 광고 영역 매칭 위험).
 *   widget noise 차단은 n >= 10 게이트가 담당.
 */
const STRICT_PATTERNS: ReadonlyArray<RegExp> = [
    /(?:\uBE14\uB85C\uADF8\s*)?\uAC80\uC0C9\uACB0\uACFC\s*(?:\uC57D\s*)?([0-9,]+)\s*\uAC74/u,
    /(?:\uC804\uCCB4|\uCD1D)\s*(?:\uC57D\s*)?([0-9,]+)\s*\uAC74/u,
    /1\s*-\s*10\s*\/\s*([0-9,]+)\s*\uAC74/u,
    /([0-9,]+)\s*\uAC74\s*(?:\uC758\s*)?(?:\uBE14\uB85C\uADF8|\uBB38\uC11C|\uAC80\uC0C9\uACB0\uACFC|\uACB0\uACFC)/u,
    /(?:totalCount|total_count|blogTotal)["']?\s*[:=]\s*["']?([0-9,]+)/i,
    /블로그\s*검색결과\s*약\s*([0-9,]+)\s*건/,    // 가장 안전 — "블로그 검색결과" prefix
    /검색결과\s*약\s*([0-9,]+)\s*건/,              // 안전 — "검색결과" prefix
    /\d+-\d+\s*\/\s*([0-9,]+)\s*건/,              // 페이지네이션 "1-10 / N건"
    /총\s*([0-9,]+)\s*건/,                          // "총 N건" 결과 헤더
    /([0-9,]+)\s*건\s*중/,                          // "N건 중" suffix
];

function decodeHtmlText(html: string): string {
    return String(html || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

function parseDocumentCountMatch(match: RegExpMatchArray | null): number | null {
    const raw = match?.[1];
    if (!raw) return null;
    const n = parseInt(String(raw).replace(/,/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0 || n < SCRAPE_MIN_VALID_N) return null;
    return n;
}

function extractNaverBlogDocumentCountFromHtml(html: string): number | null {
    const sources = [String(html || ''), decodeHtmlText(html)];
    const candidates: number[] = [];
    for (const source of sources) {
        if (!source) continue;
        for (const pattern of STRICT_PATTERNS) {
            const n = parseDocumentCountMatch(source.match(pattern));
            if (n !== null) candidates.push(n);
        }
    }
    if (candidates.length === 0) return null;
    return Math.max(...candidates);
}

async function scrapeNaverBlogDc(
    keyword: string,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<number | null> {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal?.aborted) ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const kill = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': SCRAPE_UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
            timeout: timeoutMs,
            signal: ctrl.signal as any,
        });
        const html = String(resp.data || '');
        const robustCount = extractNaverBlogDocumentCountFromHtml(html);
        if (robustCount !== null) {
            console.log(`[measure-dc] scrape measured "${keyword}": n=${robustCount}`);
            return robustCount;
        }
        for (const p of STRICT_PATTERNS) {
            const m = html.match(p);
            if (m && m[1]) {
                const n = parseInt(m[1].replace(/,/g, ''), 10);
                if (!Number.isFinite(n) || n <= 0) continue;
                if (n < SCRAPE_MIN_VALID_N) {
                    // widget noise — 댓글 26건 / 광고 5건 / 인플루언서 12건 등
                    console.warn(`[measure-dc] scrape 거부 "${keyword}": n=${n} < ${SCRAPE_MIN_VALID_N} (widget noise 의심)`);
                    continue;
                }
                return n;
            }
        }
        return null;
    } catch {
        return null;
    } finally {
        clearTimeout(kill);
        signal?.removeEventListener('abort', onAbort);
    }
}

export function documentCountQueryForMode(
    keyword: string,
    queryMode: DocumentCountQueryMode = CANONICAL_DOCUMENT_COUNT_QUERY_MODE,
): string {
    const clean = normalizeNaverBlogBroadQuery(keyword);
    return queryMode === 'exact-phrase' && clean ? `"${clean}"` : clean;
}

export function selectDocumentCountMeasurement(
    apiDc: number | null,
    scrapeDc: number | null,
    queryMode: DocumentCountQueryMode = CANONICAL_DOCUMENT_COUNT_QUERY_MODE,
    measuredAt?: string,
): DcMeasurement | null {
    const sourceMeasuredAt = String(measuredAt || '').trim();
    const hasSourceMeasurementTime = Number.isFinite(Date.parse(sourceMeasuredAt));
    if (apiDc !== null && Number.isFinite(apiDc) && apiDc >= 0 && hasSourceMeasurementTime) {
        return {
            dc: apiDc,
            source: 'naver-api',
            confidence: 'high',
            isEstimated: false,
            queryMode,
            measuredAt: sourceMeasuredAt,
            debug: {
                apiDc,
                scrapeDc,
                crossCheck: scrapeDc !== null ? 'naver-openapi-authoritative' : undefined,
                queryMode,
            },
        };
    }
    if (scrapeDc !== null && Number.isFinite(scrapeDc) && scrapeDc >= 0 && hasSourceMeasurementTime) {
        return {
            dc: scrapeDc,
            source: 'scrape',
            confidence: 'medium',
            isEstimated: true,
            queryMode,
            measuredAt: sourceMeasuredAt,
            debug: { apiDc, scrapeDc, queryMode },
        };
    }
    return null;
}

/**
 * dc 측정 SSoT — 모든 dc 측정 path 의 단일 진입점.
 *
 * @example
 *   const m = await measureDocumentCount('소상공인 지원금 신청', { searchVolume: 5800 });
 *   r.documentCount = m.dc;
 *   r.dcEstimated = m.isEstimated;
 *   r.dcConfidence = m.confidence;  // sanity-gate 입력
 *   r.dcSource = m.source;
 */
export async function measureDocumentCount(
    keyword: string,
    opts: MeasureOpts = {}
): Promise<DcMeasurement> {
    const invokedAt = new Date().toISOString();
    const sv = opts.searchVolume ?? 0;
    const scrapeTimeoutMs = opts.scrapeTimeoutMs ?? 2000;
    const queryMode: DocumentCountQueryMode = opts.queryMode === 'exact-phrase'
        ? 'exact-phrase'
        : CANONICAL_DOCUMENT_COUNT_QUERY_MODE;
    const exactPhrase = queryMode === 'exact-phrase';
    const queryKeyword = documentCountQueryForMode(keyword, queryMode);
    const throwIfAborted = (): void => {
        if (opts.signal?.aborted) throw new Error('document count lookup aborted');
    };
    throwIfAborted();

    // v2.49.17: scrapeOnly 분기 — verify path 에서 API rate-limit 회피용.
    //   기존 scrapeWebDc 와 동일 동작 (API 다시 호출 X, scrape 만).
    //   결과: source='scrape' confidence='medium', isEstimated=true.
    if (opts.scrapeOnly) {
        if (!exactPhrase) {
            const cachedEntry = getPersistent(keyword);
            const cachedDc = getCanonicalPersistentDocumentCount(
                cachedEntry,
                Date.now(),
                keyword,
            );
            if (cachedEntry && cachedDc !== null) {
                return {
                    dc: cachedDc,
                    source: 'cache',
                    confidence: 'high',
                    isEstimated: false,
                    queryMode: CANONICAL_DOCUMENT_COUNT_QUERY_MODE,
                    measuredAt: cachedEntry.documentCountMeasuredAt,
                    debug: { apiDc: cachedDc, queryMode },
                };
            }
        }
        const scraped = await scrapeNaverBlogDc(queryKeyword, scrapeTimeoutMs, opts.signal);
        throwIfAborted();
        if (scraped != null && scraped > 0) {
            return {
                dc: scraped,
                source: 'scrape',
                confidence: 'medium',
                isEstimated: true,
                queryMode,
                measuredAt: invokedAt,
                debug: { scrapeDc: scraped, queryMode },
            };
        }
        // scrape 실패 — fallback 하지 않고 명시적 fallback 반환 (caller 가 skip 결정)
        const fallback = sv > 0 ? Math.max(1, Math.round(sv * 0.5)) : 1;
        return {
            dc: fallback,
            source: 'fallback',
            confidence: 'low',
            isEstimated: true,
            queryMode,
            measuredAt: invokedAt,
            debug: { scrapeDc: null, queryMode },
        };
    }

    // [1] API (전용 15분 캐시는 naver-blog-api가 관리하며 API 성공값만 담는다.)
    const apiDc = await getNaverBlogDocumentCount(queryKeyword, {
        forceFresh: opts.skipCache === true,
        signal: opts.signal,
        timeoutMs: opts.timeoutMs,
    }).catch(() => null);
    throwIfAborted();
    const apiMeasurement = apiDc !== null
        ? peekCachedNaverBlogDocumentCountMeasurement(queryKeyword)
        : null;
    const verifiedApiDc = apiMeasurement && apiMeasurement.total === apiDc
        ? apiDc
        : null;

    // [2] scrape — OpenAPI가 실패했을 때만 비신뢰 보조값으로 사용한다.
    // OpenAPI total과 HTML 숫자가 다르면 제품 공통 문서수 정의인 OpenAPI가 항상 우선이다.
    let scrapeDc: number | null = null;
    if (!opts.skipScrape && verifiedApiDc === null) {
        scrapeDc = await scrapeNaverBlogDc(queryKeyword, scrapeTimeoutMs, opts.signal);
        throwIfAborted();
    }

    const sourceMeasuredAt = verifiedApiDc !== null ? apiMeasurement!.measuredAt : invokedAt;
    const measured = selectDocumentCountMeasurement(verifiedApiDc, scrapeDc, queryMode, sourceMeasuredAt);
    if (measured) {
        if (measured.source === 'naver-api' && !exactPhrase) {
            persistApiResult(keyword, measured.dc, sv, measured.measuredAt ?? invokedAt);
        }
        return measured;
    }

    // [3] fallback — sv*0.5 추정. caller 가 dcEstimated=true 강제 마킹.
    const fallback = sv > 0 ? Math.max(1, Math.round(sv * 0.5)) : 1;
    console.warn(`[measure-dc] fallback "${keyword}": api/scrape 모두 실패, sv*0.5=${fallback} 추정`);
    return {
        dc: fallback,
        source: 'fallback',
        confidence: 'low',
        isEstimated: true,
        queryMode,
        measuredAt: invokedAt,
        debug: { apiDc, scrapeDc, queryMode },
    };
}

function persistApiResult(keyword: string, dc: number, sv: number, measuredAt: string): void {
    if (sv <= 0) return;  // Search-volume keyed consumers need both official measurements.
    try {
        setPersistent(keyword, {
            searchVolume: sv,
            documentCount: dc,
            documentCountSource: 'naver-api',
            documentCountConfidence: 'high',
            documentCountQueryMode: CANONICAL_DOCUMENT_COUNT_QUERY_MODE,
            isDocumentCountEstimated: false,
            documentCountMeasuredAt: measuredAt,
            realCpc: null,
            compIdx: null,
        });
    } catch {
        // cache 저장 실패는 비치명적
    }
}
