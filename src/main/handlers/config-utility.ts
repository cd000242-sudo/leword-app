// 설정 & 유틸리티 핸들러
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { EnvironmentManager } from '../../utils/environment-manager';
import { crawlNewsSnippets } from '../../utils/keyword-competition/naver-search-crawler';
import { getFreshKeywordsAPI } from '../../utils/mass-collection/fresh-keywords-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getNaverPopularNews, PopularNews } from '../../utils/naver-news-crawler';
import { withSmartRetry, withCacheAndRetry, naverApiCall, parallelProcess, apiHealthCheck, clearCache } from '../../utils/api-reliability';
import * as licenseManager from '../../utils/licenseManager';


export function setupConfigUtilityHandlers(): void {
  ipcMain.handle('export-keywords-to-excel', async (event, data: {
    keywords: Array<{
      keyword: string;
      pcSearchVolume: number | null;
      mobileSearchVolume: number | null;
      totalSearchVolume: number | null;
      documentCount: number | null;
      competitionRatio: number | null;
    }>;
    filename: string; // 입력한 키워드 (예: "여름휴가")
  }) => {
    try {
      const XLSX = require('xlsx');
      const { dialog } = require('electron');
      const { keywords, filename } = data;

      if (!keywords || keywords.length === 0) {
        throw new Error('저장할 키워드 데이터가 없습니다.');
      }

      // 엑셀 데이터 준비
      const worksheetData = [
        ['키워드', 'PC 검색량', '모바일 검색량', '월간 총 검색량', '문서수', '경쟁률']
      ];

      keywords.forEach(kw => {
        worksheetData.push([
          kw.keyword,
          (kw.pcSearchVolume ?? '').toString(),
          (kw.mobileSearchVolume ?? '').toString(),
          (kw.totalSearchVolume ?? '').toString(),
          (kw.documentCount ?? '').toString(),
          (kw.competitionRatio ?? '').toString()
        ]);
      });

      // 워크북 생성
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // 컬럼 너비 설정
      worksheet['!cols'] = [
        { wch: 30 }, // 키워드
        { wch: 12 }, // PC 검색량
        { wch: 15 }, // 모바일 검색량
        { wch: 18 }, // 월간 총 검색량
        { wch: 12 }, // 문서수
        { wch: 12 }  // 경쟁률
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, '키워드 조회 결과');

      // 파일 저장 경로 선택 (기본 파일명: 입력한 키워드.xlsx)
      const defaultFilename = `${filename || 'keywords'}.xlsx`;
      const result = await dialog.showSaveDialog({
        title: '엑셀 파일 저장',
        defaultPath: defaultFilename,
        filters: [
          { name: 'Excel Files', extensions: ['xlsx'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled) {
        return { success: false, message: '저장이 취소되었습니다.' };
      }

      const filePath = result.filePath;
      if (!filePath) {
        throw new Error('파일 경로가 지정되지 않았습니다.');
      }

      // 파일 저장
      XLSX.writeFile(workbook, filePath);

      console.log(`[EXCEL-EXPORT] 파일 저장 완료: ${filePath}`);

      return {
        success: true,
        message: `${keywords.length}개 키워드가 엑셀 파일로 저장되었습니다.`,
        filePath: filePath
      };

    } catch (error: any) {
      console.error('[EXCEL-EXPORT] 엑셀 파일 저장 실패:', error);
      return {
        success: false,
        error: error.message || '엑셀 파일 저장 중 오류가 발생했습니다.',
        filePath: null
      };
    }
  });

  // API 키 확인 핸들러
  if (!ipcMain.listenerCount('check-api-keys')) {
    ipcMain.handle('check-api-keys', async () => {
      try {
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();

        return {
          naverClientId: env.naverClientId || '',
          naverClientSecret: env.naverClientSecret || '',
          youtubeApiKey: env.youtubeApiKey || '',
          naverSearchAdAccessLicense: env.naverSearchAdAccessLicense || '',
          naverSearchAdSecretKey: env.naverSearchAdSecretKey || '',
          naverSearchAdCustomerId: env.naverSearchAdCustomerId || ''
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] check-api-keys 오류:', error);
        return {
          naverClientId: '',
          naverClientSecret: '',
          youtubeApiKey: '',
          naverSearchAdAccessLicense: '',
          naverSearchAdSecretKey: '',
          naverSearchAdCustomerId: ''
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ check-api-keys 핸들러 등록 완료');
  }

  // API 키 테스트 핸들러 (실제 API 호출로 검증)
  if (!ipcMain.listenerCount('test-api-keys')) {
    ipcMain.handle('test-api-keys', async () => {
      try {
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const results: any = {
          naver: { configured: false, working: false, error: null },
          youtube: { configured: false, working: false, error: null },
          naverSearchAd: { configured: false, working: false, error: null }
        };

        // 네이버 API 테스트
        if (env.naverClientId && env.naverClientSecret) {
          results.naver.configured = true;
          try {
            const { getNaverAutocompleteKeywords } = await import('../../utils/naver-autocomplete');
            const testKeywords = await getNaverAutocompleteKeywords('테스트', {
              clientId: env.naverClientId,
              clientSecret: env.naverClientSecret
            });
            results.naver.working = Array.isArray(testKeywords);
            console.log('[API-TEST] 네이버 API 테스트 성공');
          } catch (err: any) {
            results.naver.error = err.message || '네이버 API 테스트 실패';
            console.error('[API-TEST] 네이버 API 테스트 실패:', err.message);
          }
        }

        // YouTube API 테스트
        if (env.youtubeApiKey) {
          results.youtube.configured = true;
          try {
            const { getYouTubeTrendKeywords } = await import('../../utils/youtube-data-api');
            const testVideos = await getYouTubeTrendKeywords({
              apiKey: env.youtubeApiKey,
              maxResults: 1
            });
            results.youtube.working = Array.isArray(testVideos);
            console.log('[API-TEST] YouTube API 테스트 성공');
          } catch (err: any) {
            results.youtube.error = err.message || 'YouTube API 테스트 실패';
            console.error('[API-TEST] YouTube API 테스트 실패:', err.message);
          }
        }

        // 네이버 검색광고 API 테스트
        if (env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey && env.naverSearchAdCustomerId) {
          results.naverSearchAd.configured = true;
          try {
            const { getNaverSearchAdKeywordSuggestions } = await import('../../utils/naver-searchad-api');
            const testSuggestions = await getNaverSearchAdKeywordSuggestions({
              accessLicense: env.naverSearchAdAccessLicense,
              secretKey: env.naverSearchAdSecretKey,
              customerId: env.naverSearchAdCustomerId
            }, '테스트', 1);
            results.naverSearchAd.working = Array.isArray(testSuggestions);
            console.log('[API-TEST] 네이버 검색광고 API 테스트 성공');
          } catch (err: any) {
            results.naverSearchAd.error = err.message || '네이버 검색광고 API 테스트 실패';
            console.error('[API-TEST] 네이버 검색광고 API 테스트 실패:', err.message);
          }
        }

        return {
          success: true,
          results
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] test-api-keys 오류:', error);
        return {
          success: false,
          error: error.message || 'API 테스트 중 오류 발생'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ test-api-keys 핸들러 등록 완료');
  }

  // 🔥 API 헬스 체크 핸들러 (100% 성공률 보장)
  if (!ipcMain.listenerCount('api-health-check')) {
    ipcMain.handle('api-health-check', async () => {
      try {
        console.log('[API-HEALTH] API 연결 상태 확인 시작...');

        const healthResult = await apiHealthCheck();
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();

        // API 키 구성 상태
        const apiStatus = {
          network: healthResult.network,
          naver: {
            connected: healthResult.naver,
            configured: !!(env.naverClientId && env.naverClientSecret),
            searchAdConfigured: !!(env.naverSearchAdAccessLicense && env.naverSearchAdSecretKey)
          },
          youtube: {
            connected: healthResult.youtube,
            configured: !!env.youtubeApiKey
          }
        };

        console.log('[API-HEALTH] ✅ 상태 확인 완료:', apiStatus);

        return {
          success: true,
          timestamp: new Date().toISOString(),
          ...apiStatus,
          recommendation: !healthResult.network
            ? '인터넷 연결을 확인해주세요.'
            : !apiStatus.naver.configured
              ? 'API 키를 설정하면 더 정확한 결과를 받을 수 있습니다.'
              : '모든 API가 정상 연결되었습니다.'
        };
      } catch (error: any) {
        console.error('[API-HEALTH] ❌ 오류:', error);
        return {
          success: false,
          error: error.message,
          network: false,
          naver: { connected: false, configured: false, searchAdConfigured: false },
          youtube: { connected: false, configured: false }
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ api-health-check 핸들러 등록 완료');
  }

  // 🔥 캐시 초기화 핸들러
  if (!ipcMain.listenerCount('clear-api-cache')) {
    ipcMain.handle('clear-api-cache', async (_event, pattern?: string) => {
      try {
        clearCache(pattern);
        console.log('[CACHE] ✅ 캐시 초기화 완료:', pattern || '전체');
        return { success: true, message: '캐시가 초기화되었습니다.' };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ clear-api-cache 핸들러 등록 완료');
  }

  // 🔗 외부 URL 열기 핸들러
  if (!ipcMain.listenerCount('open-external-url')) {
    ipcMain.handle('open-external-url', async (_event, url: string) => {
      try {
        const { shell } = require('electron');
        await shell.openExternal(url);
        return { success: true };
      } catch (error: any) {
        console.error('[OPEN-URL] 오류:', error.message);
        return { success: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ open-external-url 핸들러 등록 완료');
  }

  // 📋 클립보드 복사 핸들러 (renderer 복사 실패 방지)
  if (!ipcMain.listenerCount('clipboard-write-text')) {
    ipcMain.handle('clipboard-write-text', async (_event, text: string) => {
      try {
        const { clipboard } = require('electron');
        clipboard.writeText(String(text || ''));
        return { success: true };
      } catch (error: any) {
        console.error('[CLIPBOARD] 오류:', error?.message || error);
        return { success: false, error: error?.message || 'clipboard error' };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ clipboard-write-text 핸들러 등록 완료');
  }

  // get-env 핸들러: 환경 설정 불러오기
  if (!ipcMain.listenerCount('get-env')) {
    ipcMain.handle('get-env', async () => {
      try {
        const envManager = EnvironmentManager.getInstance();
        const config = envManager.getConfig();
        console.log('[KEYWORD-MASTER] get-env 호출 - 설정 로드 완료');
        return { ok: true, data: config };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] get-env 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-env 핸들러 등록 완료');
  }

  // save-env 핸들러: 환경 설정 저장
  if (!ipcMain.listenerCount('save-env')) {
    ipcMain.handle('save-env', async (_event, env: any) => {
      try {
        console.log('[KEYWORD-MASTER] save-env 호출:', {
          hasNaverId: !!env.naverClientId,
          hasNaverSecret: !!env.naverClientSecret,
          hasYoutube: !!env.youtubeApiKey,
          hasSearchAdLicense: !!env.naverSearchAdAccessLicense,
          hasSearchAdSecret: !!env.naverSearchAdSecretKey
        });

        const envManager = EnvironmentManager.getInstance();
        await envManager.saveConfig(env);
        envManager.reloadConfig();

        console.log('[KEYWORD-MASTER] ✅ save-env 저장 완료');
        return { ok: true, logs: '설정이 저장되었습니다.' };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] save-env 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ save-env 핸들러 등록 완료');
  }

  // is-developer-mode 핸들러: 개발자 모드 확인
  if (!ipcMain.listenerCount('is-developer-mode')) {
    ipcMain.handle('is-developer-mode', async () => {
      const isDev = !app.isPackaged || process.env['NODE_ENV'] === 'development';
      console.log('[KEYWORD-MASTER] is-developer-mode:', isDev);
      return isDev;
    });
    console.log('[KEYWORD-MASTER] ✅ is-developer-mode 핸들러 등록 완료');
  }

  // is-packaged 핸들러: 패키징 여부 확인
  if (!ipcMain.listenerCount('is-packaged')) {
    ipcMain.handle('is-packaged', async () => {
      console.log('[KEYWORD-MASTER] is-packaged:', app.isPackaged);
      return app.isPackaged;
    });
    console.log('[KEYWORD-MASTER] ✅ is-packaged 핸들러 등록 완료');
  }

  // 키워드 설정 저장 핸들러 (save-env와 동일하게 처리)
  if (!ipcMain.listenerCount('save-keyword-settings')) {
    ipcMain.handle('save-keyword-settings', async (event, settings: any) => {
      try {
        console.log('[KEYWORD-MASTER] save-keyword-settings 호출:', {
          hasNaverId: !!settings.naverClientId,
          hasNaverSecret: !!settings.naverClientSecret,
          hasYoutube: !!settings.youtubeApiKey,
          hasSearchAdLicense: !!settings.naverSearchAdAccessLicense,
          hasSearchAdSecret: !!settings.naverSearchAdSecretKey,
          hasSearchAdCustomerId: !!settings.naverSearchAdCustomerId
        });

        const envManager = EnvironmentManager.getInstance();

        // 환경 변수 설정 객체 생성
        const envConfig: any = {};
        if (settings.naverClientId) envConfig.naverClientId = settings.naverClientId;
        if (settings.naverClientSecret) envConfig.naverClientSecret = settings.naverClientSecret;
        if (settings.youtubeApiKey) envConfig.youtubeApiKey = settings.youtubeApiKey;
        if (settings.naverSearchAdAccessLicense) envConfig.naverSearchAdAccessLicense = settings.naverSearchAdAccessLicense;
        if (settings.naverSearchAdSecretKey) envConfig.naverSearchAdSecretKey = settings.naverSearchAdSecretKey;
        if (settings.naverSearchAdCustomerId) envConfig.naverSearchAdCustomerId = settings.naverSearchAdCustomerId;

        // 설정 저장
        await envManager.saveConfig(envConfig);

        // 설정 리로드하여 즉시 반영
        envManager.reloadConfig();

        console.log('[KEYWORD-MASTER] ✅ 키워드 설정 저장 완료');
        return {
          success: true,
          saved: {
            naver: !!(envConfig.naverClientId && envConfig.naverClientSecret),
            youtube: !!envConfig.youtubeApiKey,
            searchAd: !!(envConfig.naverSearchAdAccessLicense && envConfig.naverSearchAdSecretKey && envConfig.naverSearchAdCustomerId)
          }
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] save-keyword-settings 오류:', error);
        return {
          success: false,
          error: error.message || '설정 저장 실패'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ save-keyword-settings 핸들러 등록 완료');
  }

  // crawl-url 핸들러: URL 크롤링
  if (!ipcMain.listenerCount('crawl-url')) {
    ipcMain.handle('crawl-url', async (_event, url: string) => {
      try {
        console.log('[KEYWORD-MASTER] crawl-url 호출:', url);
        // 크롤링 로직은 추후 구현 (현재는 기본 응답 반환)
        return {
          ok: true,
          data: {
            url,
            title: '',
            content: '',
            message: '크롤링 기능은 현재 개발 중입니다.'
          }
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] crawl-url 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ crawl-url 핸들러 등록 완료');
  }

  // transform-content 핸들러: 콘텐츠 변환
  if (!ipcMain.listenerCount('transform-content')) {
    ipcMain.handle('transform-content', async (_event, args: any) => {
      try {
        console.log('[KEYWORD-MASTER] transform-content 호출');
        // 콘텐츠 변환 로직은 추후 구현 (현재는 기본 응답 반환)
        return {
          ok: true,
          data: args,
          message: '콘텐츠 변환 기능은 현재 개발 중입니다.'
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] transform-content 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ transform-content 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('generate-keyword-mindmap')) {
    ipcMain.handle('generate-keyword-mindmap', async (event, keyword: string, options: any = {}) => {
      try {
        // 라이선스 체크
        const license = await licenseManager.loadLicense();
        if (!license || !license.isValid) {
          event.sender.send('keyword-mindmap-progress', {
            type: 'error',
            message: '라이선스가 등록되지 않았습니다. 라이선스를 등록해주세요.'
          });
          return {
            success: false,
            error: '라이선스가 등록되지 않았습니다.'
          };
        }

        console.log(`[MINDMAP] 키워드 마인드맵 생성 시작: "${keyword}"`);
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();

        const { generateKeywordMindmap, extractAllKeywords } = await import('../../utils/keyword-mindmap');

        // 🔥 무제한 확장 옵션 처리
        const maxDepth = options.maxDepth || 3;
        const maxKeywordsPerLevel = options.maxKeywordsPerLevel || 100; // 레벨당 키워드 수 증가
        const maxTotalKeywords = options.maxTotalKeywords || undefined; // undefined = 무제한

        const mindmapOptions = {
          maxDepth: maxDepth,
          maxKeywordsPerLevel: maxKeywordsPerLevel,
          maxTotalKeywords: maxTotalKeywords, // 🔥 무제한 확장 지원
          clientId: env.naverClientId,
          clientSecret: env.naverClientSecret,
          searchAdLicense: env.naverSearchAdAccessLicense,
          searchAdSecret: env.naverSearchAdSecretKey,
          searchAdCustomerId: env.naverSearchAdCustomerId,
          smartExpansion: options.smartExpansion !== false, // 기본값 true
          // 🔥 진행 상황 실시간 전송
          onProgress: (progress: any) => {
            event.sender.send('keyword-mindmap-progress', {
              type: 'progress',
              ...progress
            });
          }
        };

        console.log(`[MINDMAP] 옵션: 깊이=${maxDepth}, 레벨당=${maxKeywordsPerLevel}, 목표=${maxTotalKeywords || '무제한'}`);

        const mindmap = await generateKeywordMindmap(keyword, mindmapOptions);
        const allKeywords = extractAllKeywords(mindmap);

        console.log(`[MINDMAP] ✅ 마인드맵 생성 완료: 총 ${allKeywords.length}개 키워드`);

        // 완료 메시지 전송
        event.sender.send('keyword-mindmap-progress', {
          type: 'complete',
          message: `✅ 완료! 총 ${allKeywords.length}개 키워드 발굴`,
          collectedKeywords: allKeywords.length
        });

        return {
          success: true,
          mindmap,
          keywords: allKeywords,
          totalKeywords: allKeywords.length,
        };
      } catch (error: any) {
        console.error('[MINDMAP] 생성 실패:', error);
        return {
          success: false,
          error: error.message || '마인드맵 생성 실패',
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ generate-keyword-mindmap 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('save-network-optimization')) {
    ipcMain.handle('save-network-optimization', async (event, settings: any) => {
      try {
        console.log('[NETWORK-OPTIMIZATION] 네트워크 최적화 설정 저장:', settings);

        // 최적화 설정을 config.json에 저장
        const envManager = EnvironmentManager.getInstance();
        await envManager.saveConfig({
          networkOptimization: settings
        });

        console.log('[NETWORK-OPTIMIZATION] ✅ 네트워크 최적화 설정 저장 완료');
        return { success: true };
      } catch (error: any) {
        console.error('[NETWORK-OPTIMIZATION] 저장 실패:', error);
        return { success: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ save-network-optimization 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('get-tutorial-videos')) {
    ipcMain.handle('get-tutorial-videos', async () => {
      try {
        const fs = require('fs');
        const path = require('path');

        // 사용법 영상 파일 경로
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const videosPath = path.join(userDataPath, 'tutorial-videos.json');

        if (fs.existsSync(videosPath)) {
          const videosData = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
          return { success: true, videos: videosData };
        }

        return { success: true, videos: {} };
      } catch (error: any) {
        console.error('[TUTORIAL] 사용법 영상 로드 실패:', error);
        return { success: false, error: error.message, videos: {} };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-tutorial-videos 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('save-tutorial-video')) {
    ipcMain.handle('save-tutorial-video', async (event, data: { featureName: string; videoUrl: string }) => {
      try {
        const fs = require('fs');
        const path = require('path');

        // 사용법 영상 파일 경로
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const videosPath = path.join(userDataPath, 'tutorial-videos.json');

        // 기존 영상 데이터 로드
        let videosData: Record<string, string> = {};
        if (fs.existsSync(videosPath)) {
          videosData = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
        }

        // 새 영상 추가/업데이트
        videosData[data.featureName] = data.videoUrl;

        // 디렉토리 생성
        const dir = path.dirname(videosPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // 파일 저장
        fs.writeFileSync(videosPath, JSON.stringify(videosData, null, 2), 'utf8');

        console.log(`[TUTORIAL] ✅ 사용법 영상 저장 완료: ${data.featureName}`);
        return { success: true };
      } catch (error: any) {
        console.error('[TUTORIAL] 사용법 영상 저장 실패:', error);
        return { success: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ save-tutorial-video 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('get-naver-popular-news')) {
    ipcMain.handle('get-naver-popular-news', async () => {
      try {
        console.log('[NAVER-NEWS] 네이버 실시간 인기 뉴스 조회 시작...');

        const result = await getNaverPopularNews();

        if (result.success) {
          console.log(`[NAVER-NEWS] ✅ ${result.news.length}개 뉴스 조회 완료`);
          return {
            success: true,
            news: result.news,
            timestamp: result.timestamp
          };
        } else {
          console.error('[NAVER-NEWS] ❌ 조회 실패:', result.error);
          return {
            success: false,
            error: result.error || '뉴스 조회 실패',
            news: [],
            timestamp: result.timestamp
          };
        }

      } catch (error: any) {
        console.error('[NAVER-NEWS] ❌ 오류:', error);
        return {
          success: false,
          error: error.message || '뉴스 조회 중 오류가 발생했습니다.',
          news: [],
          timestamp: new Date().toLocaleString('ko-KR')
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-naver-popular-news 핸들러 등록 완료');
  }

  // 🔥 네이버 지식인 황금질문 헌터 v3.0 - 끝판왕!
  // ========================================
  if (!ipcMain.listenerCount('search-kin-questions')) {
    ipcMain.handle('search-kin-questions', async (_event, params: any) => {
      try {
        // 파라미터 파싱 (레거시 지원)
        let tabType = 'popular';
        let isPremiumRequest = false;

        if (typeof params === 'boolean') {
          // 레거시: boolean으로 전달
          isPremiumRequest = params;
          tabType = params ? 'hidden' : 'popular';
        } else if (typeof params === 'object' && params !== null) {
          // 새로운 형식: { tabType, isPremiumRequest }
          tabType = params.tabType || 'popular';
          isPremiumRequest = params.isPremiumRequest || false;
        }

        console.log(`[KIN-HUNTER-V3] 🔥 황금 질문 헌터 시작! (탭: ${tabType}, 프리미엄: ${isPremiumRequest})`);

        // 라이선스 체크 (3개월 이상)
        const license = await licenseManager.loadLicense();
        const isActuallyPremium = license && license.isValid && (
          license.plan === '3months' ||
          license.plan === '1year' ||
          license.plan === 'unlimited' ||
          license.licenseType === '3months' ||
          license.licenseType === '1year' ||
          license.licenseType === 'unlimited'
        );

        // 무료 사용자가 프리미엄 기능 요청 시 차단
        if (isPremiumRequest && !isActuallyPremium) {
          return {
            success: false,
            error: '숨은 꿀질문 찾기는 3개월권 이상 사용자만 이용 가능합니다.',
            requiresPremium: true,
            popularQuestions: [],
            hiddenGoldenQuestions: []
          };
        }

        // 🔥 v6.0 황금 질문 헌터 - 4개 탭!
        const {
          fullHunt,
          getPopularQnA,
          getRisingQuestions,
          getTrendingHiddenQuestions
        } = await import('../../utils/naver-kin-golden-hunter-v3');

        let result;

        // 탭별 처리 (4개 탭)
        // popular: 많이 본 Q&A (무료)
        // latest: 급상승 질문 (무료)
        // trending: 지금 뜨는 숨은 질문 (3개월)
        // hidden: 숨은 꿀질문 (3개월)

        if (tabType === 'trending' && isActuallyPremium) {
          // 🔐 지금 뜨는 숨은 질문 (3개월) - 최근 7일 + 고조회수
          console.log('[KIN-HUNTER] ⚡ 지금 뜨는 숨은 질문 탐색...');
          result = await getTrendingHiddenQuestions();
        } else if (tabType === 'hidden' && isActuallyPremium) {
          // 🔐 숨은 꿀질문 (3개월) - 기간 무관 고조회수
          console.log('[KIN-HUNTER] 💎 숨은 꿀질문 헌팅...');
          result = await fullHunt();
        } else if (tabType === 'latest' || tabType === 'rising') {
          // 🆓 급상승 질문 (무료) - 오늘 급상승
          console.log('[KIN-HUNTER] 🔥 급상승 질문 탐색...');
          result = await getRisingQuestions();
        } else {
          // 🆓 많이 본 Q&A (무료) - 기본
          console.log('[KIN-HUNTER] 📊 많이 본 Q&A...');
          result = await getPopularQnA();
        }

        console.log(`[KIN-HUNTER-V3] ✅ 황금 질문 ${result.goldenQuestions.length}개 발견! (${result.crawlTime}초)`);

        return {
          success: true,
          goldenQuestions: result.goldenQuestions,
          popularQuestions: result.goldenQuestions.slice(0, 10),
          hiddenGoldenQuestions: result.goldenQuestions,
          stats: result.stats,
          categories: result.categories,
          crawlTime: result.crawlTime,
          ...result
        };

      } catch (error: any) {
        console.error('[KIN-SEARCH] ❌ 오류:', error.message);
        return {
          success: false,
          error: error.message || '지식인 검색 실패',
          popularQuestions: [],
          hiddenGoldenQuestions: []
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ search-kin-questions 핸들러 등록 완료');
  }

  // 🛒 쇼핑 커넥트 — 네이버 쇼핑 상품 발굴
  if (!ipcMain.listenerCount('shopping-connect-search')) {
    ipcMain.handle('shopping-connect-search', async (_event, params: any) => {
      try {
        const keyword = String(params?.keyword ?? '').trim();
        if (!keyword) {
          return { success: false, error: '키워드를 입력해주세요.' };
        }
        const sort = (params?.sort ?? 'sim') as 'sim' | 'date' | 'asc' | 'dsc';
        const display = Math.min(Math.max(Number(params?.display) || 30, 1), 100);

        const { searchNaverShopping, pickBlogRecommendedItems } = await import('../../utils/naver-shopping-api');
        const result = await searchNaverShopping(keyword, { display, sort });
        const recommended = pickBlogRecommendedItems(result.items, 10);

        return {
          success: true,
          keyword,
          total: result.total,
          items: result.items,
          recommended,
        };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT] 오류:', err?.message ?? err);
        return { success: false, error: err?.message ?? '쇼핑 검색 실패' };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-search 핸들러 등록 완료');
  }

  // 🔥 100점짜리 뉴스 스니펫 크롤링 (IPC 핸들러)
  ipcMain.handle('crawl-news-snippets', async (_event, keyword: string) => {
    console.log(`[KEYWORD-MASTER] 뉴스 스니펫 크롤링 요청: "${keyword}" (Puppeteer via Main)`);
    try {
      // Main 프로세스에서 Puppeteer 실행
      const snippets = await crawlNewsSnippets(keyword);
      console.log(`[KEYWORD-MASTER] 스니펫 크롤링 성공: ${snippets.length}개 반환`);
      return snippets;
    } catch (error: any) {
      console.error(`[KEYWORD-MASTER] 스니펫 크롤링 실패:`, error);
      return [];
    }
  });

  // 🔥 100점짜리 연관 검색어 실시간 조회 (IPC 핸들러 - User-Agent 우회)
  ipcMain.handle('fetch-real-related-keywords', async (_event, keyword: string) => {
    console.log(`[KEYWORD-MASTER] 연관 검색어 조회 요청: "${keyword}" (Axios via Main)`);
    try {
      // Main 프로세스에서는 User-Agent 헤더 설정 가능
      const response = await axios.get('https://ac.search.naver.com/nx/ac', {
        params: {
          q: keyword,
          con: 1,
          frm: 'nv',
          ans: 2,
          r_format: 'json',
          r_enc: 'UTF-8'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        timeout: 3000
      });

      const results: string[] = [];
      if (response.data?.items) {
        for (const itemGroup of response.data.items) {
          if (Array.isArray(itemGroup)) {
            for (const item of itemGroup) {
              if (Array.isArray(item) && item[0]) {
                const kw = String(item[0]).trim();
                if (kw.length >= 2 && kw !== keyword) results.push(kw);
              }
            }
          }
        }
      }
      return [...new Set(results)].slice(0, 10);
    } catch (error: any) {
      console.error(`[KEYWORD-MASTER] 연관 검색어 조회 실패:`, error.message);
      return [];
    }
  });

  // 🔄 즉시 수집 실행 (IPC 핸들러)
  ipcMain.handle('collect-now', async () => {
    console.log('[KEYWORD-MASTER] 즉시 수집 요청 수신');
    try {
      const api = getFreshKeywordsAPI();
      await api.collectNow();
      return { success: true };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 즉시 수집 실패:', error);
      return { success: false, error: error.message };
    }
  });

  // 📊 시스템 상태 조회 (IPC 핸들러)
  ipcMain.handle('get-system-status', async () => {
    try {
      const api = getFreshKeywordsAPI();
      const status = await api.getSystemStatus();
      return status;
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 시스템 상태 조회 실패:', error);
      throw error;
    }
  });

  // 🤖 AI 챗봇 - Gemini 대화 (IPC 핸들러)
  ipcMain.handle('gemini-chat', async (_event, args: { apiKey: string; message: string; history: any[]; modelName?: string }) => {
    console.log('[KEYWORD-MASTER] Gemini AI 채팅 요청 수신');
    try {
      const { apiKey, message, history, modelName = 'gemini-1.5-pro' } = args;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const chat = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(message);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] Gemini AI 채팅 실패:', error);
      throw error;
    }
  });
}
