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
import { getCachedRichFeed, clearRichFeedCache, RichKeywordRow, setUserWhitelist, getUserWhitelist } from '../../utils/sources/rich-feed-builder';
import { loadBloggerProfile, saveBloggerProfile, deleteBloggerProfile, BLOGGER_CATEGORIES, BloggerProfile } from '../../utils/blogger-profile';
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

    // v2.42.73: 스타뉴스 코리아 실시간 인기 기사 (연예/방송)
    ipcMain.handle('source-starnews-trending', async (_e, p: { limit?: number } = {}) => {
        try {
            const { fetchStarNewsTrending } = await import('../../utils/starnews-trending');
            const items = await fetchStarNewsTrending(p?.limit || 12);
            return { success: true, items, count: items.length };
        } catch (e: any) { return { success: false, error: e.message, items: [] }; }
    });

    // v2.42.74: 갓 떴는데 아직 HOT 아닌 선점 가능 기사 (글쓰기 가치 高)
    ipcMain.handle('source-starnews-fresh', async (_e, p: { maxMinutesAgo?: number; limit?: number } = {}) => {
        try {
            const { fetchStarNewsFresh } = await import('../../utils/starnews-trending');
            const items = await fetchStarNewsFresh({ maxMinutesAgo: p?.maxMinutesAgo, limit: p?.limit });
            return { success: true, items, count: items.length };
        } catch (e: any) { return { success: false, error: e.message, items: [] }; }
    });

    // v2.42.75: 4개 연예 매체 통합 (스타뉴스 + 스포츠조선 + 디스패치 + 마이데일리)
    ipcMain.handle('source-entertainment-aggregate', async (_e, p: { maxMinutesAgo?: number; limitPerSource?: number } = {}) => {
        try {
            const { fetchEntertainmentAggregate } = await import('../../utils/entertainment-news-aggregator');
            const items = await fetchEntertainmentAggregate({
                maxMinutesAgo: p?.maxMinutesAgo,
                limitPerSource: p?.limitPerSource,
            });
            return { success: true, items, count: items.length };
        } catch (e: any) { return { success: false, error: e.message, items: [] }; }
    });

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
    ipcMain.handle('get-rich-golden-feed', async (event, options?: { force?: boolean; tier?: 'lite' | 'pro'; limit?: number; aiAugmentation?: 'none' | 'claude' }) => {
        try {
            const isPro = checkProTierAllowed().allowed;
            const tier: 'lite' | 'pro' = isPro ? (options?.tier === 'lite' ? 'lite' : 'pro') : 'lite';
            // v2.43.17: 대량 발굴 — pro 300 → 600, lite 200 → 400 (사용자 요청 "키워드 대량 발굴")
            const limit = options?.limit || (tier === 'pro' ? 600 : 400);
            const aiAugmentation = options?.aiAugmentation || 'none';

            const onProgress = (payload: { step: string; percent: number; message: string }) => {
                try { event.sender.send('rich-feed-progress', payload); } catch {}
            };

            // v2.42.14: aiAugmentation='claude' 시 force=true 강제 (캐시 우회 — 매번 새 Claude 호출)
            const force = aiAugmentation === 'claude' ? true : (options?.force === true);
            const result = await getCachedRichFeed(force, { tier, limit, aiAugmentation }, onProgress);
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

    // v2.43.25 (사이클#2): 블로거 프로필 IPC
    ipcMain.handle('blogger-profile-get', () => {
        try {
            const profile = loadBloggerProfile();
            return { success: true, profile, categories: BLOGGER_CATEGORIES.map(c => ({ id: c.id, label: c.label, icon: c.icon })) };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('blogger-profile-set', (_e, profile: BloggerProfile) => {
        try {
            // 검증
            if (!profile || !Array.isArray(profile.selectedCategories) || profile.selectedCategories.length === 0) {
                return { success: false, error: '카테고리를 최소 1개 선택해주세요.' };
            }
            if (profile.selectedCategories.length > 3) {
                return { success: false, error: '카테고리는 최대 3개까지 선택 가능합니다.' };
            }
            const validIds = new Set(BLOGGER_CATEGORIES.map(c => c.id));
            for (const id of profile.selectedCategories) {
                if (!validIds.has(id as any)) return { success: false, error: `잘못된 카테고리: ${id}` };
            }
            saveBloggerProfile({
                selectedCategories: profile.selectedCategories,
                experienceLevel: profile.experienceLevel || 'beginner',
                dailyVisitors: typeof profile.dailyVisitors === 'number' ? profile.dailyVisitors : 0,
                setupAt: Date.now(),
                blogUrl: profile.blogUrl || undefined,
            });
            // 프로필 변경 시 캐시 무효화
            clearRichFeedCache();
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('blogger-profile-delete', () => {
        try {
            deleteBloggerProfile();
            clearRichFeedCache();
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // v2.43.34 (Phase 1): 블로그 URL → 자동 카테고리 감지
    //   네이버 블로그 URL 입력 → measureBlog() 가 카테고리 텍스트 추출 → BloggerCategoryInfo 의 affinityPattern 으로 자동 매핑
    // v2.43.40 (Phase 3-B Step 2): 의미 임베딩 (opt-in, ~110MB 모델)
    ipcMain.handle('semantic-status', () => {
        try {
            const { getSemanticStatus } = require('../../utils/semantic-embedding');
            return { success: true, status: getSemanticStatus() };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('semantic-enable', async () => {
        try {
            const { enableSemantic } = await import('../../utils/semantic-embedding');
            const r = await enableSemantic();
            return { success: r.ready, error: r.error };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    // v2.43.49: 사용자 행동 학습
    ipcMain.handle('behavior-record', (_e, payload: { keyword: string; type: string; source?: string }) => {
        try {
            const { recordBehavior } = require('../../utils/user-behavior-learning');
            recordBehavior(payload.keyword, payload.type as any, payload.source);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('behavior-top', (_e, limit?: number) => {
        try {
            const { getTopInteractedKeywords } = require('../../utils/user-behavior-learning');
            return { success: true, items: getTopInteractedKeywords(limit || 50) };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('behavior-clear', () => {
        try {
            const { clearBehavior } = require('../../utils/user-behavior-learning');
            clearBehavior();
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // v2.43.43: 유사 키워드 추천
    ipcMain.handle('find-similar-keywords', async (_e, keyword: string, options?: { limit?: number }) => {
        try {
            const { findSimilarKeywords } = await import('../../utils/similar-keywords');
            const envCfg: any = require('../../utils/environment-manager').EnvironmentManager.getInstance().getConfig();
            const items = await findSimilarKeywords(keyword, {
                limit: options?.limit || 10,
                clientId: envCfg.naverClientId || '',
                clientSecret: envCfg.naverClientSecret || '',
            });
            return { success: true, items };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('semantic-test', async (_e, a: string, b: string) => {
        try {
            const { semanticCompatible, embed, cosine } = await import('../../utils/semantic-embedding');
            const va = await embed(a);
            const vb = await embed(b);
            if (!va || !vb) return { success: false, error: '모델 비활성 또는 임베딩 실패' };
            return { success: true, similarity: cosine(va, vb) };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // v2.43.36 (Phase 3-A): external-trending-pump 수동 트리거 + 상태
    ipcMain.handle('trending-pump-run', async () => {
        try {
            const { runExternalTrendingPump } = await import('../../utils/sources/external-trending-pump');
            const result = await runExternalTrendingPump();
            return { success: true, result };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('trending-pump-status', () => {
        try {
            const { getPumpStatus } = require('../../utils/sources/external-trending-pump');
            return { success: true, status: getPumpStatus() };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('blogger-profile-auto-detect', async (_e, blogUrl: string) => {
        try {
            if (!blogUrl || typeof blogUrl !== 'string') return { success: false, error: 'URL이 비어있습니다' };
            const { measureBlog } = await import('../../utils/pro-hunter-v12/user-profile');
            const profile = await measureBlog(blogUrl);
            const rawCategoryText = String(profile.category || '');
            // measureBlog 가 5개까지 추출하지만 단일 필드로 합쳐 저장됨 → 가능한 모든 텍스트
            // BLOGGER_CATEGORIES 의 affinityPattern 으로 매칭하여 상위 3개 자동 추천
            const matches: Array<{ id: string; score: number }> = [];
            for (const cat of BLOGGER_CATEGORIES) {
                const m = (rawCategoryText.match(cat.affinityPattern) || []).length;
                if (m > 0) matches.push({ id: cat.id, score: m });
            }
            matches.sort((a, b) => b.score - a.score);
            const suggested = matches.slice(0, 3).map(m => m.id);
            return {
                success: true,
                detected: {
                    blogId: profile.blogId,
                    blogIndex: profile.blogIndex,
                    experienceMonths: profile.experienceMonths,
                    totalPosts: profile.totalPosts,
                    rawCategoryText,
                    suggestedCategories: suggested,
                },
            };
        } catch (e: any) {
            console.error('[blogger-profile-auto-detect] 실패:', e?.message);
            return { success: false, error: e?.message || '자동 감지 실패' };
        }
    });

    // v2.42.54: 사용자 화이트리스트 등록/조회
    ipcMain.handle('set-user-whitelist', (_e, words: string[]) => {
        try {
            setUserWhitelist(words);
            // 디스크 영속화
            try {
                const fs = require('fs');
                const path = require('path');
                const { app } = require('electron');
                const dir = app.getPath('userData');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'user-whitelist.json'), JSON.stringify({ words: getUserWhitelist() }), 'utf8');
            } catch (e: any) { console.warn('[user-whitelist] 저장 실패:', e?.message); }
            return { success: true, count: getUserWhitelist().length };
        } catch (err: any) {
            return { success: false, error: err?.message };
        }
    });
    ipcMain.handle('get-user-whitelist', () => {
        // 디스크에서 복원 (앱 시작 후 첫 호출 시)
        try {
            if (getUserWhitelist().length === 0) {
                const fs = require('fs');
                const path = require('path');
                const { app } = require('electron');
                const file = path.join(app.getPath('userData'), 'user-whitelist.json');
                if (fs.existsSync(file)) {
                    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                    if (Array.isArray(raw?.words)) setUserWhitelist(raw.words);
                }
            }
        } catch { /* ignore */ }
        return { success: true, words: getUserWhitelist() };
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

    // 🔥 v2.42.39: 시드 키워드 → 연관/유사 키워드 마인드맵 (Multi-Depth 1~5 자동)
    //   갯수 따라 자동 depth 결정:
    //     ≤50: depth 1 / ≤150: 2 / ≤500: 3 / ≤1000: 4 / ≤2000: 5
    //   각 depth 는 이전 depth 의 SSS/SS 키워드만 다음 시드로 (변별력 유지)
    //   진행률 이벤트: 'related-expansion-progress'
    ipcMain.handle('expand-keyword-related-metrics', async (event, payload: { seed: string; limit?: number }) => {
        try {
            const seed = String(payload?.seed || '').trim();
            if (!seed) return { success: false, error: '시드 키워드 필요' };
            // v2.42.40: 후보 풀 현실 한계 (Naver API rate limit) 반영 — max 500
            const limit = Math.max(10, Math.min(500, payload?.limit || 50));

            // 자동 depth 결정 (limit 임계값: 50/150/300/400/500)
            const targetDepth = limit <= 50 ? 1 : limit <= 150 ? 2 : limit <= 300 ? 3 : limit <= 400 ? 4 : 5;
            const expandPerSeed = limit <= 50 ? 50 : limit <= 150 ? 30 : limit <= 300 ? 25 : limit <= 400 ? 20 : 15;
            // 각 depth 에서 다음 depth 의 시드로 사용할 SSS/SS 키워드 수
            const seedsPerDepth = [0, 5, 8, 10, 12]; // index = depth-1, depth>=2 시 사용

            const { getNaverRelatedKeywords, getNaverKeywordSearchVolumeSeparate } = await import('../../utils/naver-datalab-api');
            const { expandToLongtailReal } = await import('../../utils/pro-traffic-keyword-hunter');
            const { EnvironmentManager } = await import('../../utils/environment-manager');
            const env = EnvironmentManager.getInstance().getConfig();
            const config = {
                clientId: env.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
                clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
            };
            if (!config.clientId) return { success: false, error: 'Naver API 키 없음 (환경설정에서 등록 필요)' };

            const sendProgress = (msg: string, phase: string, current: number, total: number) => {
                try { event.sender.send('related-expansion-progress', { msg, phase, current, total }); } catch { /* no-op */ }
            };

            // CLAUDE.md 등급 기준
            const calculateGrade = (sv: number, dc: number, ratio: number) => {
                if (sv >= 1000 && dc > 0 && dc <= 5000 && ratio >= 5) return 'SSS';
                if (sv >= 500 && dc > 0 && dc <= 10000 && ratio >= 3) return 'SS';
                if (sv >= 300 && ratio >= 2) return 'S';
                if (sv >= 100) return 'A';
                if (sv >= 30) return 'B';
                return 'C';
            };
            const gradeOrder: Record<string, number> = { SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 };

            // v2.42.46: 브랜드 동의어 사전 — 30+ 카테고리 × 평균 8 브랜드 = 250+ 풀
            const BRAND_FAMILIES: Record<string, string[]> = {
                // 신발·스포츠
                shoes: ['뉴발란스', '나이키', '아디다스', '푸마', '아식스', '리복', '컨버스', '반스', '호카', '캠퍼', '클락스', '버켄스탁', '온', '살로몬'],
                sportswear: ['나이키', '아디다스', '언더아머', '룰루레몬', '뉴발란스', '푸마', '아식스', '데상트', '안다르', '젝시믹스'],
                golf: ['타이틀리스트', '캘러웨이', '핑', '테일러메이드', '마제스티', '미즈노', '혼마', '클리브랜드'],
                outdoor: ['노스페이스', '블랙야크', 'K2', '네파', '디스커버리', '콜핑', '아크테릭스', '몽벨', '마무트', '컬럼비아'],
                camping: ['콜맨', '코베아', '스노우피크', '헬리녹스', '코지', 'MSR', '캠핑톡', '필드도어'],
                bicycle: ['자이언트', '메리다', '스페셜라이즈드', '캐논데일', '삼천리', '알톤', '트렉'],

                // 디지털·가전
                phone: ['아이폰', '갤럭시', '샤오미', '구글픽셀', '원플러스', '오포', '비보'],
                laptop: ['맥북', '그램', 'XPS', '서피스', '갤럭시북', '레노버', '아수스', '엠에스아이', '에이서', 'HP'],
                tv: ['삼성TV', 'LG TV', '소니TV', '샤오미TV', '하이센스', 'TCL'],
                appliance: ['삼성', 'LG', '위니아', '쿠첸', '쿠쿠', '대유위니아', '캐리어', '코웨이'],
                camera: ['캐논', '니콘', '소니', '후지', '올림푸스', '라이카', '파나소닉', '리코'],
                headphone: ['에어팟', '소니', '보스', '젠하이저', '슈어', '오디오테크니카', '뱅앤올룹슨', '비츠'],

                // 자동차
                car: ['현대', '기아', '제네시스', '벤츠', 'BMW', '아우디', '폭스바겐', '테슬라', '도요타', '렉서스', '볼보', '쉐보레', '르노', 'KGM'],
                ev: ['테슬라', '아이오닉', 'EV6', 'EV9', 'BMW i4', '메르세데스 EQ', '폴스타', '루시드', '리비안'],

                // 화장품·뷰티
                cosmetic: ['에스티로더', '맥', '랑콤', '디올', '샤넬', '클리니크', '키엘', '바비브라운', '나스', '시세이도', '슈에무라'],
                kcosmetic: ['닥터자르트', '이니스프리', '에뛰드', '미샤', '클리오', '롬앤', '페리페라', '바닐라코', '아모레퍼시픽', 'AHC', '메디힐', '닥터지'],
                perfume: ['디올', '샤넬', '조말론', '딥디크', '메종마르지엘라', '입생로랑', '톰포드', '바이레도', '크리드'],
                haircare: ['로레알', '판테네', '미장센', '려', '아베다', '케라스타즈', '리들리', '오리진스'],

                // 패션
                fashionSPA: ['유니클로', '자라', 'H&M', '스파오', '탑텐', '지오다노', '8seconds', '베이직하우스', '에잇세컨즈', '망고', '풀앤베어'],
                luxury: ['샤넬', '루이비통', '구찌', '디올', '프라다', '에르메스', '롤렉스', '오메가', '버버리', '발렌시아가', '셀린느', '로에베'],
                bag: ['루이비통', '구찌', '샤넬', '프라다', '마이클코어스', '투미', '샘소나이트', '리모와', '코치', '입생로랑'],
                watch: ['롤렉스', '오메가', '태그호이어', '까르띠에', '론진', '세이코', '시티즌', '바쉐론콘스탄틴', '파텍필립', '튜더'],
                glasses: ['룩옵티컬', '포파일', '안경포유', '알로', '레이밴', '오클리', '젠틀몬스터', '카림옵틱'],

                // 식음료·외식
                coffee: ['스타벅스', '투썸', '메가커피', '컴포즈', '백다방', '폴바셋', '할리스', '이디야', '커피빈', '카페베네', '엔젤리너스', '탐앤탐스'],
                bakery: ['파리바게뜨', '뚜레쥬르', '뜨레허', '파리크라상', '브레드피트', '미스터도넛', '던킨도너츠', '크리스피크림'],
                chicken: ['BBQ', 'BHC', '굽네', '처갓집', '네네', '멕시카나', '페리카나', '교촌', '푸라닭', '60계', '둘둘치킨', '깐부치킨'],
                pizza: ['도미노', '피자헛', '미스터피자', '파파존스', '피자스쿨', '피자알볼로', '뽕뜨락피자', '7번가피자'],
                burger: ['맥도날드', '버거킹', '롯데리아', '맘스터치', 'KFC', '쉑쉑', '파이브가이즈', '슈퍼두퍼', '바스버거'],
                franchise_korean: ['본죽', '김밥천국', '한솥', '김가네', '본도시락', '죽이야기', '본가네'],
                delivery: ['배민', '요기요', '쿠팡이츠', '배달의민족', '땡겨요', '위메프오'],

                // 유통
                convenience: ['GS25', 'CU', '세븐일레븐', '이마트24', '미니스톱'],
                mart: ['이마트', '홈플러스', '롯데마트', '하이마트', '코스트코', '트레이더스', '이마트에브리데이'],
                ecommerce: ['쿠팡', '네이버쇼핑', '마켓컬리', 'SSG닷컴', '롯데온', 'CJ몰', '11번가', 'GS샵', 'AK몰', '위메프', '티몬'],
                department: ['신세계', '롯데백화점', '현대백화점', '갤러리아', 'AK플라자'],
                fashionPlatform: ['무신사', 'W컨셉', '지그재그', '29CM', '스타일쉐어', '에이블리', '브랜디', '미피코퀴', '머스트잇'],

                // 콘텐츠·엔터
                ott: ['넷플릭스', '디즈니플러스', '티빙', '웨이브', '왓챠', '쿠팡플레이', '유튜브프리미엄', '애플TV'],
                game: ['플레이스테이션', '닌텐도', '엑스박스', 'PS5', 'PS4', '스위치'],
                mobile_game: ['리니지', '리니지W', '오딘', '원신', '배그', '카운터사이드', '에픽세븐', '카드라이더'],

                // 여행·항공·숙박
                airline: ['대한항공', '아시아나', '제주항공', '에어부산', '진에어', '티웨이', '에어서울', '이스타항공'],
                hotel: ['신라', '롯데호텔', '조선호텔', '메리어트', '하얏트', '힐튼', '콘래드', '인터컨티넨탈', '쉐라톤'],
                travel: ['마이리얼트립', '여기어때', '야놀자', '인터파크투어', '하나투어', '모두투어'],

                // 금융
                bank: ['국민', '신한', '하나', '우리', '농협', '기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일'],
                creditcard: ['신한카드', '현대카드', '삼성카드', '롯데카드', 'KB국민카드', '하나카드', '우리카드', 'BC카드'],
                insurance: ['삼성생명', '한화생명', '교보생명', '신한라이프', '메리츠', '현대해상', 'DB손해보험', 'KB손해보험'],

                // 가구·인테리어
                furniture: ['이케아', '한샘', '리바트', '일룸', '현대리바트', '까사미아', '까사키오', '데팡스'],
                mattress: ['시몬스', '에이스침대', '씰리', '템퍼', '슬로우슬립', '지누스'],

                // 건강·헬스
                supplement: ['닥터린', '암웨이', '한미', 'CJ뉴트라', '유한양행', '녹십자', '뉴트리원', '솔가'],
                gym: ['헬스장', '스포애니', '메이저짐', '그라운드짐', '플래닛피트니스', '에니타임피트니스'],

                // 교육
                edu_online: ['메가스터디', '시대인재', '이투스', 'EBSi', '대성마이맥', '메가공무원', '에듀윌'],
                edu_kid: ['윤선생', '구몬', '재능교육', '대교', '누에끼', '아이스크림에듀'],

                // 부동산·자산
                realestate: ['직방', '다방', '네이버부동산', '카카오맵', '호갱노노', '부동산뱅크'],
            };
            const detectBrandFamily = (seed: string): { family: string; brand: string } | null => {
                for (const [family, brands] of Object.entries(BRAND_FAMILIES)) {
                    for (const b of brands) {
                        if (seed.includes(b)) return { family, brand: b };
                    }
                }
                return null;
            };
            const generateSiblingSeeds = (seed: string, max: number = 8): string[] => {
                const detected = detectBrandFamily(seed);
                if (!detected) return [];
                const siblings = (BRAND_FAMILIES[detected.family] || []).filter(b => b !== detected.brand);
                const out: string[] = [];
                for (const sib of siblings.slice(0, max)) {
                    out.push(seed.replace(detected.brand, sib));
                }
                return out;
            };

            const expandOneSeed = async (s: string, count: number): Promise<string[]> => {
                const [related, longtail] = await Promise.all([
                    Promise.race([
                        getNaverRelatedKeywords(s, config, { limit: Math.ceil(count * 0.6) }),
                        new Promise<any[]>((_, rej) => setTimeout(() => rej(new Error('relkw timeout')), 18000)),
                    ]).catch(() => [] as any[]),
                    Promise.race([
                        expandToLongtailReal(s),
                        new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('longtail timeout')), 18000)),
                    ]).catch(() => [] as string[]),
                ]);
                const out: string[] = [];
                for (const r of related) {
                    const k = String(r.keyword || r || '').trim();
                    if (k && k.length >= 2 && k.length <= 30) out.push(k);
                }
                for (const k of longtail) {
                    const kk = String(k || '').trim();
                    if (kk && kk.length >= 2 && kk.length <= 30) out.push(kk);
                }
                return out;
            };

            // 누적
            const allCandidates = new Set<string>();
            allCandidates.add(seed);
            const measuredByDepth: Map<number, any[]> = new Map();

            // depth 1
            sendProgress(`1단계 확장 중: "${seed}"`, 'depth-1-expand', 0, 1);
            const d1Candidates = await expandOneSeed(seed, expandPerSeed);
            d1Candidates.forEach(k => allCandidates.add(k));

            // v2.42.45: 브랜드 sibling 시드 자동 추가 (1단계부터 다양성 확보)
            //   예: "뉴발란스 프리들" → "나이키 프리들", "아디다스 프리들" 등 sibling 시드 발굴
            const siblingSeeds = generateSiblingSeeds(seed, 6);
            if (siblingSeeds.length > 0) {
                sendProgress(`브랜드 sibling 확장: ${siblingSeeds.length}개`, 'depth-1-expand', 0, siblingSeeds.length);
                for (const sib of siblingSeeds) {
                    if (!allCandidates.has(sib)) {
                        allCandidates.add(sib);
                        d1Candidates.push(sib);
                    }
                    // sibling 의 롱테일도 함께 (각 5개)
                    const sibExpanded = await expandOneSeed(sib, Math.min(10, Math.ceil(expandPerSeed / 4))).catch(() => []);
                    for (const k of sibExpanded) {
                        if (!allCandidates.has(k)) {
                            allCandidates.add(k);
                            d1Candidates.push(k);
                        }
                    }
                }
            }

            sendProgress(`1단계 후보 ${d1Candidates.length}개 — 검색량 측정 중`, 'depth-1-measure', 0, d1Candidates.length + 1);

            // v2.42.48: d1Pool 중복 제거 (시드가 expandOneSeed 결과에 포함될 수 있어서)
            const d1Pool = Array.from(new Set([seed, ...d1Candidates])).slice(0, Math.min(200, expandPerSeed + siblingSeeds.length * 12 + 5));
            const d1Metrics = await getNaverKeywordSearchVolumeSeparate(config, d1Pool, { includeDocumentCount: true });
            const d1Items = d1Metrics.map((m: any) => {
                const sv = (m.pcSearchVolume || 0) + (m.mobileSearchVolume || 0);
                const dc = m.documentCount || 0;
                const ratio = dc > 0 ? parseFloat((sv / dc).toFixed(2)) : 0;
                return {
                    keyword: m.keyword, searchVolume: sv, documentCount: dc, goldenRatio: ratio,
                    grade: calculateGrade(sv, dc, ratio), cpc: m.monthlyAveCpc || 0,
                    competition: m.competition || null, isSeed: m.keyword === seed, depth: 1,
                };
            }).filter(i => i.documentCount > 0 || i.searchVolume > 0);
            measuredByDepth.set(1, d1Items);
            sendProgress(`1단계 완료: ${d1Items.length}건`, 'depth-1-done', d1Items.length, d1Items.length);

            // depth 2~5 (일반화 루프) — pool cap 은 누적 측정량을 limit 안에 맞추도록
            const poolCapByDepth: Record<number, number> = { 2: 120, 3: 180, 4: 220, 5: 250 };
            for (let d = 2; d <= targetDepth; d++) {
                const prevItems = measuredByDepth.get(d - 1) || [];
                const seedCap = seedsPerDepth[d - 1] || 5;

                // 이전 depth 의 SSS/SS 우선 → 부족하면 S 도 → 그래도 0이면 top N
                let nextSeeds = prevItems
                    .filter(i => !i.isSeed && (i.grade === 'SSS' || i.grade === 'SS'))
                    .slice(0, seedCap)
                    .map(i => i.keyword);
                if (nextSeeds.length === 0) {
                    nextSeeds = prevItems
                        .filter(i => !i.isSeed && i.grade === 'S')
                        .slice(0, seedCap)
                        .map(i => i.keyword);
                }
                if (nextSeeds.length === 0) {
                    nextSeeds = prevItems.filter(i => !i.isSeed).slice(0, Math.min(5, seedCap)).map(i => i.keyword);
                }
                // v2.42.45: nextSeeds 가 부족하면 brand sibling 추가 — 다른 메이커로 확장
                if (nextSeeds.length < seedCap) {
                    const need = seedCap - nextSeeds.length;
                    const siblings = generateSiblingSeeds(seed, need + 2).filter(s => !allCandidates.has(s));
                    nextSeeds.push(...siblings.slice(0, need));
                }
                if (nextSeeds.length === 0) break;

                sendProgress(`${d}단계 확장 중: ${nextSeeds.length}개 시드`, `depth-${d}-expand`, 0, nextSeeds.length);
                const dNewKws = new Set<string>();
                for (let i = 0; i < nextSeeds.length; i++) {
                    sendProgress(`${d}단계 ${i + 1}/${nextSeeds.length}: "${nextSeeds[i]}"`, `depth-${d}-expand`, i, nextSeeds.length);
                    const expanded = await expandOneSeed(nextSeeds[i], expandPerSeed);
                    for (const k of expanded) {
                        if (!allCandidates.has(k)) {
                            allCandidates.add(k);
                            dNewKws.add(k);
                        }
                    }
                }
                const dPool = Array.from(dNewKws).slice(0, poolCapByDepth[d] || 200);
                sendProgress(`${d}단계 후보 ${dPool.length}개 — 검색량 측정 중`, `depth-${d}-measure`, 0, dPool.length);
                if (dPool.length === 0) break;

                const dMetrics = await getNaverKeywordSearchVolumeSeparate(config, dPool, { includeDocumentCount: true });
                const dItems = dMetrics.map((m: any) => {
                    const sv = (m.pcSearchVolume || 0) + (m.mobileSearchVolume || 0);
                    const dc = m.documentCount || 0;
                    const ratio = dc > 0 ? parseFloat((sv / dc).toFixed(2)) : 0;
                    return {
                        keyword: m.keyword, searchVolume: sv, documentCount: dc, goldenRatio: ratio,
                        grade: calculateGrade(sv, dc, ratio), cpc: m.monthlyAveCpc || 0,
                        competition: m.competition || null, isSeed: false, depth: d,
                    };
                }).filter(i => i.documentCount > 0 || i.searchVolume > 0);
                measuredByDepth.set(d, dItems);
                sendProgress(`${d}단계 완료: ${dItems.length}건`, `depth-${d}-done`, dItems.length, dItems.length);
            }

            // 통합 + 정렬
            const allItems = ([] as any[]).concat(...Array.from(measuredByDepth.values()));
            allItems.sort((a, b) => {
                if (a.isSeed && !b.isSeed) return -1;
                if (!a.isSeed && b.isSeed) return 1;
                const ga = gradeOrder[a.grade] || 0;
                const gb = gradeOrder[b.grade] || 0;
                if (ga !== gb) return gb - ga;
                return b.goldenRatio - a.goldenRatio;
            });
            // v2.42.48: 같은 키워드 중복 제거 — 정렬 후 첫 등장(가장 좋은 등급/얕은 depth) 유지
            const seenKw = new Set<string>();
            const dedupedItems: any[] = [];
            for (const item of allItems) {
                const key = String(item.keyword || '').trim();
                if (!key || seenKw.has(key)) continue;
                seenKw.add(key);
                dedupedItems.push(item);
            }
            const finalItems = dedupedItems.slice(0, limit);

            sendProgress(`완료: 총 ${finalItems.length}건`, 'done', finalItems.length, finalItems.length);

            return {
                success: true,
                seed,
                items: finalItems,
                depth: targetDepth,
                sources: {
                    depth1: measuredByDepth.get(1)?.length || 0,
                    depth2: measuredByDepth.get(2)?.length || 0,
                    depth3: measuredByDepth.get(3)?.length || 0,
                    depth4: measuredByDepth.get(4)?.length || 0,
                    depth5: measuredByDepth.get(5)?.length || 0,
                    totalCandidates: allCandidates.size,
                    measured: finalItems.length,
                },
            };
        } catch (err: any) {
            console.error('[expand-keyword-related-metrics] 실패:', err);
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
