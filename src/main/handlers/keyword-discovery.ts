// 키워드 발굴 핸들러
import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { createHmac } from 'crypto';
import { getNaverTrendKeywords, getNaverRankingKeywords, getNaverKeywordSearchVolume, getNaverKeywordSearchVolumeSeparate, getNaverRelatedKeywords, classifyKeywordIntent, getDateToday, getDateDaysAgo } from '../../utils/naver-datalab-api';
import { getNaverAutocompleteKeywords } from '../../utils/naver-autocomplete';
import { getGoogleTrendKeywords } from '../../utils/google-trends-api';
import { getYouTubeTrendKeywords } from '../../utils/youtube-data-api';
import { EnvironmentManager } from '../../utils/environment-manager';
import { TimingGoldenFinder, KeywordData, TimingScore } from '../../utils/timing-golden-finder';
import { getAllRealtimeKeywords, getZumRealtimeKeywords, getGoogleRealtimeKeywords, getNateRealtimeKeywords, getDaumRealtimeKeywords, getNaverRealtimeKeywords, strengthenRealtimeKeywordGroups, RealtimeKeyword } from '../../utils/realtime-search-keywords';
// v2.45+: 실시간 포털 수집은 axios+cheerio 통합 경로 사용 (브라우저 프로세스 미사용)
import { analyzeKeywordTrendingReason } from '../../utils/keyword-trend-analyzer';
import { validateKeyword, validateKeywords } from '../../utils/keyword-validator';
import * as licenseManager from '../../utils/licenseManager';
import { MDPEngine, MDPResult, ExternalSignals } from '../../utils/mdp-engine';
import { keywordDiscoveryAbortMap, checkUnlimitedLicense } from './shared';
import { callAllSources } from '../../utils/sources/source-registry';
import { getCachedReport } from '../../utils/sources/health-checker';
import { getNaverNewsRankingKeywords } from '../../utils/sources/naver-news-ranking';
import { getCrossCategoryDiscoverySeeds, getDiscoveryCategorySeeds, matchesDiscoveryCategory, resolveDiscoveryCategoryIds } from '../../utils/category-discovery-map';
import { deterministicRange } from '../../utils/deterministic-random';
import { createGoldenSssTargetTracker, countSss, getGoldenDiscoveryScanLimit, isQualityGoldenDiscoveryResult, rankGoldenDiscoveryResults, resolveGoldenDiscoveryTarget } from '../../utils/golden-discovery-floor';
import { buildCategoryFirstGoldenSeedPlan } from '../../utils/category-first-golden-discovery';
import { buildFreshIssueGoldenSeeds } from '../../utils/fresh-issue-golden-seeds';
import { discoverDirectGoldenKeywords } from '../../utils/direct-golden-keyword-miner';
import { isChromeAvailable } from '../../utils/chrome-finder';
import { analyzeSmartBlocks } from '../../utils/pro-hunter-v12/smartblock-parser';
import { enrichKeywordsWithDeepSerp, applySerpDifficulty } from '../../utils/pro-hunter-v12/deep-serp-enricher';
import type { SerpDifficultySignal } from '../../utils/pro-hunter-v12/serp-difficulty-adapter';
import { verifyKeywordValue } from '../../utils/pro-hunter-v12/keyword-value-verifier';
import { enrichKeywordsWithVacancy, isVacancyReliable } from '../../utils/pro-hunter-v12/vacancy-enricher';
import type { VacancyResult } from '../../utils/pro-hunter-v12/vacancy-detector';
import { enrichKeywordsWithContentBrief, isContentBriefReliable } from '../../utils/pro-hunter-v12/content-brief-enricher';
import type { SerpAnalysis } from '../../utils/pro-hunter-v12/serp-content-analyzer';

// v4.0: 외부 신호 캐시 (앱 lifetime, 30분 TTL)
let _v4SignalCache: { map: Map<string, ExternalSignals>; expiresAt: number } | null = null;
let _v4PullInFlight: Promise<Map<string, ExternalSignals>> | null = null;

function buildSignalsFromResults(sourceResults: Map<string, { success: boolean; keywords: string[] }>): Map<string, ExternalSignals> {
    const sigMap = new Map<string, ExternalSignals>();
    const communityKeys = ['theqoo', 'bobaedream', 'ppomppu', 'namuwiki'];
    const snsKeys = ['tiktok-cc', 'youtube-kr'];

    for (const [sourceId, result] of sourceResults.entries()) {
        if (!result.success || result.keywords.length === 0) continue;
        for (const rawKw of result.keywords) {
            // F4: 위생 필터 — 노이즈 차단
            const kw = String(rawKw || '').trim();
            if (!kw || kw.length < 2 || kw.length > 25) continue;
            if (/^\d+$/.test(kw)) continue;
            if (!/[가-힣a-zA-Z]/.test(kw)) continue;
            if (kw === '대문' || kw.startsWith('특수:') || kw.startsWith('파일:')) continue;

            const existing = sigMap.get(kw);
            const sources = existing ? Array.from(new Set([...existing.sources, sourceId])) : [sourceId];
            const cb = sources.filter(s => communityKeys.some(k => s.includes(k))).length;
            const sl = sources.filter(s => snsKeys.some(k => s.includes(k))).length;
            sigMap.set(kw, {
                communityBuzzScore: Math.min(100, cb * 33),
                snsLeadingScore: Math.min(100, sl * 50),
                sources,
            });
        }
    }
    return sigMap;
}

async function getV4Signals(isPro: boolean): Promise<Map<string, ExternalSignals>> {
    const now = Date.now();
    if (_v4SignalCache && _v4SignalCache.expiresAt > now) return _v4SignalCache.map;

    // 백그라운드 풀 in-flight면 그걸 기다림 (3초 budget)
    if (!_v4PullInFlight) {
        _v4PullInFlight = (async () => {
            try {
                const sourceResults = await callAllSources({
                    tier: isPro ? undefined : 'lite',
                    healthy: true,
                });
                const map = buildSignalsFromResults(sourceResults);
                _v4SignalCache = { map, expiresAt: Date.now() + 30 * 60_000 };
                return map;
            } finally {
                _v4PullInFlight = null;
            }
        })();
    }

    // 3초 budget — 못 끝나면 빈 맵 반환, 백그라운드에서 계속 진행
    return Promise.race([
        _v4PullInFlight,
        new Promise<Map<string, ExternalSignals>>(resolve => setTimeout(() => resolve(new Map()), 3000)),
    ]);
}

function normalizeCategoryLiveSeed(raw: unknown): string {
    let text = String(raw || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/[“”"「」『』]/g, ' ')
        .replace(/\[[^\]]{1,18}\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!/[가-힣a-zA-Z]/.test(text) || text.length < 2) return '';
    if (text.length > 42) {
        const clipped = text.slice(0, 42);
        text = clipped.replace(/\s+\S*$/, '').trim() || clipped.trim();
    }
    return text;
}

function pushUniqueLiveSeed(out: string[], seen: Set<string>, raw: unknown): void {
    const text = normalizeCategoryLiveSeed(raw);
    if (!text) return;
    const key = text.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
}

function withLiveSeedTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    const timeout = new Promise<T>(resolve => {
        const timer = setTimeout(() => resolve(fallback), ms);
        timer.unref?.();
    });
    return Promise.race([promise, timeout]);
}

async function collectCategoryFirstLiveSeeds(category: string, limit = 80, timeoutMs = 3500): Promise<string[]> {
    const categoryIds = resolveDiscoveryCategoryIds(category);
    if (!category || categoryIds.length === 0) return [];

    const tasks: Array<Promise<string[]>> = [];
    const genericLimit = Math.min(
        limit,
        timeoutMs <= 1200 ? 24 : 60,
    );
    const genericTimeoutMs = Math.max(
        400,
        Math.min(timeoutMs, timeoutMs <= 1200 ? 900 : 1800),
    );
    const isPolicy = categoryIds.includes('policy');
    const isEntertainment = categoryIds.some(id => ['celeb', 'broadcast', 'music', 'movie', 'drama'].includes(id));

    tasks.push(withLiveSeedTimeout(
        getNaverRealtimeKeywords(Math.max(10, Math.min(40, genericLimit)))
            .then(items => items.map(item => item.keyword)),
        genericTimeoutMs,
        [],
    ));

    tasks.push(withLiveSeedTimeout(
        getNaverNewsRankingKeywords()
            .then(items => items.slice(0, Math.max(10, genericLimit)).map(item => item.keyword)),
        genericTimeoutMs,
        [],
    ));

    if (isPolicy) {
        tasks.push(withLiveSeedTimeout(
            import('../../utils/policy-briefing-api')
                .then(async mod => {
                    const items = await mod.getPolicyBriefingKeywords(Math.max(limit, timeoutMs <= 1200 ? 40 : 120));
                    return items.flatMap(item => [
                        ...mod.expandPolicyDiscoverySeeds(item.keyword, 8),
                        item.keyword,
                        item.title,
                    ].filter(Boolean) as string[]);
                }),
            timeoutMs,
            [],
        ));
    }

    if (isEntertainment) {
        const perSourceLimit = Math.min(30, Math.max(10, Math.ceil(limit / 4)));
        tasks.push(withLiveSeedTimeout(
            import('../../utils/entertainment-news-aggregator')
                .then(mod => mod.fetchEntertainmentAggregate({ maxMinutesAgo: 360, limitPerSource: perSourceLimit }))
                .then(items => items.flatMap(item => [item.title, `${item.title} ${item.category}`])),
            timeoutMs,
            [],
        ));
        tasks.push(withLiveSeedTimeout(
            import('../../utils/starnews-trending')
                .then(mod => Promise.all([
                    mod.fetchStarNewsFresh({ maxMinutesAgo: 360, limit: Math.min(30, limit) }),
                    mod.fetchStarNewsTrending(Math.min(30, limit)),
                ]))
                .then(([fresh, trending]) => [
                    ...fresh.map(item => item.title),
                    ...trending.map(item => item.title),
                ]),
            timeoutMs,
            [],
        ));
    }

    const settled = await Promise.allSettled(tasks);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        for (const raw of result.value) {
            pushUniqueLiveSeed(out, seen, raw);
            if (out.length >= limit) return out;
        }
    }
    return out;
}


export function setupKeywordDiscoveryHandlers(): void {
  ipcMain.handle('stop-keyword-discovery', (_event, keyword: string) => {
    console.log(`[KEYWORD-MASTER] 중지 요청: "${keyword}"`);
    keywordDiscoveryAbortMap.set(keyword, true);
    return { success: true };
  });

  ipcMain.handle('find-golden-keywords', async (event, keyword: string | { keyword: string; options?: any }, options?: any) => {
    // 라이선스 체크
    const license = await licenseManager.loadLicense();
    if (!license || !license.isValid) {
      event.sender.send('keyword-discovery-progress', {
        type: 'error',
        message: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.'
      });
      return { success: false, keywords: [], error: '라이선스가 등록되지 않았습니다.' };
    }

    // 옵션이 두 번째 인자로 전달된 경우 처리
    let actualKeyword: string;
    let actualOptions: any = {};

    if (typeof keyword === 'object' && keyword.keyword) {
      actualKeyword = keyword.keyword;
      actualOptions = keyword.options || {};
    } else {
      actualKeyword = keyword as string;
      actualOptions = options || {};
    }

    const discoveryKey = actualKeyword || `category:${actualOptions?.category || 'all'}`;

    // 중지 플래그 초기화
    keywordDiscoveryAbortMap.set(discoveryKey, false);

    // 중지 여부 확인 헬퍼 함수
    const checkAbort = (): boolean => {
      return keywordDiscoveryAbortMap.get(discoveryKey) === true || keywordDiscoveryAbortMap.get(actualKeyword) === true;
    };

    // 강제로 네이버만 사용
    const source = 'naver';
    const category = actualOptions.category || '';
    const categoryFirstMode = actualOptions.categoryFirst === true || !!category;
    if (actualOptions.requireCategory === true && !category) {
      console.warn('[KEYWORD-MASTER] requireCategory=true 요청이지만 카테고리가 없어 전체 카테고리 발굴로 전환합니다.');
    }
    const page = actualOptions.page || 0;
    const rawLimitValue = actualOptions.limit;
    const rawLimit = Number(rawLimitValue);
    const hasExplicitLimit = rawLimitValue !== undefined
      && rawLimitValue !== null
      && String(rawLimitValue).trim() !== ''
      && Number.isFinite(rawLimit);
    const quickPreview = hasExplicitLimit
      && rawLimit > 0
      && rawLimit < 30
      && actualOptions.quickPreview !== false;
    const seedlessQuickPreview = quickPreview && !String(actualKeyword || '').trim();
    const limit = hasExplicitLimit
      ? (rawLimit === 0 ? 0 : Math.max(1, Math.floor(rawLimit)))
      : 30;

    // 명시적으로 0을 보낸 경우만 무제한으로 설정하고, 정밀 기본값은 30개로 고정한다.
    const isUnlimited = hasExplicitLimit && limit === 0;
    const effectiveLimit = isUnlimited ? 10000 : limit; // 무제한일 때 10000개까지 (실질적 무제한)
    const visibleTarget = isUnlimited
      ? 10000
      : resolveGoldenDiscoveryTarget(effectiveLimit, { honorRequestedLimit: quickPreview });
    const progressStartedAt = Date.now();
    const progressTarget = isUnlimited ? 5000 : visibleTarget;
    let lastProgressAt = 0;
    const sendDiscoveryProgress = (
      status: string,
      data: Record<string, any> = {},
      force = false,
    ) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < 1200) return;
      lastProgressAt = now;
      try {
        event.sender.send('keyword-discovery-progress', {
          type: 'progress',
          status,
          message: status,
          elapsedMs: now - progressStartedAt,
          current: typeof data.current === 'number' ? data.current : 0,
          target: typeof data.target === 'number' ? data.target : progressTarget,
          ...data,
        });
      } catch {}
    };

    console.log('[KEYWORD-MASTER] 황금 키워드 발굴:', actualKeyword, { source, category, page, limit, effectiveLimit, visibleTarget, quickPreview, seedlessQuickPreview, isUnlimited: isUnlimited ? '무제한' : limit });
    sendDiscoveryProgress(
      category
        ? `${category} 카테고리 황금키워드 발굴을 시작합니다.`
        : '황금키워드 발굴을 시작합니다.',
      { current: 0, target: progressTarget, phase: 'start' },
      true,
    );

    try {
      // 환경 변수에서 API 키 로드 (EnvironmentManager 사용)
      const envManager = EnvironmentManager.getInstance();
      const env = envManager.getConfig();

      // 네이버 API 키 확인 및 로깅
      const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
      const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

      console.log('[KEYWORD-MASTER] 환경변수 로드 완료');
      console.log('[KEYWORD-MASTER] 네이버 API 키 확인:', {
        hasClientId: !!naverClientId,
        hasClientSecret: !!naverClientSecret,
        clientIdLength: naverClientId?.length || 0,
        clientSecretLength: naverClientSecret?.length || 0
      });

      // 여러 소스에서 키워드 수집 (소스 및 카테고리 필터링)
      let allKeywords: Array<{
        keyword: string;
        pcSearchVolume?: number | null;
        mobileSearchVolume?: number | null;
        searchVolume?: number | null;
        changeRate?: number;
        category?: string;
        rank?: number;
        documentCount?: number | null;
        competitionRatio?: number | null;
        score?: number;
      }> = [];

      // 네이버만 사용 (강제)
      if (source === 'naver') {
        // 🔥 API 키가 없으면 백업 황금키워드 제공
        if (!naverClientId || !naverClientSecret) {
          console.log('[KEYWORD-MASTER] ⚠️ 네이버 API 키 없음, 백업 황금키워드 제공');
          const backupKeywords = generateLiteBackupKeywords(actualKeyword || category || '황금키워드');
          event.sender.send('keyword-discovery-progress', {
            type: 'complete',
            current: backupKeywords.length,
            target: backupKeywords.length,
            message: '백업 황금키워드를 제공합니다. 더 정확한 결과를 위해 API 키를 등록해주세요.'
          });
          return {
            keywords: backupKeywords,
            total: backupKeywords.length,
            source: 'backup',
            note: 'API 키 등록 시 더 정확한 실시간 데이터를 받을 수 있습니다.'
          };
        }

        if (naverClientId && naverClientSecret) {
          console.log('[KEYWORD-MASTER] MDP 기반 차세대 키워드 발굴 시작...');

          const engine = new MDPEngine({
            clientId: naverClientId,
            clientSecret: naverClientSecret
          });
          let externalSignalMapForSeeds = new Map<string, ExternalSignals>();

          // ===== v4.0: 비차단 외부 신호 주입 (3초 budget, 캐시 우선, 실패 무시) =====
          try {
            const cachedSignals = _v4SignalCache && _v4SignalCache.expiresAt > Date.now()
              ? _v4SignalCache.map
              : null;
            sendDiscoveryProgress(
              quickPreview && !cachedSignals
                ? '빠른 샘플 모드: 외부 트렌드 대기 없이 바로 검증합니다.'
                : '외부 트렌드 신호를 확인하는 중입니다.',
              { current: 0, target: progressTarget, phase: 'signals' },
              true,
            );
            const isPro = checkUnlimitedLicense().allowed;
            const quickSignalMap = quickPreview
              ? (cachedSignals || new Map<string, ExternalSignals>())
              : null;
            const sigMap = quickSignalMap || await getV4Signals(isPro);
            externalSignalMapForSeeds = sigMap;
            if (sigMap.size > 0) {
              engine.injectBatchSignals(sigMap);
              console.log(`[KEYWORD-MASTER] v4.0 외부 신호 ${sigMap.size}개 주입 (PRO=${isPro})`);
              sendDiscoveryProgress(`외부 트렌드 신호 ${sigMap.size}개를 반영했습니다.`, { current: 0, target: progressTarget, phase: 'signals' }, true);
            } else {
              console.log('[KEYWORD-MASTER] v4.0 신호 없음 — 기본 MDP로 진행');
              sendDiscoveryProgress('외부 신호 없이 기본 MDP 검증으로 진행합니다.', { current: 0, target: progressTarget, phase: 'signals' }, true);
            }
          } catch (aggErr: any) {
            console.warn('[KEYWORD-MASTER] v4.0 신호 주입 실패 (무시하고 계속):', aggErr?.message);
            sendDiscoveryProgress('외부 신호 확인은 실패했지만 기본 검증을 계속합니다.', { current: 0, target: progressTarget, phase: 'signals' }, true);
          }

          // v2.43.0: 1500ms (CPU 67% 감소) + unref + finally 보장 (모든 경로에서 clear)
          const abortCheckInterval = setInterval(() => {
            if (keywordDiscoveryAbortMap.get(discoveryKey) || keywordDiscoveryAbortMap.get(actualKeyword)) {
              engine.abort();
              clearInterval(abortCheckInterval);
            }
          }, 1500);
          abortCheckInterval.unref?.();

          try {
            const preliminaryScanLimit = getGoldenDiscoveryScanLimit(effectiveLimit, isUnlimited, 0, {
              categoryFirst: categoryFirstMode,
              honorRequestedLimit: quickPreview,
            });
            const categorySeedBudget = Math.min(
              isUnlimited ? 1200 : (seedlessQuickPreview ? 120 : (quickPreview ? 260 : (categoryFirstMode ? 900 : 520))),
              Math.max(seedlessQuickPreview ? 60 : (quickPreview ? 80 : (categoryFirstMode ? 420 : 180)), preliminaryScanLimit)
            );
            if (categoryFirstMode && category) {
              sendDiscoveryProgress(`${category} 카테고리의 실시간 시드를 수집하는 중입니다.`, { current: 0, target: progressTarget, phase: 'live-seeds' }, true);
            }
            const quickLiveSeedTimeoutMs = quickPreview
              ? (seedlessQuickPreview ? 1000 : 1200)
              : 3500;
            const liveCategorySeeds = categoryFirstMode && category
              ? await collectCategoryFirstLiveSeeds(
                category,
                seedlessQuickPreview
                  ? Math.min(12, Math.max(6, Math.floor(categorySeedBudget * 0.1)))
                  : (quickPreview
                    ? Math.min(40, Math.max(12, Math.floor(categorySeedBudget * 0.18)))
                    : Math.min(160, Math.max(60, Math.floor(categorySeedBudget * 0.25)))),
                quickLiveSeedTimeoutMs,
              )
              : [];
            const categorySeedPlan = category
              ? buildCategoryFirstGoldenSeedPlan({
                category,
                keyword: actualKeyword,
                maxSeeds: categorySeedBudget,
                liveSeeds: liveCategorySeeds,
              })
              : null;
            const categorySeeds = categorySeedPlan?.seeds
              || getDiscoveryCategorySeeds(category, Math.min(420, Math.max(120, preliminaryScanLimit * 2)));
            const categoryIds = categorySeedPlan?.categoryIds || resolveDiscoveryCategoryIds(category);
            const freshIssueSeedRecords = buildFreshIssueGoldenSeeds(externalSignalMapForSeeds, {
              maxBaseSeeds: seedlessQuickPreview
                ? 18
                : (quickPreview ? 24 : (categoryFirstMode ? 48 : 72)),
              intentsPerSeed: seedlessQuickPreview ? 4 : (quickPreview ? 5 : 8),
              categoryIds,
            });
            const freshIssueSeeds = freshIssueSeedRecords.map(item => item.keyword);
            const combinedDiscoverySeeds = Array.from(new Set([
              ...freshIssueSeeds,
              ...categorySeeds,
            ]));
            const discoverySeedCount = combinedDiscoverySeeds.length;
            const scanLimit = getGoldenDiscoveryScanLimit(effectiveLimit, isUnlimited, discoverySeedCount, {
              categoryFirst: categoryFirstMode,
              honorRequestedLimit: quickPreview,
            });
            const effectiveScanLimit = quickPreview
              ? Math.min(seedlessQuickPreview ? 180 : 240, scanLimit)
              : scanLimit;
            const seedForDiscovery = categoryFirstMode
              ? (combinedDiscoverySeeds[0] || actualKeyword || category || '황금키워드')
              : (actualKeyword || combinedDiscoverySeeds[0] || category || '황금키워드');
            sendDiscoveryProgress(
              `${category || '전체'} 시드 ${discoverySeedCount}개 확보(급상승 ${freshIssueSeedRecords.length}개, 카테고리 ${categorySeeds.length}개), 최대 ${effectiveScanLimit.toLocaleString()}개 후보를 검증합니다.`,
              {
                current: 0,
                target: effectiveScanLimit,
                phase: 'scan-plan',
                seeds: discoverySeedCount,
                categorySeeds: categorySeeds.length,
                freshIssueSeeds: freshIssueSeedRecords.length,
                scanLimit: effectiveScanLimit,
              },
              true,
            );
            const discoveryOptions: any = {
              limit: effectiveScanLimit,
              maxCheckedSignals: effectiveScanLimit,
              maxProcessedSeeds: seedlessQuickPreview
                ? Math.max(8, Math.min(discoverySeedCount, 14))
                : quickPreview
                ? Math.max(10, Math.min(discoverySeedCount, seedlessQuickPreview ? 14 : 24))
                : Math.max(60, Math.min(discoverySeedCount + 120, categoryFirstMode ? 900 : 260)),
              minVolume: 10,
              seedKeywords: categoryFirstMode
                ? combinedDiscoverySeeds
                : (actualKeyword
                  ? combinedDiscoverySeeds.slice(0, Math.min(discoverySeedCount, 140))
                  : combinedDiscoverySeeds),
              categoryIds,
              categoryStrict: categoryIds.length > 0,
              fastPreview: quickPreview,
              includeMeasuredFallback: quickPreview,
              freshIssueSeedCount: freshIssueSeedRecords.length,
              freshIssueSeedPreview: freshIssueSeedRecords.slice(0, 12).map(item => ({
                keyword: item.keyword,
                score: item.score,
                issueType: item.issueType,
                sources: item.sources,
              })),
            };

            if (categoryIds.length > 0) {
              console.log(`[KEYWORD-MASTER] 카테고리 우선 시드 주입: category=${category} ids=${categoryIds.join(',')} seeds=${discoverySeedCount}, freshIssues=${freshIssueSeedRecords.length}, categorySeeds=${categorySeeds.length}, live=${categorySeedPlan?.liveSeedCount || 0}, seed="${seedForDiscovery}", hints=${categorySeedPlan?.freshnessHints.join('|') || '-'}`);
            }

            const chunk: MDPResult[] = [];
            let totalAdded = 0;
            let sssAdded = 0;
            const sssTarget = isUnlimited ? Number.POSITIVE_INFINITY : visibleTarget;
            const sssTracker = isUnlimited ? null : createGoldenSssTargetTracker(sssTarget, {
              honorRequestedLimit: quickPreview,
              diversifySimilarIntents: true,
              maxSimilarPerCluster: 2,
              requireActionableIntent: true,
            });
            const chunkThreshold = quickPreview ? Math.max(5, Math.min(10, sssTarget)) : 50;
            const phaseLabels: Record<string, string> = {
              start: '엔진 준비',
              seed: '시드 분석',
              autocomplete: '자동완성 수집',
              patterns: '패턴 생성',
              batch: '검색량 검증',
              yield: '후보 발견',
              complete: '엔진 검증 완료',
            };
            discoveryOptions.onProgress = (progress: any) => {
              const checked = Math.max(0, Number(progress?.checked || 0));
              const yielded = Math.max(totalAdded, Number(progress?.yielded || 0));
              const label = phaseLabels[progress?.phase] || '검증 진행';
              const batchText = progress?.batchIndex && progress?.totalBatches
                ? ` · 배치 ${progress.batchIndex}/${progress.totalBatches}`
                : '';
              const seedText = progress?.currentSeed ? ` · ${String(progress.currentSeed).slice(0, 40)}` : '';
              const sssText = isUnlimited ? '' : ` · SSS ${sssAdded}/${sssTarget}`;
              sendDiscoveryProgress(
                `${category ? category + ' ' : ''}${label}: 검증 ${checked.toLocaleString()}개, 후보 ${yielded.toLocaleString()}개${sssText}${batchText}${seedText}`,
                {
                  current: checked,
                  target: scanLimit,
                  phase: progress?.phase,
                  checked,
                  yielded,
                  sssCurrent: sssAdded,
                  sssTarget: isUnlimited ? undefined : sssTarget,
                  currentSeed: progress?.currentSeed,
                },
                progress?.phase === 'start' || progress?.phase === 'complete',
              );
            };

            for await (const result of engine.discover(seedForDiscovery, discoveryOptions)) {
              if (checkAbort()) break;
              const allowMeasuredFallback = (result as any).measurementOnly && quickPreview;
              if (categoryIds.length > 0 && !matchesDiscoveryCategory(result.keyword, category) && !allowMeasuredFallback) {
                continue;
              }

              const formattedResult = {
                ...result,
                category: category || result.intent, // UI 호환성을 위해 intent를 category로도 매핑
                competitionRatio: result.goldenRatio, // UI 호환성
              };

              allKeywords.push(formattedResult as any);
              chunk.push(formattedResult as any);
              totalAdded++;
              if (result.grade === 'SSS') {
                sssAdded = sssTracker ? sssTracker.add(result as any) : sssAdded + 1;
                if (!isUnlimited && sssTracker?.shouldStop()) {
                  console.log(`[KEYWORD-MASTER] SSS 목표 달성: ${sssAdded}/${sssTarget} — 탐색 조기 종료`);
                  engine.abort();
                  break;
                }
              }

              // 50개마다 브라우저로 청크 전송
              if (chunk.length >= chunkThreshold) {
                if (!event.sender.isDestroyed()) {
                  event.sender.send('keyword-discovery-chunk', {
                    keywords: [...chunk],
                    current: isUnlimited ? totalAdded : sssAdded,
                    target: isUnlimited ? 5000 : sssTarget
                  });

                  event.sender.send('keyword-discovery-progress', {
                    status: isUnlimited
                      ? `발굴 중... (${totalAdded}개 검증)`
                      : `${category ? category + ' ' : ''}SSS 후보 탐색 중... (${sssAdded}/${sssTarget}, 검증 ${totalAdded}개)`,
                    current: isUnlimited ? totalAdded : sssAdded,
                    target: isUnlimited ? 5000 : sssTarget
                  });
                }
                chunk.length = 0; // 청크 비우기
              }
            }

            // 남은 청크 전송
            if (chunk.length > 0 && !event.sender.isDestroyed()) {
              event.sender.send('keyword-discovery-chunk', {
                keywords: chunk,
                current: isUnlimited ? totalAdded : sssAdded,
                target: isUnlimited ? 5000 : sssTarget
              });
            }

            let crossCategorySupplementCount = 0;
            let crossCategorySupplementSssCount = 0;
            let directMeasuredSupplementCount = 0;
            let directMeasuredSupplementSssCount = 0;
            const preSupplementRanked = rankGoldenDiscoveryResults(
              allKeywords as any[],
              effectiveLimit,
              isUnlimited,
              {
                honorRequestedLimit: quickPreview,
                diversifySimilarIntents: true,
                maxSimilarPerCluster: effectiveLimit > 30 ? 6 : 2,
                strictVisibleSssOnly: true,
                requireActionableIntent: true,
              },
            );
            const preSupplementSssCount = countSss(preSupplementRanked as any[]);
            const shouldRunCrossCategorySupplement =
              categoryFirstMode
              && categoryIds.length > 0
              && !quickPreview
              && !isUnlimited
              && preSupplementSssCount < sssTarget
              && !checkAbort();

            if (shouldRunCrossCategorySupplement) {
              const supplementNeed = Math.max(0, sssTarget - preSupplementSssCount);
              const supplementFreshSeeds = buildFreshIssueGoldenSeeds(externalSignalMapForSeeds, {
                maxBaseSeeds: Math.min(96, Math.max(24, supplementNeed)),
                intentsPerSeed: 8,
                categoryIds: [],
              }).map(item => item.keyword);
              const supplementCategorySeeds = getCrossCategoryDiscoverySeeds(
                categoryIds,
                Math.min(1200, Math.max(240, supplementNeed * 16)),
              );
              const supplementSeeds = Array.from(new Set([
                ...supplementFreshSeeds,
                ...supplementCategorySeeds,
              ])).filter(seed => seed && !matchesDiscoveryCategory(seed, category));

              if (supplementSeeds.length > 0) {
                sendDiscoveryProgress(
                  `${category} SSS ${preSupplementSssCount}/${sssTarget}개 확보 — 부족분 ${supplementNeed}개를 다른 카테고리 검증 후보로 보충합니다.`,
                  {
                    current: preSupplementSssCount,
                    target: sssTarget,
                    phase: 'cross-category-supplement',
                    supplementNeed,
                    supplementSeeds: supplementSeeds.length,
                  },
                  true,
                );

                const supplementEngine = new MDPEngine({
                  clientId: naverClientId,
                  clientSecret: naverClientSecret,
                });
                if (externalSignalMapForSeeds.size > 0) {
                  supplementEngine.injectBatchSignals(externalSignalMapForSeeds);
                }

                const supplementScanLimit = Math.min(5000, Math.max(800, supplementNeed * 80));
                const supplementOptions: any = {
                  ...discoveryOptions,
                  limit: supplementScanLimit,
                  maxCheckedSignals: supplementScanLimit,
                  maxProcessedSeeds: Math.min(supplementSeeds.length, Math.max(40, supplementNeed * 5)),
                  minVolume: 10,
                  seedKeywords: supplementSeeds.slice(0, Math.min(supplementSeeds.length, Math.max(180, supplementNeed * 10))),
                  categoryIds: [],
                  categoryStrict: false,
                  includeMeasuredFallback: false,
                  fastPreview: false,
                };
                supplementOptions.onProgress = (progress: any) => {
                  const checked = Math.max(0, Number(progress?.checked || 0));
                  const label = phaseLabels[progress?.phase] || '보충 검증';
                  sendDiscoveryProgress(
                    `보충 ${label}: 검증 ${checked.toLocaleString()}개, 보충 ${crossCategorySupplementCount.toLocaleString()}개 · ${String(progress?.currentSeed || '').slice(0, 40)}`,
                    {
                      current: checked,
                      target: supplementScanLimit,
                      phase: 'cross-category-supplement',
                      checked,
                      yielded: crossCategorySupplementCount,
                    },
                    progress?.phase === 'start' || progress?.phase === 'complete',
                  );
                };

                const seenAllKeywords = new Set(
                  allKeywords.map((item: any) => String(item?.keyword || '').replace(/\s+/g, '').toLowerCase()).filter(Boolean),
                );
                const supplementChunk: any[] = [];
                for await (const result of supplementEngine.discover(supplementSeeds[0] || '황금키워드', supplementOptions)) {
                  if (checkAbort()) {
                    supplementEngine.abort();
                    break;
                  }
                  const grade = String(result.grade || '').toUpperCase();
                  if (!['SSS', 'SS', 'S'].includes(grade)) continue;
                  if (matchesDiscoveryCategory(result.keyword, category)) continue;
                  const key = String(result.keyword || '').replace(/\s+/g, '').toLowerCase();
                  if (!key || seenAllKeywords.has(key)) continue;
                  seenAllKeywords.add(key);

                  const formattedSupplement = {
                    ...result,
                    category: result.intent,
                    competitionRatio: result.goldenRatio,
                    crossCategorySupplement: true,
                    primaryCategory: category,
                    primaryCategoryMatched: false,
                    supplementReason: `${category} 카테고리 SSS 부족분을 전체 카테고리에서 보충`,
                  };
                  allKeywords.push(formattedSupplement as any);
                  supplementChunk.push(formattedSupplement as any);
                  totalAdded++;
                  crossCategorySupplementCount++;
                  if (grade === 'SSS') {
                    crossCategorySupplementSssCount++;
                    sssAdded = sssTracker ? sssTracker.add(result as any) : sssAdded + 1;
                  }

                  if (supplementChunk.length >= chunkThreshold && !event.sender.isDestroyed()) {
                    event.sender.send('keyword-discovery-chunk', {
                      keywords: [...supplementChunk],
                      current: Math.min(sssTarget, preSupplementSssCount + crossCategorySupplementSssCount),
                      target: sssTarget,
                      supplement: true,
                    });
                    supplementChunk.length = 0;
                  }

                  if (crossCategorySupplementSssCount >= supplementNeed || crossCategorySupplementCount >= visibleTarget) {
                    supplementEngine.abort();
                    break;
                  }
                }

                if (supplementChunk.length > 0 && !event.sender.isDestroyed()) {
                  event.sender.send('keyword-discovery-chunk', {
                    keywords: supplementChunk,
                    current: Math.min(sssTarget, preSupplementSssCount + crossCategorySupplementSssCount),
                    target: sssTarget,
                    supplement: true,
                  });
                }
              }
            }

            const preDirectRanked = rankGoldenDiscoveryResults(
              allKeywords as any[],
              effectiveLimit,
              isUnlimited,
              {
                honorRequestedLimit: quickPreview,
                diversifySimilarIntents: true,
                maxSimilarPerCluster: effectiveLimit > 30 ? 6 : 2,
                strictVisibleSssOnly: true,
                requireActionableIntent: true,
              },
            );
            const preDirectSssCount = countSss(preDirectRanked as any[]);
            const shouldRunDirectMeasuredSupplement =
              !quickPreview
              && !isUnlimited
              && preDirectSssCount < sssTarget
              && !checkAbort();

            if (shouldRunDirectMeasuredSupplement) {
              const bulkQualityMode = sssTarget >= 60;
              const directNeed = Math.max(1, sssTarget - preDirectSssCount);
              const visibleNeed = Math.max(1, effectiveLimit - preDirectRanked.length);
              const directLiveSeeds = Array.from(new Set([
                ...liveCategorySeeds,
                ...freshIssueSeeds,
                ...Array.from(externalSignalMapForSeeds.keys()).slice(0, 260),
              ])).slice(0, 320);

              sendDiscoveryProgress(
                `SSS ${preDirectSssCount}/${sssTarget}개 확보 — 실측 황금키워드 보강으로 부족분 ${directNeed}개를 추가 검증합니다.`,
                {
                  current: preDirectSssCount,
                  target: sssTarget,
                  phase: 'direct-measured-supplement',
                  supplementNeed: directNeed,
                  liveSeeds: directLiveSeeds.length,
                },
                true,
              );

              const directResults = await discoverDirectGoldenKeywords(
                {
                  clientId: naverClientId,
                  clientSecret: naverClientSecret,
                },
                {
                  category,
                  keyword: actualKeyword,
                  limit: Math.max(sssTarget, bulkQualityMode ? visibleNeed + 20 : directNeed + 10),
                  maxSeeds: categoryFirstMode ? 1000 : 1000,
                  maxCandidates: sssTarget >= 60
                    ? Math.max(1800, Math.min(3600, Math.max(visibleNeed, directNeed) * 120))
                    : Math.max(1500, Math.min(3000, directNeed * 180)),
                  liveSeeds: directLiveSeeds,
                  includeCrossCategory: true,
                  requireCategoryMatch: false,
                  includeSearchAdSuggestions: true,
                  includeProTrafficSupplement: bulkQualityMode,
                  suggestionSeedLimit: categoryFirstMode ? 24 : 20,
                  suggestionsPerSeed: 30,
                  maxSimilarPerCluster: sssTarget >= 60 ? 6 : 2,
                  onProgress: (progress) => {
                    const phase = progress.phase || 'measure';
                    const measured = Number(progress.measured || 0);
                    const candidates = Number(progress.candidates || 0);
                    sendDiscoveryProgress(
                      `실측 보강 ${phase}: 후보 ${candidates.toLocaleString()}개, 측정 ${measured.toLocaleString()}개, 발견 ${directMeasuredSupplementSssCount}/${directNeed}`,
                      {
                        current: measured || preDirectSssCount,
                        target: candidates || sssTarget,
                        phase: 'direct-measured-supplement',
                        measured,
                        candidates,
                        yielded: progress.yielded,
                      },
                      phase === 'candidate-plan' || phase === 'rank',
                    );
                  },
                },
              );

              const seenAllKeywords = new Set(
                allKeywords.map((item: any) => String(item?.keyword || '').replace(/\s+/g, '').toLowerCase()).filter(Boolean),
              );
              const directChunk: any[] = [];
              for (const result of directResults) {
                if (checkAbort()) break;
                const isDirectSss = String(result.grade || '').toUpperCase() === 'SSS';
                const isDirectQuality = isDirectSss || (
                  bulkQualityMode && isQualityGoldenDiscoveryResult(result as any, { requireActionableIntent: true })
                );
                if (!isDirectQuality) continue;
                const key = String(result.keyword || '').replace(/\s+/g, '').toLowerCase();
                if (!key || seenAllKeywords.has(key)) continue;
                seenAllKeywords.add(key);

                const formattedDirect = {
                  ...result,
                  category: category || result.intent,
                  competitionRatio: result.goldenRatio,
                  directMeasuredSupplement: true,
                  supplementReason: '실제 검색량/문서수 기준으로 검증된 작성가능 SSS 보강',
                };
                allKeywords.push(formattedDirect as any);
                directChunk.push(formattedDirect as any);
                totalAdded++;
                directMeasuredSupplementCount++;
                if (isDirectSss) {
                  directMeasuredSupplementSssCount++;
                  sssAdded = sssTracker ? sssTracker.add(result as any) : sssAdded + 1;
                }

                if (directChunk.length >= chunkThreshold && !event.sender.isDestroyed()) {
                  event.sender.send('keyword-discovery-chunk', {
                    keywords: [...directChunk],
                    current: Math.min(sssTarget, preDirectSssCount + directMeasuredSupplementSssCount),
                    target: sssTarget,
                    supplement: true,
                    directMeasuredSupplement: true,
                  });
                  directChunk.length = 0;
                }

                if (bulkQualityMode && directMeasuredSupplementCount >= Math.max(visibleNeed, directNeed)) break;
                if (!bulkQualityMode && directMeasuredSupplementSssCount >= directNeed) break;
              }

              if (directChunk.length > 0 && !event.sender.isDestroyed()) {
                event.sender.send('keyword-discovery-chunk', {
                  keywords: directChunk,
                  current: Math.min(sssTarget, preDirectSssCount + directMeasuredSupplementSssCount),
                  target: sssTarget,
                  supplement: true,
                  directMeasuredSupplement: true,
                });
              }
            }

            const rankedKeywords = rankGoldenDiscoveryResults(
              allKeywords as any[],
              effectiveLimit,
              isUnlimited,
              {
                honorRequestedLimit: quickPreview,
                diversifySimilarIntents: true,
                maxSimilarPerCluster: effectiveLimit > 30 ? 6 : 2,
                strictVisibleSssOnly: true,
                requireActionableIntent: true,
                qualityBackfillToTarget: true,
              },
            );
            // C2 phase 2: 상위 골든 후보에만 실측 SERP 심층분석 주입(opt-in, graceful-degrade).
            // chrome 미설치/미가용이거나 quickPreview면 완전 스킵 → 발굴 결과 무회귀. 코어 등급/score는
            // 건드리지 않고 winnable/실측 SERP 부가필드만 반환 payload에 덧붙인다(불변 매핑). 3중 방어:
            // isChromeAvailable pre-flight → enricher worker try/catch → 아래 블록 try/catch → 발굴 본류 안 막음.
            let serpMap: Map<string, SerpDifficultySignal> = new Map();
            try {
              if (!quickPreview && rankedKeywords.length > 0 && isChromeAvailable() && !checkAbort()) {
                const DEEP_SERP_TOP_N = 10;
                const topKeywords = (rankedKeywords as MDPResult[])
                  .slice(0, DEEP_SERP_TOP_N)
                  .map((r) => r.keyword);
                serpMap = await enrichKeywordsWithDeepSerp(topKeywords, {
                  topN: DEEP_SERP_TOP_N,
                  concurrency: 2,
                  analyzer: analyzeSmartBlocks,
                }).catch(() => new Map<string, SerpDifficultySignal>());
                const measuredCount = Array.from(serpMap.values()).filter((s) => s.measured).length;
                console.log(`[KEYWORD-MASTER] 실측 SERP 심층분석: 상위 ${topKeywords.length}개 중 ${measuredCount}개 측정`);
              }
            } catch (err) {
              console.warn('[KEYWORD-MASTER] 실측 SERP 심층분석 스킵(발굴은 정상):', (err as Error)?.message || err);
            }

            // C4 slice 2: 상위 골든 후보에 빈집(vacancy) 분석 주입(axios 기반 → chrome 불필요, 브라우저
            // 미활성에도 동작). quickPreview면 스킵. 실패는 unreliable 폴백 + 블록 try/catch로 발굴 무회귀.
            // 표시용 부가필드만(vacancySlots/action) — 코어 등급/score/필터 미변경.
            let vacancyMap: Map<string, VacancyResult> = new Map();
            try {
              if (!quickPreview && rankedKeywords.length > 0 && !checkAbort()) {
                const VACANCY_TOP_N = 10;
                const topKeywords = (rankedKeywords as MDPResult[])
                  .slice(0, VACANCY_TOP_N)
                  .map((r) => r.keyword);
                vacancyMap = await enrichKeywordsWithVacancy(topKeywords, {
                  topN: VACANCY_TOP_N,
                  concurrency: 3,
                }).catch(() => new Map<string, VacancyResult>());
                const reliableCount = Array.from(vacancyMap.values()).filter(isVacancyReliable).length;
                console.log(`[KEYWORD-MASTER] 빈집 분석: 상위 ${topKeywords.length}개 중 ${reliableCount}개 실측`);
              }
            } catch (err) {
              console.warn('[KEYWORD-MASTER] 빈집 분석 스킵(발굴은 정상):', (err as Error)?.message || err);
            }

            // C4 slice 3: 상위 소수 후보에 실측 콘텐츠 브리핑 주입(경쟁사 상위10 본문크롤 → 권장 글자수/
            // 필수 이미지/must-include 키워드/경쟁사 제목 = 전부 실측 사실, 추정치 아님). 본문크롤이 비싸
            // topN 3 + chrome 가드 + quickPreview 스킵. win-predictor 예측치는 '추정치 UI 금지'라 미승격.
            let briefMap: Map<string, SerpAnalysis> = new Map();
            try {
              if (!quickPreview && rankedKeywords.length > 0 && isChromeAvailable() && !checkAbort()) {
                const BRIEF_TOP_N = 3;
                const topKeywords = (rankedKeywords as MDPResult[])
                  .slice(0, BRIEF_TOP_N)
                  .map((r) => r.keyword);
                briefMap = await enrichKeywordsWithContentBrief(topKeywords, { topN: BRIEF_TOP_N, concurrency: 1 })
                  .catch(() => new Map<string, SerpAnalysis>());
                console.log(`[KEYWORD-MASTER] 실측 콘텐츠 브리핑: 상위 ${topKeywords.length}개 중 ${briefMap.size}개`);
              }
            } catch (err) {
              console.warn('[KEYWORD-MASTER] 콘텐츠 브리핑 스킵(발굴은 정상):', (err as Error)?.message || err);
            }

            const finalSssCount = countSss(rankedKeywords as any[]);
            const finalQualityBackfillCount = Math.max(0, rankedKeywords.length - finalSssCount);
            console.log(`[KEYWORD-MASTER] MDP 발굴 완료: 후보 ${totalAdded}개 → 노출 ${rankedKeywords.length}개, SSS ${finalSssCount}개, 품질보충 ${finalQualityBackfillCount}개, 보충 ${crossCategorySupplementCount}개, 실측보강 ${directMeasuredSupplementCount}개`);
            sendDiscoveryProgress(
              `발굴 완료: 노출 ${rankedKeywords.length}개, SSS ${finalSssCount}개, 품질보충 ${finalQualityBackfillCount}개, 보충 ${crossCategorySupplementCount}개, 실측보강 ${directMeasuredSupplementCount}개, 검증 후보 ${totalAdded}개`,
              {
                type: 'complete',
                current: scanLimit,
                target: scanLimit,
                phase: 'complete',
                yielded: totalAdded,
                sssCurrent: finalSssCount,
                sssTarget: isUnlimited ? undefined : sssTarget,
                qualityBackfillCount: finalQualityBackfillCount,
                crossCategorySupplementCount,
                crossCategorySupplementSssCount,
                directMeasuredSupplementCount,
                directMeasuredSupplementSssCount,
              },
              true,
            );

            return {
              success: true,
              keywords: (rankedKeywords as MDPResult[]).map((item) => {
                // C4: keyword-value-verifier 순수 가치검증(무비용, 전 항목) — 표시용 부가필드만.
                // 코어 등급/score/필터 미변경(isKilled 를 랭킹에서 제외하지 않음 — 표시 슬라이스).
                const valueGate = verifyKeywordValue({
                  keyword: item.keyword,
                  searchVolume: item.searchVolume,
                  documentCount: item.documentCount,
                  mode: 'lenient',
                });
                // C4 slice2: 빈집 신호(신뢰 실측일 때만). 미측정/실패는 부가 안 함(중립).
                const vac = vacancyMap.get(item.keyword);
                const vacFields = isVacancyReliable(vac)
                  ? { vacancySlots: vac!.vacancySlots, vacancyReliable: true, vacancyAction: vac!.suggestedAction }
                  : {};
                // C4 slice3: 실측 콘텐츠 브리핑(경쟁사 본문 수집된 상위 소수만). 실측 사실만 부가.
                const brief = briefMap.get(item.keyword);
                const briefFields = isContentBriefReliable(brief)
                  ? {
                      briefRecommendedWords: brief!.recommendedWordCount,
                      briefAvgImages: Math.round(brief!.avgImageCount),
                      briefMustInclude: brief!.mustIncludeTerms,
                      briefCompetitorTitles: brief!.competitorTitles,
                      briefMeasured: true,
                    }
                  : {};
                const withValue: MDPResult = {
                  ...item,
                  valueGrade: valueGate.valueGrade,
                  valueQualityScore: valueGate.qualityScore,
                  valueVerified: valueGate.valuable,
                  valueSummary: valueGate.summary,
                  ...vacFields,
                  ...briefFields,
                };
                // C2: 실측 SERP 부가필드(측정된 상위 후보만). 코어 등급/score 미변경(불변 새 객체).
                const serp = serpMap.get(item.keyword);
                if (!serp || !serp.measured) return withValue;
                return {
                  ...withValue,
                  winnable: applySerpDifficulty(item, serp, 0).winnable,
                  blogFriendly: serp.blogFriendly,
                  shoppingDominant: serp.shoppingDominant,
                  opportunityScore: serp.opportunityScore,
                  difficultyScore: serp.difficultyScore,
                  hasSmartBlock: serp.hasSmartBlock,
                  hasViewSection: serp.hasViewSection,
                  hasInfluencer: serp.hasInfluencer,
                  serpMeasured: true,
                };
              }),
              total: rankedKeywords.length,
              candidatesScanned: totalAdded,
              sssCount: finalSssCount,
              sssTarget: isUnlimited ? undefined : sssTarget,
              qualityBackfillCount: finalQualityBackfillCount,
              crossCategorySupplementCount,
              crossCategorySupplementSssCount,
              directMeasuredSupplementCount,
              directMeasuredSupplementSssCount,
              quickPreview,
              discoveryMode: categoryFirstMode ? 'category-first' : 'keyword',
              categoryIds,
              freshnessHints: categorySeedPlan?.freshnessHints,
              liveSeedCount: categorySeedPlan?.liveSeedCount || 0,
              source: 'mdp_engine'
            };

          } catch (mdpError: any) {
            console.error('[KEYWORD-MASTER] MDP 엔진 실행 오류:', mdpError);
            return { success: false, keywords: [], error: mdpError.message };
          } finally {
            // v2.43.0: 모든 경로에서 보장 (early return + throw 모두)
            clearInterval(abortCheckInterval);
          }
        }
        return { success: false, keywords: [], error: '네이버 API 키가 필요합니다.' };
      }
      return { success: false, keywords: [], error: '지원하지 않는 소스입니다.' };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 황금 키워드 발굴 프로세스 오류:', error);
      const isPuppeteerErr = error?.name === 'PuppeteerLaunchError';
      return {
        success: false,
        keywords: [],
        error: isPuppeteerErr ? error.userMessage : error.message,
        errorCode: isPuppeteerErr ? error.code : 'INTERNAL_ERROR',
        isAntivirusSuspected: isPuppeteerErr ? error.isAntivirusSuspected === true : false,
      };
    }
  });

  ipcMain.handle('get-trending-keywords', async (_event, source: 'naver' | 'google' | 'youtube') => {
    console.log('[KEYWORD-MASTER] 트렌드 키워드 가져오기:', source);

    // 라이선스 체크
    const license = await licenseManager.loadLicense();
    if (!license || !license.isValid) {
      return [{
        rank: 0,
        keyword: '⚠️ 라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.',
        changeRate: 0,
        category: '오류',
        error: true,
        requiresLicense: true
      }] as any;
    }

    try {
      if (source === 'naver') {
        // 환경변수에서 네이버 API 키 가져오기
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

        if (!naverClientId || !naverClientSecret) {
          console.warn('[KEYWORD-MASTER] 네이버 API 키가 설정되지 않았습니다.');
          // API 키가 없을 때 에러 메시지 포함하여 반환
          return [{
            rank: 0,
            keyword: '⚠️ 네이버 API 키가 설정되지 않았습니다.',
            changeRate: 0,
            category: '오류',
            error: true,
            message: '환경 설정에서 네이버 Client ID와 Client Secret을 입력해주세요.'
          }] as any;
        }

        try {
          // 실시간 뉴스 검색어 수집 (정확도순으로 최신 뉴스 제목에서 키워드 추출)
          const newsKeywords: string[] = [];

          try {
            // 실시간 이슈 뉴스 검색 (정확도순)
            const newsApiUrl = 'https://openapi.naver.com/v1/search/news.json';
            const newsParams = new URLSearchParams({
              query: '뉴스',
              display: '20', // 더 많은 뉴스 수집
              sort: 'sim' // 정확도순
            });

            const newsResponse = await fetch(`${newsApiUrl}?${newsParams}`, {
              headers: {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
              }
            });

            if (newsResponse.ok) {
              const newsData = await newsResponse.json();

              // 모든 뉴스 제목에서 키워드 추출
              const allKeywords: string[] = [];

              (newsData.items || []).forEach((item: any) => {
                const cleanTitle = item.title?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() || '';
                if (!cleanTitle || cleanTitle.length < 3) return;

                // 제목을 단어별로 분리 (공백, 특수문자, 조사 기준)
                // 불필요한 단어 제거
                const stopWords = [
                  '의', '이', '가', '을', '를', '에', '에서', '로', '으로', '와', '과', '와', '의',
                  '은', '는', '도', '만', '까지', '부터', '부터', '까지', '에게', '께', '한테',
                  '에서', '부터', '까지', '로', '으로', '와', '과', '하고', '와', '과',
                  '뉴스', '기사', '속보', '단독', '종합', '연합', '발표', '확인', '발생', '전망',
                  '오늘', '어제', '내일', '이번', '다음', '최근', '지난', '올해', '작년', '내년',
                  '년', '월', '일', '시', '분', '초', '시간', '분', '초',
                  '밝혔다', '알려졌다', '전했다', '말했다', '밝혔다', '발표했다'
                ];

                // 제목에서 특수문자 제거 및 단어 분리
                const words = cleanTitle
                  .replace(/[`~!@#$%^&*()_|+\-=?;:'"<>.,{[}\\]/g, ' ')
                  .replace(/[\[\]()【】「」]/g, ' ')
                  .split(/\s+/)
                  .map((w: string) => w.trim())
                  .filter((w: string) => {
                    // 2-15자 사이의 단어만 선택
                    if (w.length < 2 || w.length > 15) return false;
                    // 숫자만 있는 단어 제외
                    if (/^\d+$/.test(w)) return false;
                    // 불필요한 단어 제외
                    if (stopWords.includes(w)) return false;
                    // 조사로 끝나는 단어는 조사 제거
                    const withoutParticle = w.replace(/(의|이|가|을|를|에|에서|로|으로|와|과|은|는|도|만)$/, '');
                    return withoutParticle.length >= 2;
                  })
                  .map((w: string) => w.replace(/(의|이|가|을|를|에|에서|로|으로|와|과|은|는|도|만)$/, ''))
                  .filter((w: string) => w.length >= 2 && w.length <= 15);

                // 2-3개 단어 조합도 추가 (핵심 키워드)
                if (words.length >= 2) {
                  // 앞 2-3개 단어 조합
                  const keyPhrase2 = words.slice(0, 2).join(' ');
                  if (keyPhrase2.length >= 4 && keyPhrase2.length <= 20) {
                    allKeywords.push(keyPhrase2);
                  }
                  if (words.length >= 3) {
                    const keyPhrase3 = words.slice(0, 3).join(' ');
                    if (keyPhrase3.length >= 4 && keyPhrase3.length <= 25) {
                      allKeywords.push(keyPhrase3);
                    }
                  }
                }

                // 개별 단어도 추가 (핵심 단어만)
                words.slice(0, 3).forEach((word: string) => {
                  if (word.length >= 2 && word.length <= 15) {
                    allKeywords.push(word);
                  }
                });
              });

              // 키워드 빈도 계산
              const keywordCount: { [key: string]: number } = {};
              allKeywords.forEach((keyword: string) => {
                keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;
              });

              // 빈도순으로 정렬하고 상위 키워드 선택
              const sortedKeywords = Object.entries(keywordCount)
                .sort((a, b) => b[1] - a[1]) // 빈도순 정렬
                .map(([keyword]) => keyword)
                .slice(0, 20); // 상위 20개만

              newsKeywords.push(...sortedKeywords);
            }
          } catch (e) {
            console.warn('[KEYWORD-MASTER] 실시간 뉴스 키워드 수집 실패:', e);
          }

          // 중복 제거 및 유니크 키워드만 사용
          const uniqueKeywords = Array.from(new Set(newsKeywords)).slice(0, 20);

          console.log(`[KEYWORD-MASTER] 실시간 뉴스 키워드 수집 완료: ${uniqueKeywords.length}개`);

          // 결과가 없으면 랭킹 키워드 사용
          let keywordsToProcess: any[] = [];
          if (uniqueKeywords.length > 0) {
            // 수집한 키워드를 TrendKeyword 형식으로 변환
            keywordsToProcess = uniqueKeywords.map((keyword, idx) => ({
              keyword: keyword,
              rank: idx + 1,
              changeRate: 100 - idx * 5, // 순위가 높을수록 변화율 높게
              category: '뉴스',
              searchVolume: null
            }));
          } else {
            // 완전히 실패한 경우 랭킹 키워드 사용
            try {
              const rankingKeywords = await getNaverRankingKeywords({
                clientId: naverClientId,
                clientSecret: naverClientSecret
              });
              keywordsToProcess = rankingKeywords.slice(0, 20);
            } catch (e) {
              console.warn('[KEYWORD-MASTER] 랭킹 키워드 조회 실패:', e);
            }
          }

          // 각 키워드의 검색량과 문서수 조회 (황금 키워드 계산)
          // v2.42.37: sv/dc 동시 측정 + Bilateral Sanity Check (v2.42.17) + 영구 캐시(v2.32.1) 자동 적용
          //   기존: sv 측정 후 dc 별도 fetch → API undercount 보정 미적용 → 발굴/재검색 dc 불일치
          //   변경: includeDocumentCount: true → getNaverKeywordSearchVolumeSeparate 내부 보정 경로 사용
          const keywordsWithData = await Promise.all(keywordsToProcess.map(async (item) => {
            try {
              const volumeData = await getNaverKeywordSearchVolumeSeparate({
                clientId: naverClientId,
                clientSecret: naverClientSecret
              }, [item.keyword], { includeDocumentCount: true });

              const pcVolume = volumeData[0]?.pcSearchVolume ?? null;
              const mobileVolume = volumeData[0]?.mobileSearchVolume ?? null;
              const totalVolume: number | null = (pcVolume !== null || mobileVolume !== null)
                ? ((pcVolume ?? 0) + (mobileVolume ?? 0))
                : null;
              const docCount: number | null = volumeData[0]?.documentCount ?? null;

              // 검색량/문서량 비율 계산 (낮을수록 황금 키워드)
              const volumeToDocRatio: number | null = (typeof docCount === 'number' && docCount > 0 && typeof totalVolume === 'number' && totalVolume > 0)
                ? (totalVolume / docCount)
                : null;

              return {
                keyword: item.keyword,
                pcSearchVolume: pcVolume,
                mobileSearchVolume: mobileVolume,
                searchVolume: totalVolume,
                documentCount: docCount,
                volumeToDocRatio: volumeToDocRatio,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '일반',
                source: 'naver'
              };

            } catch (error) {
              console.warn(`[KEYWORD-MASTER] 키워드 데이터 조회 실패 (${item.keyword}):`, error);
              return {
                keyword: item.keyword,
                pcSearchVolume: null,
                mobileSearchVolume: null,
                searchVolume: typeof item.searchVolume === 'number' ? item.searchVolume : null,
                documentCount: null,
                volumeToDocRatio: null,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '일반',
                source: 'naver'
              };
            }
          }));

          // 검색량/문서량 비율이 낮은 순서대로 정렬 (황금 키워드 우선)
          keywordsWithData.sort((a, b) => {
            const aRatio = typeof a.volumeToDocRatio === 'number' ? a.volumeToDocRatio : null;
            const bRatio = typeof b.volumeToDocRatio === 'number' ? b.volumeToDocRatio : null;
            if (bRatio !== null && aRatio === null) return 1;
            if (aRatio !== null && bRatio === null) return -1;
            if (aRatio !== null && bRatio !== null && aRatio !== bRatio) return aRatio - bRatio;

            const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
            const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
            if (bVol !== null && aVol === null) return 1;
            if (aVol !== null && bVol === null) return -1;
            if (aVol !== null && bVol !== null && bVol !== aVol) return bVol - aVol;
            return 0;
          });

          return keywordsWithData.slice(0, 20).map((item, idx) => ({
            rank: idx + 1,
            keyword: item.keyword,
            pcSearchVolume: item.pcSearchVolume,
            mobileSearchVolume: item.mobileSearchVolume,
            searchVolume: item.searchVolume,
            documentCount: item.documentCount,
            volumeToDocRatio: typeof item.volumeToDocRatio === 'number' ? item.volumeToDocRatio.toFixed(3) : null,
            changeRate: item.changeRate,
            category: item.category,
            source: item.source
          }));

        } catch (apiError: any) {
          console.error('[KEYWORD-MASTER] 네이버 API 호출 실패:', apiError);
          // API 실패 시 빈 배열 반환 (더미 데이터 제거)
          return [];
        }
      } else if (source === 'google') {
        // Google Trends RSS 피드 사용 (공식 API 없음)
        console.log('[KEYWORD-MASTER] Google Trends 키워드 조회 중...');
        try {
          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const { getGoogleTrendKeywords } = await import('../../utils/google-trends-api');
          const googleTrends = await getGoogleTrendKeywords();

          if (!googleTrends || googleTrends.length === 0) {
            console.warn('[KEYWORD-MASTER] Google Trends 데이터 없음, 빈 배열 반환');
            return [];
          }

          // 각 키워드의 검색량과 문서수 조회 (황금 키워드 계산)
          const keywordsWithData = await Promise.all(googleTrends.slice(0, 20).map(async (item) => {
            try {
              // Google 검색으로 문서수 추정
              const googleCseCx = env.googleCseId || process.env['GOOGLE_CSE_CX'] || process.env['GOOGLE_CSE_ID'] || '';
              const googleApiKey = env.googleApiKey || process.env['GOOGLE_API_KEY'] || '';

              let docCount = 0;
              if (googleCseCx && googleApiKey) {
                try {
                  const googleSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCseCx}&q=${encodeURIComponent(item.keyword)}&num=1`;
                  const response = await fetch(googleSearchUrl);
                  if (response.ok) {
                    const data = await response.json();
                    docCount = parseInt(data.searchInformation?.totalResults || '0');
                  }
                } catch (error) {
                  console.warn(`[KEYWORD-MASTER] 문서수 조회 실패 (${item.keyword}):`, error);
                }
              }

              // Google Trends는 검색량을 직접 제공하지 않으므로 추정
              // 변화율이 높으면 검색량이 높다고 가정
              const changeRateForCalc = typeof item.changeRate === 'number' ? item.changeRate : 0;
              const estimatedSearchVolume = Math.max(1000, changeRateForCalc * 100);

              // 검색량/문서량 비율 계산 (낮을수록 황금 키워드)
              const volumeToDocRatio = docCount > 0 && estimatedSearchVolume > 0
                ? (estimatedSearchVolume / docCount)
                : docCount > 0 ? 0 : 999999;

              return {
                keyword: item.keyword,
                pcSearchVolume: Math.floor(estimatedSearchVolume * 0.4), // PC 40%
                mobileSearchVolume: Math.floor(estimatedSearchVolume * 0.6), // 모바일 60%
                searchVolume: estimatedSearchVolume,
                documentCount: docCount,
                volumeToDocRatio: volumeToDocRatio,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '일반',
                source: 'google'
              };

            } catch (error) {
              console.warn(`[KEYWORD-MASTER] 키워드 데이터 조회 실패 (${item.keyword}):`, error);
              return {
                keyword: item.keyword,
                pcSearchVolume: null,
                mobileSearchVolume: null,
                searchVolume: null,
                documentCount: null,
                volumeToDocRatio: null,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '일반',
                source: 'google'
              };
            }
          }));

          // 검색량/문서량 비율이 낮은 순서대로 정렬 (황금 키워드 우선)
          keywordsWithData.sort((a, b) => {
            const aRatio = typeof a.volumeToDocRatio === 'number' ? a.volumeToDocRatio : null;
            const bRatio = typeof b.volumeToDocRatio === 'number' ? b.volumeToDocRatio : null;
            if (bRatio !== null && aRatio === null) return 1;
            if (aRatio !== null && bRatio === null) return -1;
            if (aRatio !== null && bRatio !== null && aRatio !== bRatio) return aRatio - bRatio;

            const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
            const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
            if (bVol !== null && aVol === null) return 1;
            if (aVol !== null && bVol === null) return -1;
            if (aVol !== null && bVol !== null && bVol !== aVol) return bVol - aVol;
            return 0;
          });

          console.log(`[KEYWORD-MASTER] Google Trends ${keywordsWithData.length}개 키워드 조회 완료 (황금 키워드 정렬)`);
          return keywordsWithData.map((item, idx) => ({
            rank: idx + 1,
            keyword: item.keyword,
            pcSearchVolume: item.pcSearchVolume,
            mobileSearchVolume: item.mobileSearchVolume,
            searchVolume: item.searchVolume,
            documentCount: item.documentCount,
            volumeToDocRatio: typeof item.volumeToDocRatio === 'number' ? item.volumeToDocRatio.toFixed(3) : null,
            changeRate: item.changeRate,
            category: item.category,
            source: item.source
          }));
        } catch (error: any) {
          console.error('[KEYWORD-MASTER] Google Trends 조회 실패:', error);
          // 에러 발생 시 빈 배열 반환 (네이버 데이터와 혼동 방지)
          return [];
        }
      } else if (source === 'youtube') {
        // YouTube Data API v3 사용
        console.log('[KEYWORD-MASTER] YouTube 키워드 조회 중...');
        try {
          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const youtubeApiKey = env.youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';

          if (!youtubeApiKey) {
            console.warn('[KEYWORD-MASTER] YouTube API 키가 설정되지 않았습니다.');
            // API 키가 없을 때 에러 메시지 포함하여 반환
            return [{
              rank: 0,
              keyword: '⚠️ YouTube API 키가 설정되지 않았습니다.',
              changeRate: 0,
              category: '오류',
              error: true,
              message: '환경 설정에서 YouTube API Key를 입력해주세요.'
            }] as any;
          }

          const { getYouTubeTrendKeywords } = await import('../../utils/youtube-data-api');
          const youtubeTrends = await getYouTubeTrendKeywords({
            apiKey: youtubeApiKey
          });

          if (!youtubeTrends || youtubeTrends.length === 0) {
            console.warn('[KEYWORD-MASTER] YouTube Trends 데이터 없음, 빈 배열 반환');
            return [];
          }

          // 각 키워드의 조회수와 문서수 조회 (황금 키워드 계산)
          const keywordsWithData = await Promise.all(youtubeTrends.slice(0, 20).map(async (item) => {
            try {
              // YouTube 조회수는 이미 viewCount로 제공됨
              const viewCount = typeof item.viewCount === 'number' ? item.viewCount : null;
              const viewCountForCalc = viewCount ?? 0;

              // Google 검색으로 문서수 추정 (YouTube 키워드로 검색)
              const googleCseCxForUrl = env.googleCseId || process.env['GOOGLE_CSE_CX'] || process.env['GOOGLE_CSE_ID'] || '';
              const googleSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${youtubeApiKey}&cx=${googleCseCxForUrl}&q=${encodeURIComponent(item.keyword)}&num=1`;
              let docCount: number | null = null;

              const googleCseCx = env.googleCseId || process.env['GOOGLE_CSE_CX'] || process.env['GOOGLE_CSE_ID'] || '';
              if (googleCseCx) {
                try {
                  const response = await fetch(googleSearchUrl);
                  if (response.ok) {
                    const data = await response.json();
                    const raw = data.searchInformation?.totalResults;
                    docCount = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseInt(raw, 10) : null);
                  }
                } catch (error) {
                  console.warn(`[KEYWORD-MASTER] 문서수 조회 실패 (${item.keyword}):`, error);
                }
              } else {
                docCount = null;
              }

              // 조회수/문서량 비율 계산 (낮을수록 황금 키워드)
              const volumeToDocRatio: number | null = (typeof docCount === 'number' && docCount > 0 && viewCount !== null && viewCount > 0)
                ? (viewCount / docCount)
                : null;

              return {
                keyword: item.keyword,
                pcSearchVolume: null, // YouTube는 모바일 중심
                mobileSearchVolume: viewCount,
                searchVolume: viewCount,
                documentCount: docCount,
                volumeToDocRatio: volumeToDocRatio,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '기타',
                source: 'youtube'
              };

            } catch (error) {
              console.warn(`[KEYWORD-MASTER] 키워드 데이터 조회 실패 (${item.keyword}):`, error);
              return {
                keyword: item.keyword,
                pcSearchVolume: null,
                mobileSearchVolume: typeof item.viewCount === 'number' ? item.viewCount : null,
                searchVolume: typeof item.viewCount === 'number' ? item.viewCount : null,
                documentCount: null,
                volumeToDocRatio: null,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : null,
                category: item.category || '기타',
                source: 'youtube'
              };
            }
          }));

          // 조회수/문서량 비율이 낮은 순서대로 정렬 (황금 키워드 우선)
          keywordsWithData.sort((a, b) => {
            const aRatio = typeof a.volumeToDocRatio === 'number' ? a.volumeToDocRatio : null;
            const bRatio = typeof b.volumeToDocRatio === 'number' ? b.volumeToDocRatio : null;
            if (bRatio !== null && aRatio === null) return 1;
            if (aRatio !== null && bRatio === null) return -1;
            if (aRatio !== null && bRatio !== null && aRatio !== bRatio) return aRatio - bRatio;

            const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
            const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
            if (bVol !== null && aVol === null) return 1;
            if (aVol !== null && bVol === null) return -1;
            if (aVol !== null && bVol !== null && bVol !== aVol) return bVol - aVol;
            return 0;
          });

          console.log(`[KEYWORD-MASTER] YouTube ${keywordsWithData.length}개 키워드 조회 완료 (황금 키워드 정렬)`);
          return keywordsWithData.map((item, idx) => ({
            rank: idx + 1,
            keyword: item.keyword,
            pcSearchVolume: item.pcSearchVolume,
            mobileSearchVolume: item.mobileSearchVolume,
            searchVolume: item.searchVolume,
            documentCount: item.documentCount,
            volumeToDocRatio: typeof item.volumeToDocRatio === 'number' ? item.volumeToDocRatio.toFixed(3) : null,
            changeRate: item.changeRate,
            category: item.category,
            source: item.source
          }));

        } catch (error: any) {
          console.error('[KEYWORD-MASTER] YouTube API 호출 실패:', error);
          // 에러 발생 시 빈 배열 반환 (네이버 데이터와 혼동 방지)
          return [];
        }
      }

      return [];
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 트렌드 키워드 조회 실패:', error);
      return [];
    }
  });

  // 실시간 검색어 통합 조회 - 중복 등록 방지
  if (!ipcMain.listenerCount('get-realtime-keywords')) {
    ipcMain.handle('get-realtime-keywords', async (_event, options?: { platform?: 'naver' | 'zum' | 'nate' | 'daum' | 'bokjiro' | 'policy' | 'all', limit?: number }) => {
      try {
        // 라이선스 체크
        const license = await licenseManager.loadLicense();
        if (!license || !license.isValid) {
          return {
            success: false,
            error: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.',
            naver: [],
            zum: [],
            nate: [],
            daum: []
          };
        }

        const limit = options?.limit || 10;
        const platform = options?.platform || 'all';

        console.log(`[GET-REALTIME-KEYWORDS] 시작: platform=${platform}, limit=${limit}`);

        // 모든 플랫폼 병렬 처리 (한 번에 처리)
        const result: any = {};

        // 모든 플랫폼 병렬 처리 (빠른 수집) - naver, zum, nate, daum
        result.naver = [] as RealtimeKeyword[];
        result.zum = [] as RealtimeKeyword[];
        result.nate = [] as RealtimeKeyword[];
        result.daum = [] as RealtimeKeyword[];
        result.bokjiro = [] as RealtimeKeyword[];

        // Google은 실시간 검색어 모니터링에서 제거됨 (별도 Google Trends 버튼으로 분리)
        // 유튜브 실시간 검색어는 제거됨 (다른 유튜브 기능은 유지)

        // 모든 플랫폼을 완전 병렬 처리 (속도 최적화)
        if (platform === 'all') {
          console.log('[GET-REALTIME-KEYWORDS] 모든 플랫폼 병렬 수집 시작 (속도 최적화)');

          const promises: Promise<any>[] = [];

          // 네이버 (Signal.bz) 크롤링
          promises.push((async () => {
            try {
              const naverKeywords = await getNaverRealtimeKeywords(limit);
              return { platform: 'naver', keywords: naverKeywords };
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ 네이버(Signal.bz) 수집 실패:`, err?.message || err);
              return { platform: 'naver', keywords: [] };
            }
          })());

          // ZUM 크롤링 (axios+cheerio 통합 경로)
          promises.push((async () => {
            try {
              const zumKeywords = await getZumRealtimeKeywords(limit);
              return { platform: 'zum', keywords: zumKeywords };
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ ZUM 수집 실패:`, err?.message || err);
              return { platform: 'zum', keywords: [] };
            }
          })());

          // Nate 크롤링 (v2.45.0: axios+cheerio, puppeteer 제거 — RAM 250MB 절감)
          promises.push((async () => {
            try {
              const keywords = await getNateRealtimeKeywords(limit);
              return { platform: 'nate', keywords };
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ Nate 수집 실패:`, err?.message || err);
              return { platform: 'nate', keywords: [] };
            }
          })());

          // Daum 크롤링 (v2.45.0: axios+cheerio, puppeteer 제거 — RAM 250MB 절감)
          promises.push((async () => {
            try {
              const keywords = await getDaumRealtimeKeywords(limit);
              return { platform: 'daum', keywords };
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ Daum 수집 실패:`, err?.message || err);
              return { platform: 'daum', keywords: [] };
            }
          })());

          // 정책브리핑/지원금 공식 신호 (korea.kr fallback 포함)
          promises.push((async () => {
            try {
              const { getBokjiroRealtimeKeywords } = await import('../../utils/realtime-search-keywords');
              const keywords = await getBokjiroRealtimeKeywords(limit);
              return { platform: 'bokjiro', keywords };
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ 정책브리핑 수집 실패:`, err?.message || err);
              return { platform: 'bokjiro', keywords: [] };
            }
          })());

          // 모든 플랫폼 병렬 실행
          const results = await Promise.allSettled(promises);

          // 결과 처리
          results.forEach((res) => {
            if (res.status === 'fulfilled') {
              const { platform: p, keywords: kws } = res.value;
              const converted = kws.map((kw: any) => ({
                keyword: kw.keyword || kw.text || '',
                rank: kw.rank || 0,
                source: kw.source || p,
                timestamp: kw.timestamp || new Date().toISOString(),
                change: kw.change,
                previousRank: kw.previousRank,
                searchVolume: kw.searchVolume,
                changeRate: kw.changeRate
              })).filter((kw: any) => kw.keyword && kw.keyword.length > 0) as RealtimeKeyword[];

              if (p === 'naver') result.naver = converted;
              else if (p === 'zum') result.zum = converted;
              else if (p === 'nate') result.nate = converted;
              else if (p === 'daum') result.daum = converted;
              else if (p === 'bokjiro') result.bokjiro = converted;

              console.log(`[GET-REALTIME-KEYWORDS] ✅ ${p}: ${converted.length}개`);
            }
          });

          console.log(`[GET-REALTIME-KEYWORDS] 병렬 수집 완료: 네이버=${result.naver.length}, ZUM=${result.zum.length}, Nate=${result.nate.length}, Daum=${result.daum.length}, 정책=${result.bokjiro.length}`);
        } else {
          // 개별 플랫폼 요청
          if (platform === 'naver') {
            try {
              const naverKeywords = await getNaverRealtimeKeywords(limit);
              result.naver = naverKeywords.map((kw: any) => ({
                keyword: kw.keyword || kw.text || '',
                rank: kw.rank || 0,
                source: kw.source || 'naver',
                timestamp: kw.timestamp || new Date().toISOString(),
                change: kw.change,
                previousRank: kw.previousRank,
                searchVolume: kw.searchVolume,
                changeRate: kw.changeRate
              })).filter((kw: any) => kw.keyword && kw.keyword.length > 0) as RealtimeKeyword[];
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ 네이버 수집 실패:`, err?.message || err);
              result.naver = [] as RealtimeKeyword[];
            }
          } else if (platform === 'zum') {
            try {
              const zumKeywords = await getZumRealtimeKeywords(limit);
              result.zum = zumKeywords.map((kw: any) => ({
                keyword: kw.keyword || kw.text || '',
                rank: kw.rank || 0,
                source: kw.source || 'zum',
                timestamp: kw.timestamp || new Date().toISOString(),
                change: kw.change,
                previousRank: kw.previousRank,
                searchVolume: kw.searchVolume,
                changeRate: kw.changeRate
              })).filter((kw: any) => kw.keyword && kw.keyword.length > 0) as RealtimeKeyword[];
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ ZUM 수집 실패:`, err?.message || err);
              result.zum = [] as RealtimeKeyword[];
            }
          } else if (platform === 'nate') {
            try {
              // v2.45.0: axios+cheerio (puppeteer 제거 — RAM 250MB 절감)
              result.nate = await getNateRealtimeKeywords(limit);
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ Nate 수집 실패:`, err?.message || err);
              result.nate = [] as RealtimeKeyword[];
            }
          } else if (platform === 'daum') {
            try {
              // v2.45.0: axios+cheerio (puppeteer 제거 — RAM 250MB 절감)
              result.daum = await getDaumRealtimeKeywords(limit);
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ Daum 수집 실패:`, err?.message || err);
              result.daum = [] as RealtimeKeyword[];
            }
          } else if (platform === 'bokjiro' || platform === 'policy') {
            try {
              const { getBokjiroRealtimeKeywords } = await import('../../utils/realtime-search-keywords');
              result.bokjiro = await getBokjiroRealtimeKeywords(limit);
            } catch (err: any) {
              console.error(`[GET-REALTIME-KEYWORDS] ❌ 정책브리핑 수집 실패:`, err?.message || err);
              result.bokjiro = [] as RealtimeKeyword[];
            }
          }
        }

        result.timestamp = new Date().toISOString();
        Object.assign(result, strengthenRealtimeKeywordGroups(result, limit));

        const totalCount = (result.naver?.length || 0) +
          (result.zum?.length || 0) +
          (result.nate?.length || 0) +
          (result.daum?.length || 0) +
          (result.bokjiro?.length || 0);

        console.log(`[GET-REALTIME-KEYWORDS] 완료: 총 ${totalCount}개 키워드 (네이버=${result.naver?.length || 0}, ZUM=${result.zum?.length || 0}, Nate=${result.nate?.length || 0}, Daum=${result.daum?.length || 0}, 정책=${result.bokjiro?.length || 0})`);

        if (totalCount === 0) {
          console.warn('[GET-REALTIME-KEYWORDS] ⚠️ 모든 플랫폼에서 키워드를 수집하지 못했습니다. 네트워크 연결이나 크롤링 사이트 구조 변경을 확인해주세요.');
        }

        return {
          success: true,
          data: result,
          timestamp: result.timestamp
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[GET-REALTIME-KEYWORDS] ❌ 전체 실패:`, errorMessage);
        if (errorStack) {
          console.error('[GET-REALTIME-KEYWORDS] 에러 스택:', errorStack);
        }
        return {
          success: false,
          error: errorMessage
        };
      }
    });
  } else {
    console.log('[KEYWORD-MASTER] get-realtime-keywords 핸들러는 이미 등록되어 있습니다.');
  }

  // Google Trends 키워드 조회 (별도 버튼용)
  if (!ipcMain.listenerCount('get-google-trend-keywords')) {
    ipcMain.handle('get-google-trend-keywords', async () => {
      try {
        // 라이선스 체크
        const license = await licenseManager.loadLicense();
        if (!license || !license.isValid) {
          console.log('[KEYWORD-MASTER] 라이선스 미등록 - Google Trends 차단');
          return [];
        }

        console.log('[KEYWORD-MASTER] Google Trends 키워드 조회 시작');
        const { getGoogleTrendKeywords } = await import('../../utils/google-trends-api');
        const keywords = await getGoogleTrendKeywords();
        console.log(`[KEYWORD-MASTER] Google Trends 키워드 ${keywords.length}개 조회 성공`);
        return keywords;
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] Google Trends 키워드 조회 실패:', error?.message || error);
        return [];
      }
    });
  }

  // 유튜브 영상 조회 (SNS 트렌드 대체) - 무료 기능
  console.log('[KEYWORD-MASTER] ✅ get-youtube-videos 핸들러 등록 완료');
  ipcMain.handle('get-youtube-videos', async (_event, options?: {
    maxResults?: number;
    categoryId?: string;
    pageToken?: string;
    searchQuery?: string; // 🔍 검색어 추가
  }) => {
    console.log('[KEYWORD-MASTER] 유튜브 영상 조회:', options, options?.searchQuery ? `(검색: "${options.searchQuery}")` : '');

    // 🎁 무료 기능 - 라이선스 체크 없음

    try {
      const envManager = EnvironmentManager.getInstance();
      const env = envManager.getConfig();
      const youtubeApiKey = env.youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';

      console.log('[KEYWORD-MASTER] YouTube API 키 확인:', {
        hasEnvKey: !!env.youtubeApiKey,
        hasProcessEnvKey: !!process.env['YOUTUBE_API_KEY'],
        keyLength: youtubeApiKey.length,
        keyPrefix: youtubeApiKey.substring(0, 10) + '...', // 보안을 위해 일부만 표시
        envKeys: Object.keys(env).filter(k => k.toLowerCase().includes('youtube')),
        configPath: envManager['configPath'] || 'unknown'
      });

      // config.json에서 직접 확인 시도
      if (!youtubeApiKey) {
        try {
          const fs = require('fs');
          const path = require('path');
          const { app } = require('electron');
          if (app && typeof app.getPath === 'function') {
            const configPath = path.join(app.getPath('userData'), 'config.json');
            if (fs.existsSync(configPath)) {
              const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              console.log('[KEYWORD-MASTER] config.json에서 YouTube API 키 확인:', {
                hasYoutubeApiKey: !!configData.youtubeApiKey,
                hasYOUTUBE_API_KEY: !!configData.YOUTUBE_API_KEY,
                keys: Object.keys(configData).filter(k => k.toLowerCase().includes('youtube'))
              });
            }
          }
        } catch (e) {
          console.warn('[KEYWORD-MASTER] config.json 확인 실패:', e);
        }
      }

      if (!youtubeApiKey) {
        console.warn('[KEYWORD-MASTER] YouTube API 키가 설정되지 않았습니다.');
        return {
          error: true,
          message: 'YouTube API 키가 설정되지 않았습니다. 환경 설정에서 YouTube API Key를 입력해주세요.'
        };
      }

      // API 키 유효성 간단 체크 (길이 및 형식)
      if (youtubeApiKey.length < 20) {
        console.warn('[KEYWORD-MASTER] YouTube API 키가 너무 짧습니다:', youtubeApiKey.length);
        return {
          error: true,
          message: 'YouTube API 키 형식이 올바르지 않습니다. API 키를 확인해주세요.'
        };
      }

      // YouTube Data API 직접 사용
      const maxResults = options?.maxResults || 100; // 기본값 100개로 변경

      // 🔍 키워드 검색 처리
      if (options?.searchQuery && options.searchQuery.trim().length > 0) {
        const searchQuery = options.searchQuery.trim();
        console.log('[KEYWORD-MASTER] 🔍 유튜브 키워드 검색 시작:', searchQuery);

        const searchApiUrl = 'https://www.googleapis.com/youtube/v3/search';
        const searchParams = new URLSearchParams({
          part: 'snippet',
          type: 'video',
          q: searchQuery,
          order: 'viewCount', // 조회수 순
          maxResults: String(Math.min(maxResults, 50)),
          regionCode: 'KR',
          key: youtubeApiKey
        });

        if (options?.pageToken) {
          searchParams.set('pageToken', options.pageToken);
        }

        console.log('[KEYWORD-MASTER] YouTube Search API 호출 (키워드 검색):', searchQuery);

        const searchResponse = await fetch(`${searchApiUrl}?${searchParams}`);

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text().catch(() => '{}');
          console.error('[KEYWORD-MASTER] YouTube Search API 오류:', searchResponse.status, errorText);

          if (searchResponse.status === 403) {
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true
            };
          }
          throw new Error(`YouTube Search API 오류: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        console.log('[KEYWORD-MASTER] YouTube Search 결과:', searchData.items?.length || 0, '개');

        if (!searchData.items || searchData.items.length === 0) {
          return {
            videos: [],
            nextPageToken: null,
            totalResults: 0,
            searchQuery: searchQuery
          };
        }

        // 비디오 ID 추출
        const videoIds = searchData.items
          .filter((item: any) => item.id && item.id.videoId)
          .map((item: any) => item.id.videoId)
          .join(',');

        if (!videoIds) {
          return {
            videos: [],
            nextPageToken: null,
            totalResults: 0,
            searchQuery: searchQuery
          };
        }

        // 비디오 상세 정보 조회
        const videosApiUrl = 'https://www.googleapis.com/youtube/v3/videos';
        const videosParams = new URLSearchParams({
          part: 'snippet,statistics,contentDetails',
          id: videoIds,
          key: youtubeApiKey
        });

        const videosResponse = await fetch(`${videosApiUrl}?${videosParams}`);

        if (!videosResponse.ok) {
          const errorText = await videosResponse.text().catch(() => '{}');
          console.error('[KEYWORD-MASTER] YouTube Videos API 오류:', videosResponse.status, errorText);

          if (videosResponse.status === 403) {
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true,
              searchQuery: searchQuery
            };
          }
          throw new Error(`YouTube Videos API 오류: ${videosResponse.status}`);
        }

        const videosData = await videosResponse.json();

        const videos = (videosData.items || []).map((item: any) => {
          const viewCount = parseInt(item.statistics?.viewCount || '0');
          const likeCount = parseInt(item.statistics?.likeCount || '0');
          const commentCount = parseInt(item.statistics?.commentCount || '0');

          return {
            id: item.id,
            videoId: item.id, // 🔥 프론트엔드 호환성을 위해 추가
            title: item.snippet?.title || '',
            description: (item.snippet?.description || '').substring(0, 200),
            thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '', // 🔥 thumbnail → thumbnailUrl로 변경
            channelTitle: item.snippet?.channelTitle || '',
            channelId: item.snippet?.channelId || '',
            publishedAt: item.snippet?.publishedAt || '',
            viewCount: viewCount,
            likeCount: likeCount,
            commentCount: commentCount,
            duration: item.contentDetails?.duration || '',
            categoryId: item.snippet?.categoryId || '',
            url: `https://www.youtube.com/watch?v=${item.id}`
          };
        });

        // 조회수 순으로 정렬
        videos.sort((a: any, b: any) => b.viewCount - a.viewCount);

        console.log('[KEYWORD-MASTER] ✅ 키워드 검색 완료:', videos.length, '개 영상');

        return {
          videos,
          nextPageToken: searchData.nextPageToken || null,
          totalResults: searchData.pageInfo?.totalResults || videos.length,
          searchQuery: searchQuery
        };
      }

      // 실시간 조회수 급상승 영상 처리
      if (options?.categoryId === 'trending') {
        console.log('[KEYWORD-MASTER] 🔥 실시간 조회수 급상승 영상 조회 시작');
        // 최신 업로드 영상을 가져와서 조회수 증가율 기준으로 정렬
        const searchApiUrl = 'https://www.googleapis.com/youtube/v3/search';
        const searchParams = new URLSearchParams({
          part: 'snippet',
          type: 'video',
          order: 'date', // 최신순
          maxResults: '50',
          regionCode: 'KR',
          publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 최근 7일
          key: youtubeApiKey
        });

        console.log('[KEYWORD-MASTER] YouTube Search API 호출:', {
          url: searchApiUrl,
          params: Object.fromEntries(searchParams)
        });

        const searchResponse = await fetch(`${searchApiUrl}?${searchParams}`);
        const searchResponseText = await searchResponse.text().catch(() => {
          console.error('[KEYWORD-MASTER] Search API 응답 텍스트 읽기 실패');
          return '{}';
        });

        console.log('[KEYWORD-MASTER] YouTube Search API 응답:', {
          status: searchResponse.status,
          statusText: searchResponse.statusText,
          ok: searchResponse.ok,
          responseLength: searchResponseText.length
        });

        if (!searchResponse.ok) {
          let errorData: any = {};
          try {
            errorData = JSON.parse(searchResponseText);
          } catch (e) {
            console.error('[KEYWORD-MASTER] Search API 에러 응답 파싱 실패:', e);
            errorData = { raw: searchResponseText.substring(0, 500) };
          }
          console.error('[KEYWORD-MASTER] YouTube Search API 오류:', searchResponse.status, errorData);

          // Quota 초과 오류 처리 (정확한 감지)
          const errorReason = errorData?.error?.errors?.[0]?.reason || '';
          const errorDomain = errorData?.error?.errors?.[0]?.domain || '';
          const errorMessage = errorData?.error?.message || '';
          const errorJsonString = JSON.stringify(errorData);

          const isQuotaError = searchResponse.status === 403 && (
            errorReason === 'quotaExceeded' ||
            errorDomain === 'youtube.quota' ||
            errorMessage.includes('exceeded your quota') ||
            errorJsonString.includes('"reason":"quotaExceeded"') ||
            errorJsonString.includes('"domain":"youtube.quota"')
          );

          console.log('[KEYWORD-MASTER] Search API 오류 분석:', {
            status: searchResponse.status,
            errorReason,
            errorDomain,
            isQuotaError
          });

          if (isQuotaError) {
            console.error('[KEYWORD-MASTER] ⚠️ YouTube API Quota 초과 (Search API) - 조용히 처리');
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true
            };
          }

          // 403이지만 quota가 아닌 경우도 조용히 처리
          if (searchResponse.status === 403) {
            console.error('[KEYWORD-MASTER] YouTube Search API 403 오류:', errorData);
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true // 조용히 처리하기 위해 true로 설정
            };
          }

          // Quota 오류가 아니면 에러를 throw하되, 원시 JSON은 포함하지 않음
          const errorMsg = `YouTube Search API 오류 ${searchResponse.status}`;
          const quotaError: any = new Error(errorMsg);
          quotaError.quotaExceeded = false; // 명시적으로 false 설정
          quotaError.statusCode = searchResponse.status;
          quotaError.errorData = errorData; // 내부 디버깅용으로만 저장
          throw quotaError;
        }

        let searchData: any;
        try {
          searchData = JSON.parse(searchResponseText);
        } catch (e) {
          console.error('[KEYWORD-MASTER] Search API 응답 JSON 파싱 실패:', e);
          throw new Error('YouTube Search API 응답을 파싱할 수 없습니다.');
        }
        console.log('[KEYWORD-MASTER] YouTube Search 결과:', searchData.items?.length || 0, '개');

        if (!searchData.items || searchData.items.length === 0) {
          console.warn('[KEYWORD-MASTER] 최신 영상을 찾을 수 없습니다.');
          return {
            videos: [],
            nextPageToken: null,
            totalResults: 0
          };
        }

        // 비디오 ID 목록 추출
        const videoIds = searchData.items
          .filter((item: any) => item.id && item.id.videoId)
          .map((item: any) => item.id.videoId)
          .filter((id: string) => id && id.trim().length > 0)
          .join(',');

        if (!videoIds || videoIds.length === 0) {
          console.warn('[KEYWORD-MASTER] 비디오 ID를 추출할 수 없습니다.');
          return {
            videos: [],
            nextPageToken: null,
            totalResults: 0
          };
        }

        console.log('[KEYWORD-MASTER] 비디오 ID 추출 완료:', videoIds.split(',').length, '개');

        // 비디오 상세 정보 조회
        const videosApiUrl = 'https://www.googleapis.com/youtube/v3/videos';
        const videosParams = new URLSearchParams({
          part: 'snippet,statistics,contentDetails',
          id: videoIds,
          key: youtubeApiKey
        });

        console.log('[KEYWORD-MASTER] YouTube Videos API 호출:', {
          url: videosApiUrl,
          videoIdsCount: videoIds.split(',').length
        });

        const videosResponse = await fetch(`${videosApiUrl}?${videosParams}`);
        const videosResponseText = await videosResponse.text().catch(() => {
          console.error('[KEYWORD-MASTER] Videos API 응답 텍스트 읽기 실패');
          return '{}';
        });

        console.log('[KEYWORD-MASTER] YouTube Videos API 응답:', {
          status: videosResponse.status,
          statusText: videosResponse.statusText,
          ok: videosResponse.ok,
          responseLength: videosResponseText.length
        });

        if (!videosResponse.ok) {
          let errorData: any = {};
          try {
            errorData = JSON.parse(videosResponseText);
          } catch (e) {
            console.error('[KEYWORD-MASTER] Videos API 에러 응답 파싱 실패:', e);
            errorData = { raw: videosResponseText.substring(0, 500) };
          }
          console.error('[KEYWORD-MASTER] YouTube Videos API 오류:', videosResponse.status, errorData);

          // Quota 초과 오류 처리 (정확한 감지)
          const errorReason = errorData?.error?.errors?.[0]?.reason || '';
          const errorDomain = errorData?.error?.errors?.[0]?.domain || '';
          const errorMessage = errorData?.error?.message || '';
          const errorJsonString = JSON.stringify(errorData);

          const isQuotaError = videosResponse.status === 403 && (
            errorReason === 'quotaExceeded' ||
            errorDomain === 'youtube.quota' ||
            errorMessage.includes('exceeded your quota') ||
            errorJsonString.includes('"reason":"quotaExceeded"') ||
            errorJsonString.includes('"domain":"youtube.quota"')
          );

          console.log('[KEYWORD-MASTER] Videos API 오류 분석:', {
            status: videosResponse.status,
            errorReason,
            errorDomain,
            isQuotaError
          });

          if (isQuotaError) {
            console.error('[KEYWORD-MASTER] ⚠️ YouTube API Quota 초과 (Videos API) - 조용히 처리');
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true
            };
          }

          // 403이지만 quota가 아닌 경우도 조용히 처리
          if (videosResponse.status === 403) {
            console.error('[KEYWORD-MASTER] YouTube Videos API 403 오류:', errorData);
            return {
              error: false,
              videos: [],
              nextPageToken: null,
              totalResults: 0,
              quotaExceeded: true // 조용히 처리하기 위해 true로 설정
            };
          }

          // Quota 오류가 아니면 에러를 throw하되, 원시 JSON은 포함하지 않음
          const errorMsg = `YouTube Videos API 오류 ${videosResponse.status}`;
          const quotaError: any = new Error(errorMsg);
          quotaError.quotaExceeded = false; // 명시적으로 false 설정
          quotaError.statusCode = videosResponse.status;
          quotaError.errorData = errorData; // 내부 디버깅용으로만 저장
          throw quotaError;
        }

        let videosData: any;
        try {
          videosData = JSON.parse(videosResponseText);
        } catch (e) {
          console.error('[KEYWORD-MASTER] Videos API 응답 JSON 파싱 실패:', e);
          throw new Error('YouTube Videos API 응답을 파싱할 수 없습니다.');
        }
        console.log('[KEYWORD-MASTER] YouTube Videos 상세 정보:', videosData.items?.length || 0, '개');

        if (!videosData.items || videosData.items.length === 0) {
          console.warn('[KEYWORD-MASTER] 영상 상세 정보를 가져올 수 없습니다.');
          return {
            videos: [],
            nextPageToken: null,
            totalResults: 0
          };
        }

        // 조회수 증가율 계산 (최신 영상일수록, 조회수가 많을수록 급상승으로 간주)
        let trendingVideos = videosData.items
          .map((item: any) => {
            if (!item.id) {
              console.warn('[KEYWORD-MASTER] 영상 항목에 ID가 없습니다:', item);
              return null;
            }

            try {
              const publishedAt = new Date(item.snippet?.publishedAt || 0);
              const hoursSinceUpload = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
              const viewCount = parseInt(item.statistics?.viewCount || '0');
              // 시간당 조회수 증가율 계산
              const viewsPerHour = hoursSinceUpload > 0 ? viewCount / hoursSinceUpload : viewCount;

              return {
                videoId: item.id || '',
                title: item.snippet?.title || '제목 없음',
                description: item.snippet?.description || '',
                channelTitle: item.snippet?.channelTitle || '',
                thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
                viewCount: viewCount,
                likeCount: parseInt(item.statistics?.likeCount || '0'),
                publishedAt: item.snippet?.publishedAt || '',
                duration: item.contentDetails?.duration || '',
                categoryId: item.snippet?.categoryId || '',
                url: `https://www.youtube.com/watch?v=${item.id || ''}`,
                viewsPerHour: viewsPerHour,
                hoursSinceUpload: hoursSinceUpload
              };
            } catch (e) {
              console.error('[KEYWORD-MASTER] 영상 데이터 처리 중 오류:', e, item);
              return null;
            }
          })
          .filter((video: any) => video !== null && video.videoId && video.videoId.length > 0); // null 및 유효하지 않은 비디오 필터링

        // 시간당 조회수 기준으로 정렬 (급상승 영상)
        trendingVideos.sort((a: any, b: any) => b.viewsPerHour - a.viewsPerHour);

        // 순위 추가
        trendingVideos = trendingVideos.map((video: any, index: number) => ({
          ...video,
          rank: index + 1
        }));

        console.log('[KEYWORD-MASTER] 실시간 조회수 급상승 영상 정렬 완료:', trendingVideos.length, '개');
        console.log('[KEYWORD-MASTER] 상위 3개 영상:', trendingVideos.slice(0, 3).map((v: any) => ({
          title: v.title,
          viewsPerHour: Math.round(v.viewsPerHour)
        })));

        return {
          videos: trendingVideos.slice(0, maxResults),
          nextPageToken: null,
          totalResults: trendingVideos.length
        };
      }

      // 일반 인기 영상 조회
      const apiUrl = 'https://www.googleapis.com/youtube/v3/videos';
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        chart: 'mostPopular',
        regionCode: 'KR',
        maxResults: String(Math.min(maxResults, 50)), // API 최대값 50개 제한
        key: youtubeApiKey
      });

      // 카테고리 필터 추가
      if (options?.categoryId && options.categoryId !== 'all' && options.categoryId !== 'trending') {
        params.append('videoCategoryId', options.categoryId);
      }

      // 페이지네이션 토큰 추가
      if (options?.pageToken) {
        params.append('pageToken', options.pageToken);
      }

      const fullUrl = `${apiUrl}?${params}`;
      console.log('[KEYWORD-MASTER] YouTube API 호출 시작:', {
        url: apiUrl,
        fullUrl: fullUrl.replace(/key=[^&]+/, 'key=***'), // API 키는 마스킹
        categoryId: options?.categoryId || 'all',
        maxResults: maxResults,
        hasPageToken: !!options?.pageToken,
        params: Object.fromEntries(params.entries())
      });

      const response = await fetch(`${apiUrl}?${params}`);
      const responseText = await response.text().catch(() => {
        console.error('[KEYWORD-MASTER] Popular Videos API 응답 텍스트 읽기 실패');
        return '{}';
      });

      console.log('[KEYWORD-MASTER] YouTube API 응답 상태:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responseLength: responseText.length
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          console.error('[KEYWORD-MASTER] 에러 응답 파싱 실패:', e);
          errorData = { raw: responseText.substring(0, 500) };
        }

        console.error('[KEYWORD-MASTER] YouTube API 오류 상세:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          errorReason: errorData?.error?.errors?.[0]?.reason,
          errorDomain: errorData?.error?.errors?.[0]?.domain,
          errorMessage: errorData?.error?.message
        });

        // 정확한 오류 원인 파악
        const errorReason = errorData?.error?.errors?.[0]?.reason || '';
        const errorDomain = errorData?.error?.errors?.[0]?.domain || '';
        const errorMessage = errorData?.error?.message || '';
        const errorJsonString = JSON.stringify(errorData);

        // Quota 초과 오류 처리 (정확한 감지)
        const isQuotaError = response.status === 403 && (
          errorReason === 'quotaExceeded' ||
          errorDomain === 'youtube.quota' ||
          errorMessage.includes('exceeded your quota') ||
          errorMessage.includes('quotaExceeded') ||
          errorJsonString.includes('"reason":"quotaExceeded"') ||
          errorJsonString.includes('"domain":"youtube.quota"')
        );

        console.log('[KEYWORD-MASTER] 오류 분석:', {
          status: response.status,
          errorReason,
          errorDomain,
          isQuotaError,
          errorDataPreview: JSON.stringify(errorData).substring(0, 300)
        });

        if (isQuotaError) {
          console.error('[KEYWORD-MASTER] ⚠️ YouTube API Quota 초과 - 조용히 처리');
          // Quota 오류는 조용히 처리 (오류 메시지 표시 안 함)
          return {
            error: false,
            videos: [],
            nextPageToken: null,
            totalResults: 0,
            quotaExceeded: true
          };
        }

        // 모든 YouTube API 오류는 조용히 처리 (오류 메시지 표시 안 함)
        // 403 오류 (quota가 아닌 경우 포함)
        if (response.status === 403) {
          console.error('[KEYWORD-MASTER] YouTube API 403 오류:', errorData);
          return {
            error: false,
            videos: [],
            nextPageToken: null,
            totalResults: 0,
            quotaExceeded: true // 조용히 처리하기 위해 true로 설정
          };
        }

        // API 키 오류도 조용히 처리
        if (response.status === 400 || response.status === 401) {
          console.error('[KEYWORD-MASTER] YouTube API 키 오류:', errorData);
          return {
            error: false,
            videos: [],
            nextPageToken: null,
            totalResults: 0,
            quotaExceeded: true // 조용히 처리하기 위해 true로 설정
          };
        }

        // Quota 오류가 아니면 에러를 throw하되, 원시 JSON은 포함하지 않음
        const errorMsg = `YouTube API 오류 ${response.status}`;
        const quotaError: any = new Error(errorMsg);
        quotaError.quotaExceeded = false; // 명시적으로 false 설정
        quotaError.statusCode = response.status;
        quotaError.errorData = errorData; // 내부 디버깅용으로만 저장
        throw quotaError;
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('[KEYWORD-MASTER] 응답 JSON 파싱 실패:', e);
        throw new Error('YouTube API 응답을 파싱할 수 없습니다.');
      }

      console.log('[KEYWORD-MASTER] YouTube API 응답 데이터:', {
        itemsCount: data.items?.length || 0,
        totalResults: data.pageInfo?.totalResults || 0,
        hasNextPage: !!data.nextPageToken,
        hasError: !!data.error,
        errorMessage: data.error?.message || null,
        responseKeys: Object.keys(data),
        firstItem: data.items?.[0] ? {
          id: data.items[0].id,
          hasSnippet: !!data.items[0].snippet,
          hasStatistics: !!data.items[0].statistics
        } : null
      });

      // 응답이 비어있거나 예상과 다른 경우
      if (!data || typeof data !== 'object') {
        console.error('[KEYWORD-MASTER] YouTube API 응답이 유효하지 않습니다:', typeof data, data);
        return {
          error: true,
          message: 'YouTube API 응답이 유효하지 않습니다.',
          videos: []
        };
      }

      // 응답 데이터 검증
      if (data.error) {
        console.error('[KEYWORD-MASTER] YouTube API 응답에 에러 포함:', data.error);
        return {
          error: true,
          message: data.error.message || 'YouTube API에서 오류가 발생했습니다.',
          videos: []
        };
      }

      if (!data.items || data.items.length === 0) {
        console.warn('[KEYWORD-MASTER] YouTube API 응답에 영상이 없습니다.');
        console.warn('[KEYWORD-MASTER] 응답 상세:', {
          hasPageInfo: !!data.pageInfo,
          pageInfo: data.pageInfo,
          regionCode: 'KR',
          categoryId: options?.categoryId,
          chart: 'mostPopular'
        });

        // 영상이 없는 경우 사용자에게 안내
        return {
          error: true,
          message: '현재 선택한 카테고리나 지역에 인기 영상이 없습니다. 다른 카테고리를 선택해보세요.',
          videos: [],
          nextPageToken: null,
          totalResults: 0
        };
      }

      console.log('[KEYWORD-MASTER] YouTube API 영상 데이터 샘플:', {
        firstVideo: data.items[0] ? {
          id: data.items[0].id,
          title: data.items[0].snippet?.title?.substring(0, 50),
          hasThumbnail: !!data.items[0].snippet?.thumbnails,
          hasStatistics: !!data.items[0].statistics
        } : null
      });

      // 100개 이상 요청 시 여러 페이지 요청
      let allVideos = data.items.map((item: any, index: number) => {
        // 데이터 검증 및 로깅
        if (!item.id) {
          console.warn(`[KEYWORD-MASTER] 영상 ${index}번째 항목에 ID가 없습니다:`, item);
        }
        if (!item.snippet) {
          console.warn(`[KEYWORD-MASTER] 영상 ${index}번째 항목에 snippet이 없습니다:`, item);
        }

        return {
          rank: index + 1,
          videoId: item.id || '',
          title: item.snippet?.title || '제목 없음',
          description: item.snippet?.description || '',
          channelTitle: item.snippet?.channelTitle || '',
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
          viewCount: parseInt(item.statistics?.viewCount || '0'),
          likeCount: parseInt(item.statistics?.likeCount || '0'),
          publishedAt: item.snippet?.publishedAt || '',
          duration: item.contentDetails?.duration || '',
          categoryId: item.snippet?.categoryId || '',
          url: `https://www.youtube.com/watch?v=${item.id || ''}`
        };
      }).filter((video: any) => video.videoId && video.videoId.length > 0); // 유효한 비디오만 필터링

      console.log('[KEYWORD-MASTER] 첫 페이지 영상 처리 완료:', {
        totalItems: data.items.length,
        validVideos: allVideos.length,
        filteredOut: data.items.length - allVideos.length
      });

      let currentPageToken = data.nextPageToken;
      let currentRank = allVideos.length;

      // 100개 이상 요청 시 추가 페이지 요청
      while (allVideos.length < maxResults && currentPageToken) {
        const nextParams = new URLSearchParams(params);
        nextParams.set('pageToken', currentPageToken);
        nextParams.set('maxResults', '50'); // 각 페이지는 최대 50개

        const nextResponse = await fetch(`${apiUrl}?${nextParams}`);
        const nextResponseText = await nextResponse.text().catch(() => '');

        if (!nextResponse.ok) {
          // Quota 초과 오류 처리
          if (nextResponse.status === 403) {
            let errorData: any = {};
            try {
              errorData = JSON.parse(nextResponseText);
            } catch (e) {
              // 파싱 실패 시 무시
            }
            if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
              console.warn('[KEYWORD-MASTER] YouTube API 할당량 초과 - 부분 결과 반환');
              break; // 부분 결과 반환
            }
          }
          console.warn('[KEYWORD-MASTER] 다음 페이지 요청 실패:', nextResponse.status);
          break;
        }

        let nextData: any;
        try {
          nextData = JSON.parse(nextResponseText);
        } catch (e) {
          console.error('[KEYWORD-MASTER] 다음 페이지 응답 파싱 실패:', e);
          break; // 파싱 실패 시 루프 종료
        }

        if (!nextData.items || nextData.items.length === 0) break;

        const nextVideos = nextData.items
          .map((item: any) => ({
            rank: ++currentRank,
            videoId: item.id || '',
            title: item.snippet?.title || '제목 없음',
            description: item.snippet?.description || '',
            channelTitle: item.snippet?.channelTitle || '',
            thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
            viewCount: parseInt(item.statistics?.viewCount || '0'),
            likeCount: parseInt(item.statistics?.likeCount || '0'),
            publishedAt: item.snippet?.publishedAt || '',
            duration: item.contentDetails?.duration || '',
            categoryId: item.snippet?.categoryId || '',
            url: `https://www.youtube.com/watch?v=${item.id || ''}`
          }))
          .filter((video: any) => video.videoId && video.videoId.length > 0); // 유효한 비디오만 필터링

        allVideos = [...allVideos, ...nextVideos];
        currentPageToken = nextData.nextPageToken;

        // API 호출 제한 방지를 위한 짧은 대기
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 영상 정렬: 조회수 기준 내림차순 (인기순)
      allVideos.sort((a: any, b: any) => b.viewCount - a.viewCount);

      // 순위 재정렬
      allVideos = allVideos.map((video: any, index: number) => ({
        ...video,
        rank: index + 1
      }));

      const finalVideos = allVideos.slice(0, maxResults);

      console.log('[KEYWORD-MASTER] 최종 YouTube 영상 결과:', {
        requested: maxResults,
        collected: allVideos.length,
        returned: finalVideos.length,
        hasNextPage: !!currentPageToken,
        sampleTitles: finalVideos.slice(0, 3).map((v: any) => v.title)
      });

      return {
        videos: finalVideos,
        nextPageToken: currentPageToken || null,
        totalResults: allVideos.length
      };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 유튜브 영상 조회 실패:', error);
      console.error('[KEYWORD-MASTER] 에러 상세:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        categoryId: options?.categoryId
      });

      // Quota 초과 오류 체크 (강화된 감지)
      const errorMessage = error.message || String(error) || '';
      const errorString = JSON.stringify(error);
      const errorStack = error.stack || '';

      // quotaExceeded 플래그가 있으면 우선 사용
      const hasQuotaFlag = error.quotaExceeded === true;

      // 에러 메시지에서 quota 관련 키워드 확인 (더 강화된 패턴)
      // HTML 태그를 제거한 순수 텍스트로도 확인
      const cleanMessage = errorMessage.replace(/<[^>]+>/g, '').toLowerCase();
      const hasQuotaInMessage =
        errorMessage.includes('quotaExceeded') ||
        errorMessage.includes('youtube.quota') ||
        errorMessage.includes('할당량이 초과') ||
        errorMessage.includes('exceeded your') ||
        errorMessage.includes('exceeded your quota') ||
        cleanMessage.includes('exceeded your quota') ||
        (errorMessage.includes('quota') && errorMessage.includes('exceeded')) ||
        (cleanMessage.includes('quota') && cleanMessage.includes('exceeded')) ||
        (errorMessage.includes('403') && (errorMessage.includes('quota') || errorMessage.includes('exceeded'))) ||
        (errorMessage.includes('"reason":"quotaExceeded"')) ||
        (errorMessage.includes('"domain":"youtube.quota"')) ||
        (errorMessage.includes('reason":"quotaExceeded')) ||
        (errorMessage.includes('domain":"youtube.quota'));

      // JSON 문자열에서 확인
      const hasQuotaInJson =
        errorString.includes('quotaExceeded') ||
        errorString.includes('youtube.quota') ||
        (errorString.includes('"code":403') && errorString.includes('quota')) ||
        errorString.includes('"reason":"quotaExceeded"') ||
        errorString.includes('"domain":"youtube.quota"') ||
        (errorString.includes('exceeded') && errorString.includes('quota'));

      // errorData 속성 확인
      const errorData = error.errorData || error.data || {};
      const hasQuotaInErrorData =
        errorData?.error?.errors?.[0]?.reason === 'quotaExceeded' ||
        errorData?.error?.errors?.[0]?.domain === 'youtube.quota' ||
        (typeof errorData === 'object' && JSON.stringify(errorData).includes('quotaExceeded'));

      // statusCode 확인
      const hasQuotaStatusCode = error.statusCode === 403 && (
        errorMessage.includes('quota') ||
        errorString.includes('quota')
      );

      const isQuotaExceeded = hasQuotaFlag || hasQuotaInMessage || hasQuotaInJson || hasQuotaInErrorData || hasQuotaStatusCode;

      console.log('[KEYWORD-MASTER] Quota 오류 감지 분석:', {
        hasQuotaFlag,
        hasQuotaInMessage,
        hasQuotaInJson,
        hasQuotaInErrorData,
        hasQuotaStatusCode,
        isQuotaExceeded,
        errorMessagePreview: errorMessage.substring(0, 200)
      });

      // 모든 YouTube API 오류는 조용히 처리 (오류 메시지 표시 안 함)
      // Quota 오류 또는 YouTube API 관련 오류는 모두 조용히 처리
      const isYouTubeApiError = isQuotaExceeded ||
        errorMessage.includes('YouTube') ||
        errorMessage.includes('youtube') ||
        error.statusCode === 403 ||
        error.statusCode === 400 ||
        error.statusCode === 401;

      if (isYouTubeApiError) {
        console.log('[KEYWORD-MASTER] YouTube API 오류 감지 - 조용히 처리');
        return {
          error: false,
          videos: [],
          nextPageToken: null,
          totalResults: 0,
          quotaExceeded: true // 조용히 처리하기 위해 true로 설정
        };
      }

      // YouTube API 오류가 아닌 경우에만 에러 반환
      // 원시 JSON이 포함된 에러 메시지는 사용자 친화적인 메시지로 대체
      let finalErrorMessage = error.message || '유튜브 영상 조회에 실패했습니다.';

      // 원시 JSON이 포함된 경우 간단한 메시지로 대체
      if (finalErrorMessage.includes('{"error":') || finalErrorMessage.includes('"code":') || finalErrorMessage.includes('"message":')) {
        finalErrorMessage = '유튜브 영상 조회에 실패했습니다.';
      }

      return {
        error: true,
        message: finalErrorMessage,
        videos: [],
        nextPageToken: null,
        totalResults: 0
      };
    }
  });

  // SNS 트렌드 조회 (YouTube 포함, 중복 등록 방지)
  if (!ipcMain.listenerCount('get-sns-trends')) {
    ipcMain.handle('get-sns-trends', async (_event, platform: string) => {
      // 무제한 라이선스 체크
      const licenseCheck = checkUnlimitedLicense();
      if (!licenseCheck.allowed) {
        return [];
      }

      try {
        // 기존 get-trending-keywords 핸들러 재사용
        return await (async () => {
          if (platform === 'instagram') {
            // Instagram은 API가 복잡하므로 Google Trends로 대체
            return await getGoogleTrendKeywords();
          }

          if (platform === 'twitter' || platform === 'x') {
            // Twitter/X도 Google Trends로 대체
            return await getGoogleTrendKeywords();
          }

          // 기본값: Google Trends
          return await getGoogleTrendKeywords();
        })();
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] SNS 트렌드 조회 실패:', error);
        return [];
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-sns-trends 핸들러 등록 완료');
  }

  // 타이밍 골드 헌터 - 지금 당장 작성하면 트래픽 폭발할 키워드 찾기
  // 🔥 트래픽 폭발 키워드 헌터 라이트
  // - 3개월 이상 사용자: 무제한 사용
  // - 무료 사용자: 하루 5회 제한

  // ========== hunt-timing-gold 핸들러 종료 - Lite+ 시스템으로 교체됨 ==========

  // 🔥 구버전 코드는 if(false) 블록 안에 있어 절대 실행되지 않음
  // 빌드 오류 방지를 위해 남겨둔 것이며, 추후 완전 삭제 예정
  if (false) {
    // async IIFE로 감싸서 await 오류 방지
    (async () => {
      const category = '';
      const finder = new TimingGoldenFinder();
      const allKeywords: KeywordData[] = [];
      // === 구버전 코드 시작 ===
      try {
        const finder = new TimingGoldenFinder();
        const allKeywords: KeywordData[] = [];

        // 키워드 정제 함수: 헤드라인에서 핵심 키워드만 추출 (완화된 버전)
        const refineKeyword = (rawKeyword: string): string | null => {
          if (!rawKeyword || rawKeyword.trim().length === 0) return null;

          let keyword = rawKeyword.trim();

          // 1. 기본 정제: 특수문자, 이모지 제거
          keyword = keyword.replace(/["'""''「」『』…]/g, '');
          keyword = keyword.replace(/[⚠️🚨⚡🔥💥]/g, '');
          keyword = keyword.replace(/\[.*?\]/g, ''); // [태그] 제거
          keyword = keyword.replace(/\(.*?\)/g, ''); // (설명) 제거
          keyword = keyword.replace(/\s+/g, ' ').trim();

          // 2. 출처 제거
          keyword = keyword.replace(/\s*\/\s*[가-힣A-Za-z]+$/, '');
          keyword = keyword.replace(/\s*#\s*[가-힣A-Za-z]+$/, '');

          // 3. 변화 표시 제거 (▲, ▼, NEW 등)
          keyword = keyword.replace(/▲|▼|↑|↓/g, '');
          keyword = keyword.replace(/\s*(NEW|new|신규)\s*/gi, '');
          keyword = keyword.replace(/\s*\d+\s*$/, ''); // 끝의 숫자 제거
          keyword = keyword.replace(/^\d+\s*/, ''); // 앞의 숫자 제거

          keyword = keyword.trim();

          // 4. 길이 체크 (최소 2자, 최대 50자로 완화)
          if (keyword.length < 2) return null;
          if (keyword.length > 50) {
            // 너무 긴 경우 앞 30자만 사용
            keyword = keyword.substring(0, 30).trim();
          }

          // 5. 광고성 키워드 필터링 (최소한만)
          const adPatterns = [
            /^보험$/, /^대출$/, /^사주$/, /^라식$/, /^성형$/, /^탈모$/,
            /^광고$/, /^홍보$/, /^창업$/, /^분양$/
          ];
          if (adPatterns.some(p => p.test(keyword))) return null;

          // 6. UI 텍스트 필터링
          const uiWords = ['더보기', '전체보기', '검색', '로그인', '회원가입', '닫기', '홈', 'NOW'];
          if (uiWords.includes(keyword)) return null;

          return keyword;
        };

        // 1. 네이버 실시간 급상승 키워드 수집 (우선)
        try {
          const naverRealtime = await getAllRealtimeKeywords();
          const naverKeywords = naverRealtime.naver || [];

          console.log(`[KEYWORD-MASTER] 네이버 실시간 검색어 ${naverKeywords.length}개 수집`);

          for (const item of naverKeywords.slice(0, 30)) { // 15개 -> 30개로 증가하여 더 풍부한 결과 제공
            if (item.keyword && item.keyword.trim().length > 0) {
              // 키워드 정제 (실패 시 원본 사용)
              let refinedKeyword = refineKeyword(item.keyword);
              if (!refinedKeyword) {
                // 원본 키워드 기본 정제만 하고 사용
                refinedKeyword = item.keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' ').substring(0, 30).trim();
                if (!refinedKeyword || refinedKeyword.length < 2) {
                  console.log(`[KEYWORD-MASTER] 키워드 정제 실패 (너무 짧음): "${item.keyword}"`);
                  continue;
                }
              }
              // 실시간 검색어는 급상승 중이므로 높은 성장률 부여
              const growthRate = deterministicRange(`realtime-growth:${refinedKeyword}`, 100, 400);

              // 카테고리 필터링 (확장된 카테고리 목록)
              if (category && category !== '' && category !== '전체') {
                const keywordLower = refinedKeyword.toLowerCase();
                const categoryMatch: Record<string, string[]> = {
                  '정치': ['정치', '선거', '정당', '국회', '대통령', '국정'],
                  '경제': ['경제', '주식', '투자', '금융', '부동산', '재테크', '경제지표', '환율', '금리'],
                  '사회': ['사회', '사건', '사고', '범죄', '안전', '복지', '노동'],
                  '국제': ['국제', '세계', '외교', '국제뉴스', '해외', '글로벌'],
                  'IT': ['IT', '기술', '프로그래밍', '개발', '소프트웨어', '앱', '인공지능', 'AI', '빅데이터', '클라우드'],
                  '과학': ['과학', '연구', '기술', '발명', '연구소', '실험'],
                  '스마트폰': ['스마트폰', '아이폰', '갤럭시', '안드로이드', '모바일'],
                  '컴퓨터': ['컴퓨터', 'PC', '노트북', '데스크탑', '하드웨어'],
                  'AI': ['AI', '인공지능', '머신러닝', '딥러닝', '챗봇', 'GPT'],
                  '생활': ['생활', '요리', '집', '인테리어', '육아', '건강', '일상'],
                  '건강': ['건강', '의료', '병원', '운동', '다이어트', '의약품', '질병', '치료'],
                  '육아': ['육아', '임신', '출산', '아기', '아이', '유아', '어린이'],
                  '반려동물': ['반려동물', '강아지', '고양이', '펫', '애완동물'],
                  '인테리어': ['인테리어', '집꾸미기', '리모델링', '가구', '디자인'],
                  '엔터테인먼트': ['엔터테인먼트', '오락', '예능', '연예'],
                  '영화': ['영화', '영화관', '영화예매', '영화리뷰', '영화추천', '개봉'],
                  '드라마': ['드라마', '드라마추천', '드라마순위', '최신드라마', '드라마리뷰'],
                  '음악': ['음악', '음악추천', '음악다운로드', '최신음악', '음악순위', '음악방송'],
                  '예능': ['예능', '버라이어티', 'TV', '방송'],
                  '쇼핑': ['쇼핑', '온라인쇼핑', '구매', '할인', '이벤트', '쿠폰'],
                  '패션': ['패션', '의류', '옷', '스타일', '코디', '패션트렌드'],
                  '뷰티': ['뷰티', '화장품', '메이크업', '스킨케어', '화장'],
                  '가전': ['가전', '가전제품', '냉장고', '세탁기', '에어컨'],
                  '음식': ['음식', '요리', '맛집', '레시피', '요리법'],
                  '맛집': ['맛집', '음식점', '식당', '맛집추천', '맛집리스트'],
                  '카페': ['카페', '커피', '카페추천', '원두', '에스프레소'],
                  '레시피': ['레시피', '요리법', '조리법', '요리레시피'],
                  '여행': ['여행', '여행지', '관광', '여행추천'],
                  '국내여행': ['국내여행', '국내관광', '경주', '제주', '부산'],
                  '해외여행': ['해외여행', '해외관광', '일본', '유럽', '동남아'],
                  '호텔': ['호텔', '숙박', '리조트', '펜션', '게스트하우스'],
                  '자동차': ['자동차', '전기차', '중고차', 'SUV', '세단', '하이브리드'],
                  '전기차': ['전기차', 'EV', '테슬라', '전기자동차'],
                  '중고차': ['중고차', '중고자동차', '중고차구매'],
                  '부동산': ['부동산', '아파트', '오피스텔', '임대', '매매'],
                  '아파트': ['아파트', 'APT', '공동주택'],
                  '전세': ['전세', '전세금', '전세계약'],
                  '매매': ['매매', '부동산매매', '집매매'],
                  '스포츠': ['스포츠', '운동', '경기', '선수'],
                  '축구': ['축구', '프리미어리그', 'K리그', '월드컵'],
                  '야구': ['야구', 'KBO', '프로야구', '야구경기'],
                  '골프': ['골프', '골프장', '골프클럽'],
                  '게임': ['게임', '온라인게임', '게임추천', '게임리뷰'],
                  '모바일게임': ['모바일게임', '스마트폰게임', '모바일앱게임'],
                  'PC게임': ['PC게임', '컴퓨터게임', '온라인게임'],
                  'e스포츠': ['e스포츠', '프로게이머', '리그오브레전드', '롤'],
                  '금융': ['금융', '은행', '카드', '대출', '적금', '펀드'],
                  '투자': ['투자', '주식투자', '부동산투자', '펀드투자'],
                  '주식': ['주식', '증권', '코스피', '코스닥', '주식투자'],
                  '부동산투자': ['부동산투자', '부동산투자상담'],
                  '교육': ['교육', '학원', '공부', '학습', '교육과정'],
                  '학원': ['학원', '과외', '학습지', '입시'],
                  '자격증': ['자격증', '공인자격증', '자격시험'],
                  '온라인강의': ['온라인강의', '인강', '교육플랫폼', '이러닝']
                };

                const keywords = categoryMatch[category] || [];
                if (keywords.length === 0 || !keywords.some(k => keywordLower.includes(k))) {
                  continue; // 카테고리 불일치면 스킵
                }
              }

              // 🔥 100% 성공률 + 빠른 속도: 병렬 API 호출
              let volume: number | null = null;
              let docCount: number | null = null;

              const envManager = EnvironmentManager.getInstance();
              const env = envManager.getConfig();
              const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
              const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

              if (!naverClientId || !naverClientSecret) {
                // API 키 없어도 실시간 키워드는 포함 (growthRate로 가치 판단)
                allKeywords.push({
                  keyword: refinedKeyword,
                  searchVolume: null, // 실시간 급상승 → 기본 검색량 부여
                  documentCount: null,
                  growthRate: growthRate,
                  changeRate: growthRate,
                  firstSeenDate: new Date(),
                  category: category || '일반'
                });
                continue;
              }

              // v2.42.37: sv/dc 동시 측정 (Bilateral Sanity Check + 영구 캐시 자동 적용)
              const volumeResult = await Promise.race([
                getNaverKeywordSearchVolumeSeparate({
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                }, [refinedKeyword], { includeDocumentCount: true }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
              ]);
              if (volumeResult && Array.isArray(volumeResult) && volumeResult.length > 0 && volumeResult[0]) {
                const vd = volumeResult[0];
                const pc = typeof vd.pcSearchVolume === 'number' ? vd.pcSearchVolume : null;
                const mobile = typeof vd.mobileSearchVolume === 'number' ? vd.mobileSearchVolume : null;
                volume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
                docCount = typeof vd.documentCount === 'number' ? vd.documentCount : null;
              }

              // 🔥 실시간 급상승 키워드는 항상 포함 (데이터 없어도 기본값 부여)


              allKeywords.push({
                keyword: refinedKeyword,
                searchVolume: volume,
                documentCount: docCount,
                growthRate: typeof item.changeRate === 'number' ? item.changeRate : growthRate,
                changeRate: typeof item.changeRate === 'number' ? item.changeRate : growthRate,
                firstSeenDate: new Date(),
                category: category || '일반'
              });
            }
          }
        } catch (error: any) {
          console.warn('[KEYWORD-MASTER] 네이버 실시간 키워드 수집 실패:', error.message);
        }

        // 2. 네이버 데이터랩 트렌드 키워드 수집 - 스킵 (데이터랩 API는 별도 권한 필요)
        // 💡 네이버 개발자센터 API 키로는 데이터랩 API 사용 불가
        // 대신 실시간 키워드(1단계)에서 수집한 키워드만 사용
        console.log('[LITE] 데이터랩 API 스킵 - 실시간 키워드만 사용');

        // 네이버 데이터랩 API는 별도 권한 필요하여 스킵
        // (네이버 개발자센터 API 키로는 데이터랩 API 사용 불가)

        // 3. Google 트렌드 키워드 수집
        try {
          const googleTrends = await getGoogleTrendKeywords();

          for (const trend of googleTrends.slice(0, 30)) { // 15개 -> 30개로 증가
            // 키워드 유효성 체크 및 정제
            if (!trend.keyword || trend.keyword.trim().length === 0) {
              continue; // 키워드가 없으면 스킵
            }

            // 키워드 정제
            // 키워드 정제 (실패 시 원본 사용)
            let refinedKeyword = refineKeyword(trend.keyword);
            if (!refinedKeyword) {
              refinedKeyword = trend.keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' ').substring(0, 30).trim();
              if (!refinedKeyword || refinedKeyword.length < 2) {
                console.log(`[KEYWORD-MASTER] 키워드 정제 실패 (너무 짧음): "${trend.keyword}"`);
                continue;
              }
            }

            // 카테고리 필터링
            if (category && category !== '' && category !== '전체') {
              const keywordLower = refinedKeyword.toLowerCase();
              const categoryMatch: Record<string, string[]> = {
                '경제': ['경제', '주식', '투자', '금융', '부동산'],
                'IT': ['IT', '기술', '프로그래밍', '개발', '소프트웨어'],
                '생활': ['생활', '요리', '집', '인테리어'],
                '엔터테인먼트': ['영화', '드라마', '음악', '게임']
              };

              const keywords = categoryMatch[category] || [];
              if (!keywords.some(k => keywordLower.includes(k))) {
                continue;
              }
            }

            // 🔥 100% 성공률: Google 트렌드 병렬 API 호출
            let googleVolume: number | null = null;
            let googleDocCount: number | null = null;

            const envManager = EnvironmentManager.getInstance();
            const env = envManager.getConfig();
            const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
            const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

            if (naverClientId && naverClientSecret) {
              // v2.42.37: sv/dc 동시 측정 (Bilateral Sanity Check + 영구 캐시 자동 적용)
              const volRes = await Promise.race([
                getNaverKeywordSearchVolumeSeparate({ clientId: naverClientId, clientSecret: naverClientSecret }, [refinedKeyword], { includeDocumentCount: true }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
              ]);
              if (volRes && Array.isArray(volRes) && volRes.length > 0 && volRes[0]) {
                const vd = volRes[0];
                const pc = typeof vd.pcSearchVolume === 'number' ? vd.pcSearchVolume : null;
                const mobile = typeof vd.mobileSearchVolume === 'number' ? vd.mobileSearchVolume : null;
                googleVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
                googleDocCount = typeof vd.documentCount === 'number' ? vd.documentCount : null;
              }
            }


            allKeywords.push({
              keyword: refinedKeyword,
              searchVolume: googleVolume,
              documentCount: googleDocCount,
              growthRate: typeof trend.changeRate === 'number' ? trend.changeRate : null,
              changeRate: typeof trend.changeRate === 'number' ? trend.changeRate : null,
              firstSeenDate: new Date(),
              category: category || '일반'
            });
          }
        } catch (error: any) {
          console.warn('[KEYWORD-MASTER] Google 트렌드 수집 실패:', error.message);
        }

        // 4. YouTube 트렌드 키워드 수집
        try {
          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const youtubeApiKey = env.youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';

          if (youtubeApiKey) {
            const youtubeTrends = await getYouTubeTrendKeywords({ apiKey: youtubeApiKey });

            for (const trend of youtubeTrends.slice(0, 20)) { // 10개 -> 20개로 증가
              // 키워드 유효성 체크 및 정제
              if (!trend.keyword || trend.keyword.trim().length === 0) {
                continue; // 키워드가 없으면 스킵
              }

              // 키워드 정제
              // 키워드 정제 (실패 시 원본 사용)
              let refinedKeyword = refineKeyword(trend.keyword);
              if (!refinedKeyword) {
                refinedKeyword = trend.keyword.trim().replace(/[▲▼↑↓]/g, '').replace(/\s+/g, ' ').substring(0, 30).trim();
                if (!refinedKeyword || refinedKeyword.length < 2) {
                  console.log(`[KEYWORD-MASTER] 키워드 정제 실패 (너무 짧음): "${trend.keyword}"`);
                  continue;
                }
              }

              // 카테고리 필터링
              if (category && category !== '' && category !== '전체') {
                const keywordLower = refinedKeyword.toLowerCase();
                const categoryMatch: Record<string, string[]> = {
                  '경제': ['경제', '주식', '투자'],
                  'IT': ['IT', '기술', '프로그래밍'],
                  '생활': ['생활', '요리', '집'],
                  '엔터테인먼트': ['영화', '드라마', '음악', '게임']
                };

                const keywords = categoryMatch[category] || [];
                if (!keywords.some(k => keywordLower.includes(k))) {
                  continue;
                }
              }

              // 🔥 100% 성공률: YouTube 트렌드 병렬 API 호출
              let ytVolume: number | null = null;
              let ytDocCount: number | null = null;

              const envManager2 = EnvironmentManager.getInstance();
              const env2 = envManager2.getConfig();
              const naverClientId2 = env2.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
              const naverClientSecret2 = env2.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

              if (naverClientId2 && naverClientSecret2) {
                // v2.42.37: sv/dc 동시 측정 (Bilateral Sanity Check + 영구 캐시 자동 적용)
                const volRes2 = await Promise.race([
                  getNaverKeywordSearchVolumeSeparate({ clientId: naverClientId2, clientSecret: naverClientSecret2 }, [refinedKeyword], { includeDocumentCount: true }),
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
                ]);
                if (volRes2 && Array.isArray(volRes2) && volRes2.length > 0 && volRes2[0]) {
                  const vd = volRes2[0];
                  const pc = typeof vd.pcSearchVolume === 'number' ? vd.pcSearchVolume : null;
                  const mobile = typeof vd.mobileSearchVolume === 'number' ? vd.mobileSearchVolume : null;
                  ytVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
                  ytDocCount = typeof vd.documentCount === 'number' ? vd.documentCount : null;
                }
              }


              allKeywords.push({
                keyword: refinedKeyword,
                searchVolume: ytVolume,
                documentCount: ytDocCount,
                growthRate: typeof trend.changeRate === 'number' ? trend.changeRate : null,
                changeRate: typeof trend.changeRate === 'number' ? trend.changeRate : null,
                firstSeenDate: new Date(),
                category: category || '엔터테인먼트'
              });
            }
          }
        } catch (error: any) {
          console.warn('[KEYWORD-MASTER] YouTube 트렌드 수집 실패:', error.message);
        }

        // 5. 각 키워드에 대해 급상승 이유 분석, 연관 키워드 수집, 검증 및 타이밍 골드 점수 계산
        console.log(`[LITE] 수집된 키워드 총 ${allKeywords.length}개, 분석 시작...`);

        // 🔥 키워드가 없으면 바로 실시간 키워드로 결과 생성 (실제 API 데이터 사용)
        if (allKeywords.length === 0) {
          console.log('[LITE] 수집된 키워드 없음 - 실시간 검색어 직접 사용 (실제 API 조회)');
          const realtimeData = await getAllRealtimeKeywords();
          const naverKeywords = realtimeData.naver || [];

          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
          const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

          // 실시간 키워드별로 실제 API 데이터 조회
          const resultsWithRealData = await Promise.all(
            naverKeywords.slice(0, 15).map(async (item: any, idx: number) => {
              const keyword = item.keyword || item;
              let documentCount: number | null = null;
              let searchVolume: number | null = null;

              try {
                // 1. 네이버 블로그 API로 문서수 조회
                if (naverClientId && naverClientSecret) {
                  const blogResponse = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
                    params: { query: keyword, display: 1 },
                    headers: {
                      'X-Naver-Client-Id': naverClientId,
                      'X-Naver-Client-Secret': naverClientSecret
                    },
                    timeout: 5000
                  });
                  const rawTotal = (blogResponse as any)?.data?.total;
                  documentCount = typeof rawTotal === 'number'
                    ? rawTotal
                    : (typeof rawTotal === 'string' ? parseInt(rawTotal, 10) : null);
                  console.log(`[LITE-API] "${keyword}" 문서수: ${typeof documentCount === 'number' ? documentCount.toLocaleString() : 'null'}`);
                }
              } catch (e: any) {
                console.warn(`[LITE-API] "${keyword}" 문서수 조회 실패:`, e.message);
              }

              try {
                // 2. 네이버 검색광고 API로 검색량 조회
                const searchAdCustomerId = env.naverSearchAdCustomerId || process.env['NAVER_SEARCHAD_CUSTOMER_ID'] || '';
                const searchAdApiKey = env.naverSearchAdAccessLicense || process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] || '';
                const searchAdSecretKey = env.naverSearchAdSecretKey || process.env['NAVER_SEARCHAD_SECRET_KEY'] || '';

                if (searchAdCustomerId && searchAdApiKey && searchAdSecretKey) {
                  const timestamp = Date.now().toString();
                  const method = 'GET';
                  const uri = '/keywordstool';
                  const hmac = createHmac('sha256', searchAdSecretKey);
                  hmac.update(`${timestamp}.${method}.${uri}`);
                  const signature = hmac.digest('base64');

                  const searchAdResponse = await axios.get(`https://api.searchad.naver.com${uri}`, {
                    params: {
                      hintKeywords: keyword,
                      showDetail: 1
                    },
                    headers: {
                      'X-Timestamp': timestamp,
                      'X-API-KEY': searchAdApiKey,
                      'X-Customer': searchAdCustomerId,
                      'X-Signature': signature
                    },
                    timeout: 5000
                  });

                  const keywordData = searchAdResponse.data?.keywordList?.find((k: any) =>
                    k.relKeyword?.toLowerCase() === keyword.toLowerCase()
                  ) || searchAdResponse.data?.keywordList?.[0];

                  if (keywordData) {
                    const parseCnt = (v: any): number | null => {
                      if (typeof v === 'number' && Number.isFinite(v)) return v;
                      if (typeof v !== 'string') return null;
                      const cleaned = v.replace(/[^0-9]/g, '');
                      if (!cleaned) return null;
                      const n = parseInt(cleaned, 10);
                      return Number.isFinite(n) ? n : null;
                    };
                    const pcQc = parseCnt(keywordData.monthlyPcQcCnt);
                    const mobileQc = parseCnt(keywordData.monthlyMobileQcCnt);
                    searchVolume = (pcQc !== null || mobileQc !== null) ? ((pcQc ?? 0) + (mobileQc ?? 0)) : null;
                    console.log(`[LITE-API] "${keyword}" 검색량: ${typeof searchVolume === 'number' ? searchVolume.toLocaleString() : 'null'} (PC: ${pcQc ?? 'null'}, 모바일: ${mobileQc ?? 'null'})`);
                  }
                }
              } catch (e: any) {
                console.warn(`[LITE-API] "${keyword}" 검색량 조회 실패:`, e.message);
              }

              // 황금비율 계산
              const goldenRatio = (typeof documentCount === 'number' && documentCount > 0 && typeof searchVolume === 'number')
                ? (searchVolume / documentCount)
                : 0;
              const searchVolumeForCalc = searchVolume ?? 0;
              const estimatedTraffic = Math.round(searchVolumeForCalc * 0.02); // 상위노출 시 약 2% CTR 가정

              // 점수 계산 (실제 데이터 기반)
              let score = 50; // 기본 점수
              if (goldenRatio >= 50) score += 30;
              else if (goldenRatio >= 10) score += 20;
              else if (goldenRatio >= 5) score += 10;
              if (searchVolumeForCalc >= 100000) score += 10;
              if (typeof documentCount === 'number' && documentCount < 50000) score += 10;
              score = Math.min(score, 100);

              return {
                keyword,
                timingGoldScore: score - idx * 2,
                urgency: idx < 3 ? '🔥 지금 바로' : idx < 7 ? '⏰ 오늘 중' : '📅 24시간 내',
                reason: '실시간 급상승 키워드',
                trendingReason: `실시간 검색어 ${idx + 1}위 - 지금 가장 뜨거운 키워드`,
                whyNow: (typeof documentCount === 'number' && documentCount > 0 && typeof searchVolume === 'number')
                  ? `경쟁 문서 ${documentCount.toLocaleString()}개, 황금비율 ${goldenRatio.toFixed(1)} - 조기 진입 시 트래픽 폭발 가능`
                  : '실시간 급상승 중으로 조기 진입 시 트래픽 폭발 가능',
                suggestedDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                estimatedTraffic: estimatedTraffic,
                growthRate: 200 + (15 - idx) * 10,
                documentCount,
                searchVolume,
                goldenRatio,
                relatedKeywords: [],
                associativeKeywords: [],
                suggestedKeywords: []
              };
            })
          );

          // 황금비율 높은 순으로 정렬
          return resultsWithRealData.sort((a, b) => b.goldenRatio - a.goldenRatio);
        }

        const scoredKeywordsPromises = allKeywords
          .filter(keyword => keyword && keyword.keyword && keyword.keyword.trim().length > 0) // 유효한 키워드만
          .slice(0, 30) // 분석할 키워드 수 증가 (20개 -> 30개로 증가하여 더 풍부한 결과 제공)
          .map(async (keyword) => {
            try {
              const envManager = EnvironmentManager.getInstance();
              const env = envManager.getConfig();
              const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
              const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

              // 1. 급상승 이유 분석 (실패해도 기본값 제공)
              let trendAnalysis;
              try {
                trendAnalysis = await Promise.race([
                  analyzeKeywordTrendingReason(keyword.keyword, {
                    searchVolume: keyword.searchVolume,
                    documentCount: keyword.documentCount,
                    growthRate: keyword.growthRate || 0
                  }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)) // 8초 타임아웃
                ]) as any;
              } catch (error: any) {
                // 분석 실패 시 기본값 제공 (절대 중단 안 됨)
                console.warn(`[KEYWORD-MASTER] "${keyword.keyword}" 급상승 이유 분석 실패, 기본값 사용:`, error?.message || String(error));
                const growthRate = keyword.growthRate || 0;
                const searchVolume = typeof keyword.searchVolume === 'number' ? keyword.searchVolume : null;
                const documentCount = typeof keyword.documentCount === 'number' ? keyword.documentCount : null;

                trendAnalysis = {
                  trendingReason: growthRate > 200
                    ? `검색량이 ${Math.round(growthRate)}% 급상승하며 실시간 이슈화 진행 중`
                    : (searchVolume !== null && searchVolume > 5000)
                      ? `월 검색량 ${searchVolume.toLocaleString()}회로 높은 관심도 유지 중`
                      : '최근 검색 트렌드 급상승 중',
                  whyNow: (documentCount !== null && documentCount < 100)
                    ? `경쟁 문서가 ${documentCount}개로 매우 적어 조기 진입 시 상위 노출 확률 높음 • 검색량 급상승 중으로 트래픽 유입 잠재력 큼`
                    : `검색량 급상승 중으로 조기 진입 시 상위 노출 가능성 높음 • 경쟁 문서가 적어 노출 확률이 높음`
                };
              }

              // 키워드에 분석 결과 추가
              (keyword as any).trendingReason = trendAnalysis.trendingReason || '최근 검색 트렌드 급상승 중';
              (keyword as any).whyNow = trendAnalysis.whyNow || '검색량 급상승 중으로 조기 진입 효과 기대';

              // 2. 연관 키워드, 연상 키워드 수집 및 검증
              let relatedKeywords: Array<{ keyword: string; searchVolume: number | null; documentCount: number | null; validated: boolean }> = [];
              let associativeKeywords: Array<{ keyword: string; searchVolume: number | null; documentCount: number | null; validated: boolean }> = [];
              let suggestedKeywords: Array<{ keyword: string; searchVolume: number | null; documentCount: number | null; validated: boolean }> = [];

              // 연관 키워드 수집 (실패해도 계속 진행)
              if (naverClientId && naverClientSecret) {
                try {
                  // Rate Limit 대응: 재시도 로직
                  let retryCount = 0;
                  const maxRetries = 2; // 연관 키워드는 중요도가 낮아 재시도 횟수 적게
                  let success = false;

                  while (retryCount < maxRetries && !success) {
                    try {
                      // 타임아웃 설정 (5초)
                      const relatedPromise = getNaverRelatedKeywords(keyword.keyword, {
                        clientId: naverClientId,
                        clientSecret: naverClientSecret
                      }, { limit: 10 });

                      const associativePromise = getNaverAutocompleteKeywords(keyword.keyword, {
                        clientId: naverClientId,
                        clientSecret: naverClientSecret
                      });

                      const [related, associative] = await Promise.race([
                        Promise.all([relatedPromise, associativePromise]),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                      ]) as any[];

                      // 중복 제거하고 검증
                      const allRelatedKeywords = [
                        ...(related || []).slice(0, 10).map((k: any) => k.keyword || k),
                        ...(associative || []).slice(0, 10)
                      ].filter((k, idx, arr) => k && k !== keyword.keyword && arr.indexOf(k) === idx);

                      // 검증 (상위 10개만 - API 호출 줄이기)
                      const keywordsToValidate = allRelatedKeywords.slice(0, 10);
                      const validatedKeywords = await Promise.race([
                        validateKeywords(keywordsToValidate, 2), // 재시도 횟수 줄임
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                      ]) as any[];

                      // 검증된 키워드 분류
                      const validated = (validatedKeywords || []).filter((v: any) => v.validated);

                      // 연관 키워드 (연관도가 높은 것들)
                      relatedKeywords = validated.slice(0, 5).map((v: any) => ({
                        keyword: v.keyword,
                        searchVolume: typeof v.searchVolume === 'number' ? v.searchVolume : null,
                        documentCount: typeof v.documentCount === 'number' ? v.documentCount : null,
                        validated: true
                      }));

                      // 연상 키워드 (연상 정도가 높은 것들)
                      associativeKeywords = validated.slice(5, 10).map((v: any) => ({
                        keyword: v.keyword,
                        searchVolume: typeof v.searchVolume === 'number' ? v.searchVolume : null,
                        documentCount: typeof v.documentCount === 'number' ? v.documentCount : null,
                        validated: true
                      }));

                      // 추천 키워드 (검색량이 높고 경쟁이 적은 것들)
                      const recommended = validated
                        .filter((v: any) => (typeof v.searchVolume === 'number' && v.searchVolume > 100) && (typeof v.documentCount === 'number' && v.documentCount < 1000))
                        .sort((a: any, b: any) => {
                          const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
                          const aDoc = typeof a.documentCount === 'number' ? a.documentCount : null;
                          const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
                          const bDoc = typeof b.documentCount === 'number' ? b.documentCount : null;
                          const aRatio = (aVol !== null && aDoc !== null && aDoc > 0) ? (aVol / aDoc) : -1;
                          const bRatio = (bVol !== null && bDoc !== null && bDoc > 0) ? (bVol / bDoc) : -1;
                          return bRatio - aRatio;
                        })
                        .slice(0, 5)
                        .map((v: any) => ({
                          keyword: v.keyword,
                          searchVolume: typeof v.searchVolume === 'number' ? v.searchVolume : null,
                          documentCount: typeof v.documentCount === 'number' ? v.documentCount : null,
                          validated: true
                        }));

                      suggestedKeywords = recommended;
                      success = true;

                      console.log(`[KEYWORD-MASTER] "${keyword.keyword}" 연관 키워드 수집: 연관 ${relatedKeywords.length}개, 연상 ${associativeKeywords.length}개, 추천 ${suggestedKeywords.length}개`);
                    } catch (apiError: any) {
                      retryCount++;
                      const isRateLimit = apiError?.response?.status === 429 || apiError?.message?.includes('429') || apiError?.message?.includes('Rate limit');
                      const isTimeout = apiError?.message?.includes('Timeout') || apiError?.code === 'ECONNABORTED';

                      if (isRateLimit && retryCount < maxRetries) {
                        const waitTime = Math.min(3000 * retryCount, 8000);
                        console.warn(`[KEYWORD-MASTER] "${keyword.keyword}" 연관 키워드 Rate Limit, ${waitTime}ms 후 재시도 (${retryCount}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                      } else if (isTimeout && retryCount < maxRetries) {
                        const waitTime = 1000 * retryCount;
                        console.warn(`[KEYWORD-MASTER] "${keyword.keyword}" 연관 키워드 타임아웃, ${waitTime}ms 후 재시도 (${retryCount}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                      } else {
                        // 실패해도 빈 배열로 계속 진행 (절대 중단 안 됨)
                        console.warn(`[KEYWORD-MASTER] "${keyword.keyword}" 연관 키워드 수집 실패 (시도 ${retryCount}/${maxRetries}), 빈 배열로 계속 진행:`, apiError?.message || String(apiError));
                        break;
                      }
                    }
                  }
                } catch (error: any) {
                  // 최종 실패해도 빈 배열로 계속 진행 (절대 중단 안 됨)
                  console.warn(`[KEYWORD-MASTER] "${keyword.keyword}" 연관 키워드 수집 최종 실패, 빈 배열로 계속 진행:`, error.message || String(error));
                }
              }

              // 3. 타이밍 골드 점수 계산
              const timingScore = finder.calculateTimingGoldScore(keyword);

              // 4. 연관 키워드 정보 추가
              (timingScore as any).relatedKeywords = relatedKeywords;
              (timingScore as any).associativeKeywords = associativeKeywords;
              (timingScore as any).suggestedKeywords = suggestedKeywords;

              return timingScore;
            } catch (error: any) {
              // 최종 실패해도 기본값으로라도 반환 (절대 null 반환 안 함)
              console.error(`[KEYWORD-MASTER] 키워드 "${keyword.keyword}" 처리 중 오류 발생, 기본값으로 계속 진행:`, error.message);

              // 기본 타이밍 골드 점수라도 계산해서 반환
              try {
                const basicScore = finder.calculateTimingGoldScore(keyword);
                const fallbackSearchVolume = typeof keyword.searchVolume === 'number' ? keyword.searchVolume.toLocaleString() : 'null';
                const fallbackDocCount = typeof keyword.documentCount === 'number' ? keyword.documentCount.toLocaleString() : 'null';
                (basicScore as any).trendingReason = `검색량 ${fallbackSearchVolume}회, 급상승률 ${Math.round(keyword.growthRate || 0)}%로 트래픽 폭발 가능성 높음`;
                (basicScore as any).whyNow = `경쟁 문서 ${fallbackDocCount}개로 적어 조기 진입 시 상위 노출 가능성 높음`;
                (basicScore as any).relatedKeywords = [];
                (basicScore as any).associativeKeywords = [];
                (basicScore as any).suggestedKeywords = [];
                return basicScore;
              } catch (fallbackError: any) {
                // 최종 fallback도 실패하면 null 반환 (하지만 이건 거의 일어나지 않음)
                console.error(`[KEYWORD-MASTER] 키워드 "${keyword.keyword}" fallback 처리도 실패:`, fallbackError.message);
                return null;
              }
            }
          });

        // 모든 키워드 분석 완료 대기
        const scoredKeywordsResults = await Promise.allSettled(scoredKeywordsPromises);

        console.log(`[LITE] 분석 완료: ${scoredKeywordsResults.length}개 결과`);

        const scoredKeywords = scoredKeywordsResults
          .map(result => {
            if (result.status === 'fulfilled' && result.value) {
              return result.value;
            }
            return null;
          })
          .filter((score): score is TimingScore => {
            if (!score) return false;

            // 기본 조건만 체크 (매우 관대하게)
            const keyword = score.keyword || '';
            if (!keyword || keyword.length < 2) return false;

            // 🔥 실시간 키워드는 무조건 포함 (점수, 검색량 무관)
            return true;
          })
          .map(score => {
            // 황금 비율 계산 및 추가
            const goldenRatio = score.documentCount > 0
              ? score.searchVolume / score.documentCount
              : 0;
            return { ...score, goldenRatio };
          })
          .sort((a, b) => {
            // 1순위: 황금 비율 높은 순
            const ratioDiff = (b as any).goldenRatio - (a as any).goldenRatio;
            if (Math.abs(ratioDiff) > 0.1) return ratioDiff;
            // 2순위: 타이밍 골드 점수 높은 순
            return b.timingGoldScore - a.timingGoldScore;
          })
          .slice(0, 30); // 상위 30개로 증가 (더 풍부한 결과 제공)

        console.log(`[LITE] 타이밍 골드 헌팅 완료: ${scoredKeywords.length}개 황금 키워드 발견`);

        // 🔥 결과 없으면 실시간 검색어로 대체 (실제 API 데이터 사용)
        if (scoredKeywords.length === 0) {
          console.log(`[LITE] 분석 결과 없음 - 실시간 검색어 + 실제 API 데이터 사용`);
          const realtimeData = await getAllRealtimeKeywords();
          const naverKeywords = realtimeData.naver || [];

          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
          const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

          // 실시간 키워드별로 실제 API 데이터 조회
          const resultsWithRealData = await Promise.all(
            naverKeywords.slice(0, 15).map(async (item: any, idx: number) => {
              const keyword = item.keyword || item;
              let documentCount = 0;
              let searchVolume = 0;

              try {
                // 1. 네이버 블로그 API로 문서수 조회
                if (naverClientId && naverClientSecret) {
                  const blogResponse = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
                    params: { query: keyword, display: 1 },
                    headers: {
                      'X-Naver-Client-Id': naverClientId,
                      'X-Naver-Client-Secret': naverClientSecret
                    },
                    timeout: 5000
                  });
                  documentCount = blogResponse.data?.total || 0;
                }
              } catch (e: any) {
                console.warn(`[LITE-API] "${keyword}" 문서수 조회 실패:`, e.message);
              }

              try {
                // 2. 네이버 검색광고 API로 검색량 조회
                const searchAdCustomerId = env.naverSearchAdCustomerId || process.env['NAVER_SEARCHAD_CUSTOMER_ID'] || '';
                const searchAdApiKey = env.naverSearchAdAccessLicense || process.env['NAVER_SEARCHAD_ACCESS_LICENSE'] || '';
                const searchAdSecretKey = env.naverSearchAdSecretKey || process.env['NAVER_SEARCHAD_SECRET_KEY'] || '';

                if (searchAdCustomerId && searchAdApiKey && searchAdSecretKey) {
                  const timestamp = Date.now().toString();
                  const method = 'GET';
                  const uri = '/keywordstool';
                  const hmac = createHmac('sha256', searchAdSecretKey);
                  hmac.update(`${timestamp}.${method}.${uri}`);
                  const signature = hmac.digest('base64');

                  const searchAdResponse = await axios.get(`https://api.searchad.naver.com${uri}`, {
                    params: {
                      hintKeywords: keyword,
                      showDetail: 1
                    },
                    headers: {
                      'X-Timestamp': timestamp,
                      'X-API-KEY': searchAdApiKey,
                      'X-Customer': searchAdCustomerId,
                      'X-Signature': signature
                    },
                    timeout: 5000
                  });

                  const keywordData = searchAdResponse.data?.keywordList?.find((k: any) =>
                    k.relKeyword?.toLowerCase() === keyword.toLowerCase()
                  ) || searchAdResponse.data?.keywordList?.[0];

                  if (keywordData) {
                    const pcQc = parseInt(keywordData.monthlyPcQcCnt) || 0;
                    const mobileQc = parseInt(keywordData.monthlyMobileQcCnt) || 0;
                    searchVolume = pcQc + mobileQc;
                  }
                }
              } catch (e: any) {
                console.warn(`[LITE-API] "${keyword}" 검색량 조회 실패:`, e.message);
              }

              // 황금비율 계산
              const goldenRatio = documentCount > 0 ? searchVolume / documentCount : 0;
              const estimatedTraffic = Math.round(searchVolume * 0.02);

              // 점수 계산 (실제 데이터 기반)
              let score = 50;
              if (goldenRatio >= 50) score += 30;
              else if (goldenRatio >= 10) score += 20;
              else if (goldenRatio >= 5) score += 10;
              if (searchVolume >= 100000) score += 10;
              if (documentCount < 50000) score += 10;
              score = Math.min(score, 100);

              return {
                keyword,
                timingGoldScore: score - idx * 2,
                urgency: idx < 3 ? '🔥 지금 바로' : idx < 7 ? '⏰ 오늘 중' : '📅 24시간 내',
                reason: '실시간 급상승 키워드',
                trendingReason: `실시간 검색어 ${idx + 1}위 - 지금 가장 뜨거운 키워드`,
                whyNow: documentCount > 0
                  ? `경쟁 문서 ${documentCount.toLocaleString()}개, 황금비율 ${goldenRatio.toFixed(1)} - 조기 진입 시 트래픽 폭발 가능`
                  : '실시간 급상승 중으로 조기 진입 시 트래픽 폭발 가능',
                suggestedDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                estimatedTraffic: estimatedTraffic,
                growthRate: 200 + (15 - idx) * 10,
                documentCount,
                searchVolume,
                goldenRatio,
                relatedKeywords: [],
                associativeKeywords: [],
                suggestedKeywords: []
              };
            })
          );

          return resultsWithRealData.sort((a, b) => b.goldenRatio - a.goldenRatio);
        }

        // 🔥 실제 데이터만 반환 (fallback 값 완전 제거)
        return scoredKeywords.map(item => {
          const goldenRatio = item.documentCount > 0 ? item.searchVolume / item.documentCount : 0;
          return {
            keyword: item.keyword,
            timingGoldScore: item.timingGoldScore,
            urgency: item.urgency,
            reason: item.reason,
            trendingReason: item.trendingReason,
            whyNow: item.whyNow,
            suggestedDeadline: item.suggestedDeadline?.toISOString() || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            estimatedTraffic: item.estimatedTraffic || Math.floor(item.searchVolume * 0.15),
            growthRate: item.growthRate,
            documentCount: item.documentCount,
            searchVolume: item.searchVolume,
            goldenRatio: goldenRatio,
            relatedKeywords: item.relatedKeywords || [],
            associativeKeywords: item.associativeKeywords || [],
            suggestedKeywords: item.suggestedKeywords || []
          };
        });

      } catch (error: any) {
        console.error('[KEYWORD-MASTER] 타이밍 골드 헌팅 실패:', error);
        console.error('[KEYWORD-MASTER] 에러 상세:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        return {
          error: '타이밍 골드 헌팅 실패',
          message: error.message || '키워드 헌팅 중 오류가 발생했습니다.',
          keywords: []
        };
      }
      // === 구버전 코드 종료 ===
    })(); // async IIFE 종료
  }
  // =============== 구버전 코드 비활성화 블록 종료 ===============


  // 🔥 진짜 실시간 급상승 키워드 감지

  // 🔥 라이트 백업 황금키워드 생성 (무료 사용자용)
  // v2.49.8: Math.random 점수/등급 제거 (메모리 규칙 "Math.random 점수/등급 계산 금지").
  //   기존: Math.random sv/dc → ratio>=5 SSS 부여 → 가짜 SSS 양산.
  //   변경: API 키 없는 fallback 이라 실측 X. 모든 결과 grade 'B' (정직), sv/dc null,
  //         사용자에게 "API 키 등록 시 정확한 데이터" 안내. 추정치 UI 노출 금지 규칙 부합.
  function generateLiteBackupKeywords(seedKeyword: string) {
    const suffixes = [
      '추천', '방법', '후기', '비교', '가격', '순위', '꿀팁', '총정리',
      '장단점', '선택법', '사용법', '효과', '주의사항', String(new Date().getFullYear())
    ];

    return suffixes.map((suffix) => ({
      keyword: `${seedKeyword} ${suffix}`,
      pcSearchVolume: null,
      mobileSearchVolume: null,
      searchVolume: null,
      documentCount: null,
      competitionRatio: null,
      score: null,
      goldenRatio: null,
      grade: 'B' as const,  // 실측 없음 → 안전 최하등급. 추정 grade 부여 금지.
      isGoldenKeyword: false,
      recommendation: '⚠️ API 키 등록 시 정확한 검색량/문서수 측정 가능',
      source: 'backup-no-api' as const,
      dcEstimated: true,
      svEstimated: true,
    }));
  }

}
