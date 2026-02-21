/**
 * 📦 네이버 연관검색어 캐싱 서비스
 * 
 * IP 차단 방지 및 성능 최적화를 위한 캐싱 시스템
 * - 같은 키워드는 1시간 내 재호출 방지
 * - 일일 호출 횟수 추적
 * - 캐시 히트 시 API 호출 없이 즉시 반환
 */

import axios from 'axios';

interface CacheEntry {
    keywords: string[];
    timestamp: number;
}

interface DailyStats {
    date: string;
    callCount: number;
}

// 메모리 캐시 (앱 재시작 시 초기화)
const cache = new Map<string, CacheEntry>();
let dailyStats: DailyStats = { date: '', callCount: 0 };

// 설정
const CONFIG = {
    CACHE_TTL_MS: 60 * 60 * 1000,  // 1시간
    DAILY_LIMIT_WARNING: 20000,     // 경고 임계값
    MAX_RESULTS: 10,
    TIMEOUT_MS: 3000
};

/**
 * 오늘 날짜 문자열
 */
function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * 일일 호출 횟수 체크 및 경고
 */
function checkDailyLimit(): boolean {
    const today = getTodayString();
    if (dailyStats.date !== today) {
        dailyStats = { date: today, callCount: 0 };
    }

    if (dailyStats.callCount >= CONFIG.DAILY_LIMIT_WARNING) {
        console.warn(`[RELATED-KW-CACHE] ⚠️ 일일 호출 ${dailyStats.callCount}회 - 과도한 사용 주의!`);
        return false;
    }
    return true;
}

/**
 * 캐시에서 조회
 */
function getFromCache(keyword: string): string[] | null {
    const entry = cache.get(keyword);
    if (!entry) return null;

    // TTL 체크
    if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL_MS) {
        cache.delete(keyword);
        return null;
    }

    return entry.keywords;
}

/**
 * 캐시에 저장
 */
function saveToCache(keyword: string, keywords: string[]): void {
    cache.set(keyword, {
        keywords,
        timestamp: Date.now()
    });
}

/**
 * 네이버 자동완성 API 호출 (내부용)
 */
async function fetchFromNaver(keyword: string): Promise<string[]> {
    const results: string[] = [];

    try {
        const response = await axios.get('https://ac.search.naver.com/nx/ac', {
            params: {
                q: keyword,
                con: 0, // 1 -> 0 변경 시도
                frm: 'nv',
                ans: 2,
                r_format: 'json',
                r_enc: 'UTF-8',
                r_unicode: 0,
                t_koreng: 1,
                run: 2,
                rev: 4,
                q_enc: 'UTF-8',
                st: 100
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.naver.com/',
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: CONFIG.TIMEOUT_MS
        });

        if (response.data?.items) {
            for (const itemGroup of response.data.items) {
                if (Array.isArray(itemGroup)) {
                    for (const item of itemGroup) {
                        if (Array.isArray(item) && item[0]) {
                            const kw = String(item[0]).trim();
                            if (kw.length >= 2 && kw !== keyword && !results.includes(kw)) {
                                results.push(kw);
                            }
                        }
                    }
                }
            }
        }
    } catch (e: any) {
        console.error(`[RELATED-KW-CACHE] ❌ API 호출 실패 ("${keyword}"):`, e.message);
        // 실패 시 빈 배열
    }

    return results.slice(0, CONFIG.MAX_RESULTS);
}

/**
 * 🔥 메인 함수: 연관검색어 조회 (캐싱 적용)
 */
export async function getRelatedKeywords(keyword: string): Promise<string[]> {
    if (!keyword || keyword.length < 2) return [];

    // 1. 캐시 확인
    const cached = getFromCache(keyword);
    if (cached) {
        console.log(`[RELATED-KW-CACHE] ✅ 캐시 히트: "${keyword}"`);
        return cached;
    }

    // 2. 일일 제한 확인
    if (!checkDailyLimit()) {
        console.warn(`[RELATED-KW-CACHE] ⛔ 일일 제한 초과, 정적 패턴 반환`);
        return [];
    }

    // 3. API 호출
    const results = await fetchFromNaver(keyword);
    dailyStats.callCount++;

    // 4. 캐시 저장
    if (results.length > 0) {
        saveToCache(keyword, results);
        console.log(`[RELATED-KW-CACHE] 🌐 API 호출: "${keyword}" → ${results.length}개`);
    }

    return results;
}

/**
 * 배치 조회 (여러 키워드 한번에)
 */
export async function getRelatedKeywordsBatch(keywords: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    // 병렬 처리 (최대 5개씩)
    const batchSize = 5;
    for (let i = 0; i < keywords.length; i += batchSize) {
        const batch = keywords.slice(i, i + batchSize);
        const promises = batch.map(async kw => {
            const related = await getRelatedKeywords(kw);
            result.set(kw, related);
        });
        await Promise.all(promises);

        // 배치 간 딜레이 (IP 차단 방지)
        if (i + batchSize < keywords.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return result;
}

/**
 * 캐시 통계
 */
export function getCacheStats(): { cacheSize: number; dailyCallCount: number; date: string } {
    return {
        cacheSize: cache.size,
        dailyCallCount: dailyStats.callCount,
        date: dailyStats.date
    };
}

/**
 * 캐시 초기화
 */
export function clearCache(): void {
    cache.clear();
    console.log('[RELATED-KW-CACHE] 🗑️ 캐시 초기화됨');
}
