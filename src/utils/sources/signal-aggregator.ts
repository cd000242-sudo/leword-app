/**
 * Signal Aggregator — 17개 신규 데이터 소스 통합 허브
 *
 * 역할:
 *  1. 각 소스에서 키워드 후보 풀링
 *  2. 메모리 캐싱 (소스별 TTL)
 *  3. 키워드별 다차원 신호 점수 산출 (커뮤니티 버즈 / SNS 선행 / 광고주 검증)
 *  4. MDP v4.0 엔진에 입력
 */

import { fetchAllCategoryRanks, ShoppingRankItem } from './naver-shopping-keyword-rank';
import { getYoutubeTrendingKeywords } from './youtube-kr-rss';
import { fetchKoreanWikiTop, detectWikiRisingArticles, WikiPageView } from './wikipedia-pageviews';
import { getHotProductFrequency } from './ppomppu-rss';
import { fetchTiktokTrendingHashtags, getRisingHashtags, TiktokHashtagTrend } from './tiktok-creative-center';
import { getKeywordBuzzScore } from './threads-graph-api';
import { predictEmergingTopics } from './openalex-predictor';
import { fetchAllRakutenCategories } from './rakuten-ichiba';
import { measureKeywordBuzz, BuzzMeasurement } from './bigkinds-news-buzz';
import { getTheqooKeywords } from './theqoo-collector';
import { getBobaeKeywords } from './bobaedream-collector';
import { fetchOliveyoungBest, extractOliveyoungKeywords } from './oliveyoung-ranking';
import { fetchMusinsaRanking, extractMusinsaKeywords } from './musinsa-ranking';
// v2.43.37: "30+ 소스" 거짓 fix — 실제 미호출이던 8개 collector 추가
import { getBigkindsSeedKeywords } from './bigkinds-wrapper';
import { getGoogleTrendsKrKeywords } from './google-trends-kr-collector';
import { getInvenKeywords } from './inven-collector';
import { getNatepannKeywords } from './natepann-collector';
import { getFmkoreaKeywords } from './fmkorea-collector';
import { getTodayhumorKeywords } from './todayhumor-collector';
import { getClienKeywords } from './clien-collector';
import { getRuliwebKeywords } from './ruliweb-collector';
import { getMlbparkKeywords } from './mlbpark-collector';
// meta-ad-library: Facebook 403 차단으로 제거됨
// kream/namuwiki: 서버 차단·SPA 변경으로 제거됨

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class TTLCache {
    private store = new Map<string, CacheEntry<any>>();

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    }

    clear(key?: string): void {
        if (key) this.store.delete(key);
        else this.store.clear();
    }
}

const cache = new TTLCache();

// v2.43.52: 소스별 5초 timeout — Promise.allSettled 와 함께 worst-case hang 차단
const SOURCE_TIMEOUT_MS = 5000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`[aggregator] ${label} timeout ${ms}ms`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

const TTL = {
    REALTIME: 5 * 60 * 1000,        // 5분 — 텔레그램·SNS
    HOURLY: 60 * 60 * 1000,         // 1시간 — 뉴스·커뮤니티
    DAILY: 24 * 60 * 60 * 1000,     // 1일 — 쇼핑·랭킹
    WEEKLY: 7 * 24 * 60 * 60 * 1000, // 1주 — 학술·위키
};

export interface KeywordSignals {
    keyword: string;
    communityBuzzScore: number;     // 0-100 (더쿠·뽐뿌·보배·디시·테무 빈도)
    snsLeadingScore: number;         // 0-100 (TikTok·Threads·YouTube)
    advertiserScore: number;         // 0-100 (Meta Ad Library)
    newsBuzzScore: number;           // 0-100 (빅카인즈)
    futureScore: number;             // 0-100 (OpenAlex 학술)
    sources: string[];               // 등장 소스 목록
}

/**
 * 1차 시드 풀링 — 모든 소스에서 키워드 후보 수집
 */
export async function pullAllSeedKeywords(options: { lite?: boolean } = {}): Promise<{
    seeds: Map<string, string[]>;  // 키워드 → 등장 소스 배열
    raw: Record<string, any>;
}> {
    const seeds = new Map<string, string[]>();
    const raw: Record<string, any> = {};

    const addSeed = (kw: string, source: string) => {
        const clean = kw.trim();
        if (!clean || clean.length < 2 || clean.length > 30) return;
        if (!seeds.has(clean)) seeds.set(clean, []);
        seeds.get(clean)!.push(source);
    };

    const tasks: Array<Promise<void>> = [];

    // v2.43.52: 모든 소스 wrap helper — timeout + 에러 격리
    const runSource = (name: string, ttl: number, body: () => Promise<void>) => {
        tasks.push(withTimeout(body(), SOURCE_TIMEOUT_MS, name).catch((e: any) => {
            console.warn(`[aggregator] ${name} skip: ${e?.message || e}`);
        }));
    };

    // === 무료 소스 (Lite 가능) ===
    runSource('youtube', TTL.HOURLY, async () => {
        const cached = cache.get<any>('youtube-trending') || (await getYoutubeTrendingKeywords());
        cache.set('youtube-trending', cached, TTL.HOURLY);
        raw.youtube = cached;
        for (const k of cached) addSeed(k.keyword, 'youtube');
    });

    runSource('wiki', TTL.DAILY, async () => {
        const cached = cache.get<WikiPageView[]>('wiki-top') || (await fetchKoreanWikiTop());
        cache.set('wiki-top', cached, TTL.DAILY);
        raw.wiki = cached;
        for (const w of cached.slice(0, 100)) addSeed(w.article, 'wikipedia');
    });

    runSource('ppomppu', TTL.HOURLY, async () => {
        const cached = cache.get<any>('ppomppu') || (await getHotProductFrequency());
        cache.set('ppomppu', cached, TTL.HOURLY);
        raw.ppomppu = cached;
        for (const p of cached) addSeed(p.product, 'ppomppu');
    });

    if (options.lite) {
        await Promise.allSettled(tasks);
        return { seeds, raw };
    }

    // === PRO 전용 고급 소스 ===
    runSource('shopping', TTL.DAILY, async () => {
        const cached = cache.get<Record<string, ShoppingRankItem[]>>('shopping-ranks') || (await fetchAllCategoryRanks());
        cache.set('shopping-ranks', cached, TTL.DAILY);
        raw.shopping = cached;
        for (const items of Object.values(cached)) {
            for (const item of items) addSeed(item.keyword, 'naver-shopping');
        }
    });

    runSource('tiktok', TTL.HOURLY, async () => {
        const cached = cache.get<TiktokHashtagTrend[]>('tiktok') || (await fetchTiktokTrendingHashtags({ countryCode: 'KR' }));
        cache.set('tiktok', cached, TTL.HOURLY);
        raw.tiktok = cached;
        for (const t of cached) addSeed(t.hashtag, 'tiktok');
    });

    runSource('theqoo', TTL.HOURLY, async () => {
        const cached = cache.get<any>('theqoo') || (await getTheqooKeywords());
        cache.set('theqoo', cached, TTL.HOURLY);
        raw.theqoo = cached;
        for (const k of cached) addSeed(k.keyword, 'theqoo');
    });

    runSource('bobae', TTL.HOURLY, async () => {
        const cached = cache.get<any>('bobae') || (await getBobaeKeywords());
        cache.set('bobae', cached, TTL.HOURLY);
        raw.bobae = cached;
        for (const k of cached) addSeed(k.keyword, 'bobaedream');
    });

    runSource('oliveyoung', TTL.DAILY, async () => {
        const cached = cache.get<any>('oliveyoung') || extractOliveyoungKeywords(await fetchOliveyoungBest());
        cache.set('oliveyoung', cached, TTL.DAILY);
        raw.oliveyoung = cached;
        for (const o of cached) addSeed(o.keyword, 'oliveyoung');
    });

    runSource('musinsa', TTL.DAILY, async () => {
        const cached = cache.get<any>('musinsa') || extractMusinsaKeywords(await fetchMusinsaRanking());
        cache.set('musinsa', cached, TTL.DAILY);
        raw.musinsa = cached;
        for (const m of cached) addSeed(m.keyword, 'musinsa');
    });

    runSource('openalex', TTL.WEEKLY, async () => {
        const cached = cache.get<any>('openalex') || (await predictEmergingTopics());
        cache.set('openalex', cached, TTL.WEEKLY);
        raw.openalex = cached;
        for (const t of cached) addSeed(t.topic, 'openalex');
    });

    // v2.43.37: 미호출이던 8개 커뮤니티/뉴스 source 추가 (실제 30+ 달성)
    const COMMUNITY_COLLECTORS: Array<{ name: string; ttl: number; fn: () => Promise<Array<{ keyword: string; frequency?: number }>> }> = [
        // v2.49.72: 구글 트렌드 KR — 실검 폐지 이후 "지금 뜨는 검색어"를 얻는 살아있는 공개 소스
        //   (korea.kr 등 정부 RSS 는 전부 404 로 사망). <item><title> 이 곧 검색어.
        { name: 'google-trends-kr', ttl: TTL.HOURLY, fn: getGoogleTrendsKrKeywords },
        { name: 'bigkinds',   ttl: TTL.HOURLY, fn: async () => (await getBigkindsSeedKeywords()).map(k => ({ keyword: k })) },
        { name: 'inven',      ttl: TTL.HOURLY, fn: getInvenKeywords },
        { name: 'natepann',   ttl: TTL.HOURLY, fn: getNatepannKeywords },
        { name: 'fmkorea',    ttl: TTL.HOURLY, fn: getFmkoreaKeywords },
        { name: 'todayhumor', ttl: TTL.HOURLY, fn: getTodayhumorKeywords },
        { name: 'clien',      ttl: TTL.HOURLY, fn: getClienKeywords },
        { name: 'ruliweb',    ttl: TTL.HOURLY, fn: getRuliwebKeywords },
        { name: 'mlbpark',    ttl: TTL.HOURLY, fn: getMlbparkKeywords },
    ];
    for (const collector of COMMUNITY_COLLECTORS) {
        runSource(collector.name, collector.ttl, async () => {
            const cached = cache.get<any>(collector.name) || (await collector.fn());
            cache.set(collector.name, cached, collector.ttl);
            raw[collector.name] = cached;
            for (const item of cached) {
                if (item && item.keyword) addSeed(item.keyword, collector.name);
            }
        });
    }

    runSource('rakuten', TTL.DAILY, async () => {
        const cached = cache.get<any>('rakuten') || (await fetchAllRakutenCategories());
        cache.set('rakuten', cached, TTL.DAILY);
        raw.rakuten = cached;
    });

    // v2.43.52: allSettled — 한 소스 hang/실패가 전체 차단하지 않음
    await Promise.allSettled(tasks);
    return { seeds, raw };
}

/**
 * 키워드별 다차원 신호 점수 산출
 */
export async function computeKeywordSignals(keyword: string, sourcesPresent: string[]): Promise<KeywordSignals> {
    const communityKeys = ['theqoo', 'bobaedream', 'ppomppu'];
    const snsKeys = ['tiktok', 'youtube', 'threads'];

    const communityHits = sourcesPresent.filter(s => communityKeys.includes(s)).length;
    const snsHits = sourcesPresent.filter(s => snsKeys.includes(s)).length;

    const advertiserScore = 0;   // meta-ad-library 제거로 영구 0
    let newsBuzzScore = 0;
    const futureScore = 0;

    try {
        const buzz: BuzzMeasurement = await measureKeywordBuzz(keyword);
        newsBuzzScore = buzz.buzzScore;
    } catch { }

    return {
        keyword,
        communityBuzzScore: Math.min(100, communityHits * 33),
        snsLeadingScore: Math.min(100, snsHits * 33),
        advertiserScore,
        newsBuzzScore,
        futureScore,
        sources: sourcesPresent,
    };
}

export function clearAggregatorCache(): void {
    cache.clear();
}
