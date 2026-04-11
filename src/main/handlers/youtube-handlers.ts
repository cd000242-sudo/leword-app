// YouTube 심층 분석 핸들러
import { ipcMain } from 'electron';
import { EnvironmentManager } from '../../utils/environment-manager';
import { checkUnlimitedLicense } from './shared';
import { searchYouTubeVideos, getYouTubeTrending, analyzeVideoComments } from '../../utils/youtube-data-api';
import {
  runFullAnalysis,
  analyzeTitlePatterns,
  scoreContentOpportunity,
  extractDemandSignals,
  generateBenchmark,
  aggregateTrendDashboard,
  generateGoldenKeywords,
  crossReferenceWithNaver
} from '../../utils/youtube-trend-analyzer';

function getYouTubeApiKey(): string {
  const envManager = EnvironmentManager.getInstance();
  const env = envManager.getConfig();
  return env.youtubeApiKey || process.env['YOUTUBE_API_KEY'] || '';
}

function getNaverConfig(): { clientId: string; clientSecret: string } {
  const envManager = EnvironmentManager.getInstance();
  const env = envManager.getConfig();
  return {
    clientId: env.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
    clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || ''
  };
}

function licenseGate() {
  const licenseCheck = checkUnlimitedLicense();
  if (!licenseCheck.allowed) {
    return {
      error: true,
      requiresUnlimited: true,
      message: '이 기능은 프리미엄 사용자만 사용할 수 있습니다.'
    };
  }
  return null;
}

function quotaError(err: any) {
  if (err?.message?.includes('quota') || err?.message?.includes('403')) {
    return { error: false, quotaExceeded: true, videos: [] };
  }
  return null;
}

export function registerYouTubeAnalysisHandlers(): void {

  // 1. 원클릭 심층 분석
  ipcMain.handle('youtube-trend-analysis', async (_event, params: {
    keyword?: string;
    maxResults?: number;
    categoryId?: string;
  }) => {
    console.log('[YOUTUBE] youtube-trend-analysis 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const naverConfig = getNaverConfig();
      const result = await runFullAnalysis({
        apiKey,
        keyword: params.keyword,
        maxResults: params.maxResults,
        naverClientId: naverConfig.clientId,
        naverClientSecret: naverConfig.clientSecret
      });
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-trend-analysis 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || 'YouTube 심층 분석 중 오류가 발생했습니다.' };
    }
  });

  // 2. 제목 패턴 분석
  ipcMain.handle('youtube-title-patterns', async (_event, params: {
    keyword?: string;
    maxResults?: number;
  }) => {
    console.log('[YOUTUBE] youtube-title-patterns 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const searchResult = await searchYouTubeVideos({
        apiKey,
        keyword: params.keyword || '',
        maxResults: params.maxResults || 50
      });
      const result = analyzeTitlePatterns(searchResult.videos);
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-title-patterns 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || '제목 패턴 분석 중 오류가 발생했습니다.' };
    }
  });

  // 3. 콘텐츠 기회 분석
  ipcMain.handle('youtube-content-opportunity', async (_event, params: {
    keyword: string;
    maxResults?: number;
  }) => {
    console.log('[YOUTUBE] youtube-content-opportunity 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const searchResult = await searchYouTubeVideos({
        apiKey,
        keyword: params.keyword,
        maxResults: params.maxResults || 50
      });
      const result = scoreContentOpportunity(searchResult.videos, params.keyword);
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-content-opportunity 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || '콘텐츠 기회 분석 중 오류가 발생했습니다.' };
    }
  });

  // 4. 시청자 수요 분석
  ipcMain.handle('youtube-demand-signals', async (_event, params: {
    videoId: string;
  }) => {
    console.log('[YOUTUBE] youtube-demand-signals 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const commentResult = await analyzeVideoComments({
        apiKey,
        videoId: params.videoId,
        maxComments: 200
      });
      // topComments는 10개뿐이므로, keywords에서 추출된 전체 데이터 + topComments 결합
      const allCommentData = commentResult.topComments.map(c => ({ text: c.text, likeCount: c.likeCount }));
      // keywords에서 수요 키워드 추가 보강
      const keywordBoost = commentResult.keywords
        .filter(kw => kw.count >= 2)
        .map(kw => ({ text: kw.word, likeCount: kw.count }));
      const result = extractDemandSignals([...allCommentData, ...keywordBoost]);
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-demand-signals 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || '시청자 수요 분석 중 오류가 발생했습니다.' };
    }
  });

  // 5. 벤치마크
  ipcMain.handle('youtube-benchmark', async (_event, params: {
    keyword: string;
    maxResults?: number;
  }) => {
    console.log('[YOUTUBE] youtube-benchmark 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const searchResult = await searchYouTubeVideos({
        apiKey,
        keyword: params.keyword,
        maxResults: params.maxResults || 50
      });
      const result = generateBenchmark(searchResult.videos);
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-benchmark 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || '벤치마크 생성 중 오류가 발생했습니다.' };
    }
  });

  // 6. 황금키워드 생성
  ipcMain.handle('youtube-golden-keywords', async (_event, params: {
    maxResults?: number;
  }) => {
    console.log('[YOUTUBE] youtube-golden-keywords 요청:', params);

    const denied = licenseGate();
    if (denied) return denied;

    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
      return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
    }

    try {
      const trendingResult = await getYouTubeTrending({
        apiKey,
        maxResults: params.maxResults || 50
      });
      const videos = trendingResult.videos;
      const dashboard = aggregateTrendDashboard(videos);
      const titlePatterns = analyzeTitlePatterns(videos);
      const goldenKeywords = generateGoldenKeywords(dashboard, titlePatterns, videos);

      const naverConfig = getNaverConfig();
      let crossAnalysis = null;
      if (naverConfig.clientId && naverConfig.clientSecret) {
        try {
          const topKws = goldenKeywords.slice(0, 20).map(k => k.keyword);
          crossAnalysis = await crossReferenceWithNaver(
            topKws,
            { clientId: naverConfig.clientId, clientSecret: naverConfig.clientSecret },
            videos
          );
        } catch (e) {
          console.warn('[YOUTUBE] 네이버 교차 분석 실패:', e);
        }
      }
      return { success: true, data: { dashboard, titlePatterns, goldenKeywords, crossAnalysis } };
    } catch (err: any) {
      console.error('[YOUTUBE] youtube-golden-keywords 오류:', err.message);
      return quotaError(err) || { error: true, message: err?.message || '황금키워드 생성 중 오류가 발생했습니다.' };
    }
  });
}
