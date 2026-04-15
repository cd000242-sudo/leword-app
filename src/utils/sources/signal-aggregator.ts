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
import { extractAdKeywordsFromCategory } from './meta-ad-library-kr';
import { getHotResellProducts } from './kream-premium-signal';
import { getHotNamuTopics } from './namuwiki-collector';

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

    // === 무료 소스 (Lite 가능) ===
    tasks.push((async () => {
        const cached = cache.get<any>('youtube-trending') || (await getYoutubeTrendingKeywords());
        cache.set('youtube-trending', cached, TTL.HOURLY);
        raw.youtube = cached;
        for (const k of cached) addSeed(k.keyword, 'youtube');
    })());

    tasks.push((async () => {
        const cached = cache.get<WikiPageView[]>('wiki-top') || (await fetchKoreanWikiTop());
        cache.set('wiki-top', cached, TTL.DAILY);
        raw.wiki = cached;
        for (const w of cached.slice(0, 100)) addSeed(w.article, 'wikipedia');
    })());

    tasks.push((async () => {
        const cached = cache.get<any>('ppomppu') || (await getHotProductFrequency());
        cache.set('ppomppu', cached, TTL.HOURLY);
        raw.ppomppu = cached;
        for (const p of cached) addSeed(p.product, 'ppomppu');
    })());

    if (options.lite) {
        await Promise.all(tasks);
        return { seeds, raw };
    }

    // === PRO 전용 고급 소스 ===
    tasks.push((async () => {
        try {
            const cached = cache.get<Record<string, ShoppingRankItem[]>>('shopping-ranks') || (await fetchAllCategoryRanks());
            cache.set('shopping-ranks', cached, TTL.DAILY);
            raw.shopping = cached;
            for (const items of Object.values(cached)) {
                for (const item of items) addSeed(item.keyword, 'naver-shopping');
            }
        } catch (e) { console.error('[aggregator] shopping fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<TiktokHashtagTrend[]>('tiktok') || (await fetchTiktokTrendingHashtags({ countryCode: 'KR' }));
            cache.set('tiktok', cached, TTL.HOURLY);
            raw.tiktok = cached;
            for (const t of cached) addSeed(t.hashtag, 'tiktok');
        } catch (e) { console.error('[aggregator] tiktok fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('theqoo') || (await getTheqooKeywords());
            cache.set('theqoo', cached, TTL.HOURLY);
            raw.theqoo = cached;
            for (const k of cached) addSeed(k.keyword, 'theqoo');
        } catch (e) { console.error('[aggregator] theqoo fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('bobae') || (await getBobaeKeywords());
            cache.set('bobae', cached, TTL.HOURLY);
            raw.bobae = cached;
            for (const k of cached) addSeed(k.keyword, 'bobaedream');
        } catch (e) { console.error('[aggregator] bobae fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('oliveyoung') || extractOliveyoungKeywords(await fetchOliveyoungBest());
            cache.set('oliveyoung', cached, TTL.DAILY);
            raw.oliveyoung = cached;
            for (const o of cached) addSeed(o.keyword, 'oliveyoung');
        } catch (e) { console.error('[aggregator] oliveyoung fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('musinsa') || extractMusinsaKeywords(await fetchMusinsaRanking());
            cache.set('musinsa', cached, TTL.DAILY);
            raw.musinsa = cached;
            for (const m of cached) addSeed(m.keyword, 'musinsa');
        } catch (e) { console.error('[aggregator] musinsa fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('kream') || (await getHotResellProducts());
            cache.set('kream', cached, TTL.DAILY);
            raw.kream = cached;
            for (const k of cached) addSeed(k.name, 'kream');
        } catch (e) { console.error('[aggregator] kream fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('namu') || (await getHotNamuTopics());
            cache.set('namu', cached, TTL.HOURLY);
            raw.namu = cached;
            for (const n of cached) addSeed(n.title, 'namuwiki');
        } catch (e) { console.error('[aggregator] namu fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('openalex') || (await predictEmergingTopics());
            cache.set('openalex', cached, TTL.WEEKLY);
            raw.openalex = cached;
            for (const t of cached) addSeed(t.topic, 'openalex');
        } catch (e) { console.error('[aggregator] openalex fail', e); }
    })());

    tasks.push((async () => {
        try {
            const cached = cache.get<any>('rakuten') || (await fetchAllRakutenCategories());
            cache.set('rakuten', cached, TTL.DAILY);
            raw.rakuten = cached;
        } catch (e) { console.error('[aggregator] rakuten fail', e); }
    })());

    await Promise.all(tasks);
    return { seeds, raw };
}

/**
 * 키워드별 다차원 신호 점수 산출
 */
export async function computeKeywordSignals(keyword: string, sourcesPresent: string[]): Promise<KeywordSignals> {
    const communityKeys = ['theqoo', 'bobaedream', 'ppomppu', 'namuwiki'];
    const snsKeys = ['tiktok', 'youtube', 'threads'];

    const communityHits = sourcesPresent.filter(s => communityKeys.includes(s)).length;
    const snsHits = sourcesPresent.filter(s => snsKeys.includes(s)).length;

    let advertiserScore = 0;
    let newsBuzzScore = 0;
    let futureScore = 0;

    try {
        const ads = await extractAdKeywordsFromCategory(keyword);
        const matched = ads.find(a => a.keyword === keyword);
        if (matched) advertiserScore = Math.min(100, matched.advertisers * 10 + matched.frequency);
    } catch { }

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
