/**
 * 신규 데이터 소스 (v4.0) IPC 핸들러
 *
 * 게이팅 정책:
 *  - LITE (무료): YouTube RSS, 위키 Pageviews, 뽐뿌 RSS
 *  - PRO (무제한 라이선스): 그 외 전부 (쇼핑인사이트 XHR, TikTok, Threads,
 *    OpenAlex, Rakuten, 빅카인즈, 더쿠, 보배, 올리브영, 무신사,
 *    크림, 나무위키, Signal Aggregator 통합 풀링)
 */

import { ipcMain } from 'electron';
import { checkUnlimitedLicense, checkProTierAllowed } from './shared';

import { fetchAllCategoryRanks, fetchShoppingKeywordRank, fetchSegmentRanks, NAVER_SHOPPING_CATEGORIES } from '../../utils/sources/naver-shopping-keyword-rank';
import { getYoutubeTrendingKeywords, fetchYoutubeKRTrending } from '../../utils/sources/youtube-kr-rss';
import { fetchKoreanWikiTop, detectWikiRisingArticles, fetchArticleViewsTimeseries } from '../../utils/sources/wikipedia-pageviews';
import { fetchPpomppuHotdeals, getHotProductFrequency } from '../../utils/sources/ppomppu-rss';
// google-paa: Google bot 차단으로 제거됨
import { fetchTiktokTrendingHashtags, fetchTiktokKeywordInsights, getRisingHashtags } from '../../utils/sources/tiktok-creative-center';
import { searchThreads, getKeywordBuzzScore, batchKeywordBuzz } from '../../utils/sources/threads-graph-api';
import { fetchKoreanResearchConcepts, predictEmergingTopics, fetchConceptTrend } from '../../utils/sources/openalex-predictor';
import { fetchRakutenRanking, fetchAllRakutenCategories, RAKUTEN_GENRES } from '../../utils/sources/rakuten-ichiba';
import { searchNews, measureKeywordBuzz, batchMeasureBuzz } from '../../utils/sources/bigkinds-news-buzz';
import { fetchTheqooHot, getTheqooKeywords } from '../../utils/sources/theqoo-collector';
import { fetchBobaeBest, getBobaeKeywords } from '../../utils/sources/bobaedream-collector';
import { fetchOliveyoungBest, extractOliveyoungKeywords } from '../../utils/sources/oliveyoung-ranking';
import { fetchMusinsaRanking, extractMusinsaKeywords } from '../../utils/sources/musinsa-ranking';
// meta-ad-library: Facebook 403 차단으로 제거됨
// kream/namuwiki: 서버 차단·SPA 변경으로 제거됨
import { pullAllSeedKeywords, computeKeywordSignals, clearAggregatorCache } from '../../utils/sources/signal-aggregator';
import { buildPublicGoldenFeed, clearFeedCache } from '../../utils/sources/public-golden-feed';
import { getCachedRichFeed, clearRichFeedCache, RichKeywordRow } from '../../utils/sources/rich-feed-builder';
import { runHealthCheck, refreshHealthReport, getCachedReport, getQuickStatus } from '../../utils/sources/health-checker';
import { getRegistry, getAllStates, unblockSource, unblockAll, callAllSources } from '../../utils/sources/source-registry';
import { getStorageStats, getRisingKeywords, getNewKeywords, clearStorage } from '../../utils/sources/source-storage';
import { getCallStats, resetCallStats } from '../../utils/sources/rate-limiter';

function pro<T>(handler: () => Promise<T>): Promise<T | { error: string; requiresUnlimited: true }> {
    const lic = checkUnlimitedLicense();
    if (!lic.allowed) return Promise.resolve(lic.error as any);
    return handler();
}

export function setupSourceSignalHandlers(): void {
    console.log('[SOURCES] v4.0 데이터 소스 핸들러 등록');

    // ========== LITE (무료) ==========

    ipcMain.handle('source-youtube-trending', async () => {
        try {
            const keywords = await getYoutubeTrendingKeywords();
            const videos = await fetchYoutubeKRTrending();
            return { success: true, keywords, videos };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('source-wiki-top', async (_e, daysAgo?: number) => {
        try {
            const top = await fetchKoreanWikiTop(daysAgo || 1);
            return { success: true, items: top };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('source-wiki-rising', async (_e, threshold?: number) => {
        try {
            const rising = await detectWikiRisingArticles(threshold || 3.0);
            return { success: true, items: rising };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('source-wiki-article-trend', async (_e, article: string, days?: number) => {
        try {
            const series = await fetchArticleViewsTimeseries(article, days || 30);
            return { success: true, series };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('source-ppomppu-hotdeals', async (_e, category?: 'domestic' | 'foreign' | 'both') => {
        try {
            const deals = await fetchPpomppuHotdeals(category || 'both');
            const hot = await getHotProductFrequency();
            return { success: true, deals, hot };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // source-google-paa / source-google-paa-batch: Google bot 차단으로 제거됨

    // ========== PRO (무제한 라이선스 전용) ==========

    ipcMain.handle('source-shopping-keyword-rank', (_e, filter: any) => pro(async () => {
        const items = await fetchShoppingKeywordRank(filter);
        return { success: true, items };
    }));

    ipcMain.handle('source-shopping-all-categories', () => pro(async () => {
        const data = await fetchAllCategoryRanks();
        return { success: true, data, categories: NAVER_SHOPPING_CATEGORIES };
    }));

    ipcMain.handle('source-shopping-segment-ranks', (_e, cid: string, segments: any[]) => pro(async () => {
        const data = await fetchSegmentRanks(cid, segments);
        return { success: true, data };
    }));

    ipcMain.handle('source-tiktok-hashtags', (_e, options?: any) => pro(async () => {
        const items = await fetchTiktokTrendingHashtags(options || {});
        return { success: true, items };
    }));

    ipcMain.handle('source-tiktok-keyword-insights', (_e, country?: string) => pro(async () => {
        const items = await fetchTiktokKeywordInsights(country || 'KR');
        return { success: true, items };
    }));

    ipcMain.handle('source-tiktok-rising', () => pro(async () => {
        const items = await getRisingHashtags();
        return { success: true, items };
    }));

    ipcMain.handle('source-threads-search', (_e, query: string, options?: any) => pro(async () => {
        const posts = await searchThreads(query, options || {});
        return { success: true, posts };
    }));

    ipcMain.handle('source-threads-buzz', (_e, keyword: string) => pro(async () => {
        const score = await getKeywordBuzzScore(keyword);
        return { success: true, ...score };
    }));

    ipcMain.handle('source-threads-batch-buzz', (_e, keywords: string[]) => pro(async () => {
        const map = await batchKeywordBuzz(keywords);
        const obj: Record<string, number> = {};
        for (const [k, v] of map.entries()) obj[k] = v;
        return { success: true, scores: obj };
    }));

    ipcMain.handle('source-openalex-emerging', () => pro(async () => {
        const topics = await predictEmergingTopics();
        return { success: true, topics };
    }));

    ipcMain.handle('source-openalex-concepts', (_e, months?: number) => pro(async () => {
        const concepts = await fetchKoreanResearchConcepts(months || 6);
        return { success: true, concepts };
    }));

    ipcMain.handle('source-openalex-concept-trend', (_e, conceptId: string) => pro(async () => {
        const trend = await fetchConceptTrend(conceptId);
        return { success: true, trend };
    }));

    ipcMain.handle('source-rakuten-ranking', (_e, genreId?: number) => pro(async () => {
        const items = await fetchRakutenRanking(genreId || 0);
        return { success: true, items };
    }));

    ipcMain.handle('source-rakuten-all', () => pro(async () => {
        const data = await fetchAllRakutenCategories();
        return { success: true, data, genres: RAKUTEN_GENRES };
    }));

    ipcMain.handle('source-bigkinds-search', (_e, keyword: string, days?: number) => pro(async () => {
        const news = await searchNews(keyword, days || 7);
        return { success: true, news };
    }));

    ipcMain.handle('source-bigkinds-buzz', (_e, keyword: string) => pro(async () => {
        const buzz = await measureKeywordBuzz(keyword);
        return { success: true, ...buzz };
    }));

    ipcMain.handle('source-bigkinds-batch-buzz', (_e, keywords: string[]) => pro(async () => {
        const results = await batchMeasureBuzz(keywords);
        return { success: true, results };
    }));

    ipcMain.handle('source-theqoo-hot', () => pro(async () => {
        const posts = await fetchTheqooHot();
        const keywords = await getTheqooKeywords();
        return { success: true, posts, keywords };
    }));

    ipcMain.handle('source-bobae-best', () => pro(async () => {
        const posts = await fetchBobaeBest();
        const keywords = await getBobaeKeywords();
        return { success: true, posts, keywords };
    }));

    ipcMain.handle('source-oliveyoung-best', (_e, dispCatNo?: string) => pro(async () => {
        const products = await fetchOliveyoungBest(dispCatNo || '');
        const keywords = extractOliveyoungKeywords(products);
        return { success: true, products, keywords };
    }));

    ipcMain.handle('source-musinsa-ranking', (_e, category?: any) => pro(async () => {
        const products = await fetchMusinsaRanking(category || 'all');
        const keywords = extractMusinsaKeywords(products);
        return { success: true, products, keywords };
    }));

    // source-meta-ad-library: Facebook 403 차단으로 제거됨

    // source-kream-*, source-namu-*: 서버 차단·SPA 변경으로 제거됨

    // ========== Signal Aggregator (PRO) ==========

    ipcMain.handle('source-aggregator-pull', (_e, options?: { lite?: boolean }) => {
        if (!options?.lite) {
            const lic = checkUnlimitedLicense();
            if (!lic.allowed) return Promise.resolve(lic.error);
        }
        return (async () => {
            try {
                const result = await pullAllSeedKeywords(options || {});
                const seedsObj: Record<string, string[]> = {};
                for (const [k, v] of result.seeds.entries()) seedsObj[k] = v;
                return { success: true, seeds: seedsObj, raw: result.raw };
            } catch (e: any) { return { success: false, error: e.message }; }
        })();
    });

    ipcMain.handle('source-aggregator-signals', (_e, keyword: string, sources: string[]) => pro(async () => {
        const signals = await computeKeywordSignals(keyword, sources);
        return { success: true, signals };
    }));

    ipcMain.handle('source-aggregator-clear-cache', () => {
        clearAggregatorCache();
        clearFeedCache();
        return { success: true };
    });

    // ========== 공개 황금키워드 피드 (라이선스 무관) ==========
    ipcMain.handle('get-public-golden-feed', async (_e, options?: { force?: boolean }) => {
        try {
            const feed = await buildPublicGoldenFeed(options?.force === true);
            return { success: true, ...feed };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // ========== Rich Golden Feed (메인 핵심) ==========
    ipcMain.handle('get-rich-golden-feed', async (event, options?: { force?: boolean; tier?: 'lite' | 'pro'; limit?: number }) => {
        try {
            // PRO 티어 자격: 영구제 + 1년권. 자격 있으면 기본 pro, 명시적으로 lite 요청하면 lite.
            const isPro = checkProTierAllowed().allowed;
            const tier: 'lite' | 'pro' = isPro ? (options?.tier === 'lite' ? 'lite' : 'pro') : 'lite';
            // 🔥 v2.25.0: 사용자 요청 — 100건 + SSS 비중 극대화
            const limit = options?.limit || (tier === 'pro' ? 100 : 100);

            // 📡 진행 이벤트를 렌더러로 전송 (rich-feed-progress 채널)
            const onProgress = (payload: { step: string; percent: number; message: string }) => {
                try { event.sender.send('rich-feed-progress', payload); } catch {}
            };

            const result = await getCachedRichFeed(options?.force === true, { tier, limit }, onProgress);
            return { success: true, ...result, isPro };
        } catch (e: any) {
            console.error('[rich-feed] 실패:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('rich-feed-clear-cache', () => {
        clearRichFeedCache();
        return { success: true };
    });

    // 🔥 v2.19.0 Phase L-3: 30일 트렌드 시계열 + 4가지 타입 분류
    ipcMain.handle('keyword-trend-30day', async (_e, keyword: string) => {
        try {
            const { EnvironmentManager } = await import('../../utils/environment-manager');
            const { analyzeKeywordTrend } = await import('../../utils/trend-type-classifier');
            const env = EnvironmentManager.getInstance().getConfig();
            const config = {
                clientId: env.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
                clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
            };
            if (!config.clientId) return { success: false, error: 'Naver API 키 없음' };
            const result = await analyzeKeywordTrend(keyword, config);
            return { success: true, ...result };
        } catch (err: any) {
            return { success: false, error: err?.message };
        }
    });

    // 🔥 v2.19.0 Phase L-4: 세부 키워드 드릴다운 (시드 → 롱테일 10개)
    ipcMain.handle('rich-feed-drilldown', async (_e, seed: string) => {
        try {
            const { expandToLongtailReal } = await import('../../utils/pro-traffic-keyword-hunter');
            const { getNaverKeywordSearchVolumeSeparate } = await import('../../utils/naver-datalab-api');
            const { EnvironmentManager } = await import('../../utils/environment-manager');
            const env = EnvironmentManager.getInstance().getConfig();
            const config = {
                clientId: env.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
                clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
            };
            if (!config.clientId) return { success: false, error: 'Naver API 키 없음' };
            // 🔥 v2.19.1 Fix2: 30초 타임아웃 (UI 프리징 방지)
            const expanded = await Promise.race([
                expandToLongtailReal(seed),
                new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('롱테일 확장 30초 초과')), 30000)),
            ]).catch(e => { console.warn('[drilldown] timeout or error:', e?.message); return [] as string[]; });
            const candidates = expanded.slice(0, 25);
            if (candidates.length === 0) return { success: true, items: [] };
            const metrics = await getNaverKeywordSearchVolumeSeparate(config, candidates, { includeDocumentCount: true });
            // 🔥 v2.19.1 Fix2: 필터 완화 (sv>=50 OR gr>=0.8) — 롱테일은 sv 낮은 편
            const items = metrics
                .map((m: any) => {
                    const sv = (m.pcSearchVolume || 0) + (m.mobileSearchVolume || 0);
                    const dc = m.documentCount || 0;
                    const gr = dc > 0 ? sv / dc : 0;
                    return { keyword: m.keyword, searchVolume: sv, documentCount: dc, goldenRatio: gr };
                })
                .filter(i => i.documentCount > 0 && (i.searchVolume >= 50 || i.goldenRatio >= 0.8))
                .sort((a, b) => b.goldenRatio - a.goldenRatio)
                .slice(0, 10);
            return { success: true, items };
        } catch (err: any) {
            console.error('[rich-feed-drilldown] 실패:', err);
            return { success: false, error: err?.message };
        }
    });

    // ========== 내보내기 (CSV / JSON / 클립보드) ==========
    ipcMain.handle('rich-feed-export', async (_e, format: 'csv' | 'json' | 'clipboard', options?: any) => {
        try {
            const result = await getCachedRichFeed(false, options || {});
            const rows = result.rows;

            if (format === 'json') {
                return { success: true, format, content: JSON.stringify(rows, null, 2) };
            }

            if (format === 'csv' || format === 'clipboard') {
                const headers = ['순위', '카테고리', '등급', '키워드', '검색량', '문서수', '기회지수', 'CPC', '신선도', '발견소스수', '발견소스', '구매의도', '블루오션'];
                const lines = [headers.join(',')];
                for (const r of rows) {
                    const csvRow = [
                        r.rank,
                        `"${r.categoryIcon} ${r.category}"`,
                        r.grade,
                        `"${r.keyword.replace(/"/g, '""')}"`,
                        r.searchVolume,
                        r.documentCount,
                        r.goldenRatio,
                        (typeof r.cpc === 'number' && r.cpc > 0) ? r.cpc : '',
                        r.freshness,
                        r.sourceCount,
                        `"${r.sources.join(' | ')}"`,
                        r.purchaseIntent,
                        r.isBlueOcean ? 'Y' : 'N',
                    ];
                    lines.push(csvRow.join(','));
                }
                // UTF-8 BOM for Excel Korean compatibility
                const content = '\uFEFF' + lines.join('\r\n');
                return { success: true, format, content };
            }

            return { success: false, error: 'Unknown format' };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // ========== Health Check / 대시보드 ==========
    ipcMain.handle('source-health-refresh', async () => {
        try {
            const report = await refreshHealthReport();
            return { success: true, report };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('source-health-cached', () => {
        const report = getCachedReport();
        const quick = getQuickStatus();
        return { success: true, report, quick };
    });

    ipcMain.handle('source-health-quick', () => {
        return { success: true, ...getQuickStatus() };
    });

    ipcMain.handle('source-registry-list', () => {
        return { success: true, sources: getAllStates() };
    });

    ipcMain.handle('source-unblock', (_e, sourceId: string) => {
        if (sourceId === '*') unblockAll();
        else unblockSource(sourceId);
        return { success: true };
    });

    // ========== Storage / 시계열 ==========
    ipcMain.handle('source-storage-stats', () => {
        return { success: true, stats: getStorageStats() };
    });

    ipcMain.handle('source-storage-rising', (_e, sourceId: string, threshold?: number) => {
        return { success: true, items: getRisingKeywords(sourceId, threshold || 2.0) };
    });

    ipcMain.handle('source-storage-new', (_e, sourceId: string) => {
        return { success: true, keywords: getNewKeywords(sourceId) };
    });

    ipcMain.handle('source-storage-clear', () => {
        clearStorage();
        return { success: true };
    });

    // ========== Rate Limiter 통계 ==========
    ipcMain.handle('source-rate-stats', () => {
        return { success: true, stats: getCallStats() };
    });

    ipcMain.handle('source-rate-reset', () => {
        resetCallStats();
        return { success: true };
    });

    // ========== 통합 호출 (Registry 경유 안전 호출) ==========
    ipcMain.handle('source-call-all', async (_e, options?: { tier?: 'lite' | 'pro'; healthy?: boolean }) => {
        try {
            const result = await callAllSources(options || {});
            const obj: Record<string, any> = {};
            for (const [k, v] of result.entries()) obj[k] = v;
            return { success: true, results: obj };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    console.log('[SOURCES] v4.0 핸들러 등록 완료 (45개+)');
}
