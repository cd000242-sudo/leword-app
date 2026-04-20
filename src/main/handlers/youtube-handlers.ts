// 유튜브 핸들러 (v2.9 — 황금키워드 → 숏츠 벤치마킹으로 전환)
import { ipcMain } from 'electron';
import { EnvironmentManager } from '../../utils/environment-manager';
import { checkUnlimitedLicense } from './shared';
import { getYouTubeTrending } from '../../utils/youtube-data-api';
import {
  analyzeTitlePatterns,
  aggregateTrendDashboard,
  generateGoldenKeywords,
  crossReferenceWithNaver,
} from '../../utils/youtube-trend-analyzer';
import { getTrendingShorts, ShortsQuery } from '../../utils/youtube-shorts-benchmarker';

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
    clientSecret: env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
  };
}

function licenseGate() {
  const licenseCheck = checkUnlimitedLicense();
  if (!licenseCheck.allowed) {
    return {
      error: true,
      requiresUnlimited: true,
      message: '이 기능은 프리미엄 사용자만 사용할 수 있습니다.',
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
  // 유튜브 황금키워드 (추가 기능 섹션)
  ipcMain.handle('youtube-golden-keywords', async (_event, params: { maxResults?: number }) => {
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
        maxResults: params?.maxResults || 50,
      });
      const videos = trendingResult.videos;
      const dashboard = aggregateTrendDashboard(videos);
      const titlePatterns = analyzeTitlePatterns(videos);
      const goldenKeywords = generateGoldenKeywords(dashboard, titlePatterns, videos);

      const naverConfig = getNaverConfig();
      let crossAnalysis = null;
      if (naverConfig.clientId && naverConfig.clientSecret) {
        try {
          const topKws = goldenKeywords.slice(0, 20).map((k: any) => k.keyword);
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

  console.log('[YOUTUBE] youtube-golden-keywords 핸들러 등록 완료');

  // 🎬 유튜브 숏츠 벤치마킹 — 따라 만들면 성공할 숏츠 발굴
  if (!ipcMain.listenerCount('youtube-shorts-benchmark')) {
    ipcMain.handle('youtube-shorts-benchmark', async (_event, params: ShortsQuery = {}) => {
      console.log('[YOUTUBE] youtube-shorts-benchmark 요청:', params);

      const denied = licenseGate();
      if (denied) return denied;

      const apiKey = getYouTubeApiKey();
      if (!apiKey) {
        return { error: true, message: 'YouTube API 키가 설정되지 않았습니다.' };
      }

      try {
        const items = await getTrendingShorts({
          period: params?.period || '24h',
          categoryId: params?.categoryId || undefined,
          maxResults: params?.maxResults || 30,
          sort: params?.sort || 'score',
        });
        const avgScore = items.length > 0
          ? Math.round(items.reduce((a, b) => a + b.benchmarkScore, 0) / items.length * 10) / 10
          : 0;
        // TOP 채널 (빈도)
        const channelFreq = new Map<string, number>();
        for (const it of items) channelFreq.set(it.channelTitle, (channelFreq.get(it.channelTitle) || 0) + 1);
        const topChannel = Array.from(channelFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
        return {
          success: true,
          data: {
            items,
            total: items.length,
            avgScore,
            topChannel,
            period: params?.period || '24h',
          },
        };
      } catch (err: any) {
        console.error('[YOUTUBE] youtube-shorts-benchmark 오류:', err.message);
        return quotaError(err) || { error: true, message: err?.message || '숏츠 수집 중 오류가 발생했습니다.' };
      }
    });
    console.log('[YOUTUBE] youtube-shorts-benchmark 핸들러 등록 완료');
  }
}
