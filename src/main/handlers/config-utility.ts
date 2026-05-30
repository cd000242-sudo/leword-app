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
          naverSearchAdCustomerId: env.naverSearchAdCustomerId || '',
          anthropicApiKey: env.anthropicApiKey || '',
          aiInferenceMode: env.aiInferenceMode || 'auto',
          manusApiKey: env.manusApiKey || '',
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] check-api-keys 오류:', error);
        return {
          naverClientId: '',
          naverClientSecret: '',
          youtubeApiKey: '',
          naverSearchAdAccessLicense: '',
          naverSearchAdSecretKey: '',
          naverSearchAdCustomerId: '',
          anthropicApiKey: '',
          aiInferenceMode: 'auto',
          manusApiKey: '',
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
        // v2.44.1 보안: file://, javascript:, data: 등 위험 스킴 차단
        const safe = String(url || '').trim();
        if (!/^https?:\/\//i.test(safe)) {
          console.warn('[OPEN-URL] ❌ 비허용 스킴 차단:', safe.slice(0, 60));
          return { success: false, error: 'http(s):// URL만 허용됩니다.' };
        }
        // URL 형식 추가 검증
        try {
          const u = new URL(safe);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return { success: false, error: 'http(s):// URL만 허용됩니다.' };
          }
        } catch {
          return { success: false, error: '잘못된 URL 형식입니다.' };
        }
        const { shell } = require('electron');
        await shell.openExternal(safe);
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

  // v2.44.0: 저사양 모드 get/set
  // v2.44.1 보안: 시스템 프로파일 raw 값(totalMemGB, cpuCount) 노출 X
  //   → 렌더러 XSS 시 시스템 타겟팅 정보 누출 방지. boolean만 노출.
  if (!ipcMain.listenerCount('get-low-spec-mode')) {
    ipcMain.handle('get-low-spec-mode', async () => {
      try {
        const envManager = EnvironmentManager.getInstance();
        const config = envManager.getConfig();
        const { getSystemProfile, effectiveLowSpec } = await import('../../utils/system-profile');
        const profile = getSystemProfile();
        const mode = config.lowSpecMode || 'auto';
        return {
          ok: true,
          mode,
          effective: effectiveLowSpec(mode),
          // 보안: raw 시스템 정보 대신 사용자가 알아야 할 boolean만
          autoDetectedLowSpec: profile.isLowSpec,
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] get-low-spec-mode 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-low-spec-mode 핸들러 등록 완료');
  }
  if (!ipcMain.listenerCount('set-low-spec-mode')) {
    ipcMain.handle('set-low-spec-mode', async (_event, mode: 'auto' | 'on' | 'off') => {
      try {
        if (!['auto', 'on', 'off'].includes(mode)) {
          return { ok: false, error: 'mode는 auto/on/off 중 하나여야 합니다.' };
        }
        const envManager = EnvironmentManager.getInstance();
        await envManager.saveConfig({ lowSpecMode: mode } as any);
        envManager.reloadConfig();
        console.log('[KEYWORD-MASTER] ✅ low-spec-mode 변경:', mode);
        return {
          ok: true,
          mode,
          requiresRestart: true,
          message: '저사양 모드가 변경되었습니다. 앱을 재시작해야 적용됩니다.',
        };
      } catch (error: any) {
        console.error('[KEYWORD-MASTER] set-low-spec-mode 오류:', error);
        return { ok: false, error: error.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ set-low-spec-mode 핸들러 등록 완료');
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
        if (settings.anthropicApiKey !== undefined) envConfig.anthropicApiKey = settings.anthropicApiKey;
        if (settings.aiInferenceMode !== undefined) envConfig.aiInferenceMode = settings.aiInferenceMode;
        if (settings.manusApiKey !== undefined) envConfig.manusApiKey = settings.manusApiKey;
        // v2.42.55: 쇼핑 커넥트 재설계 Phase 1 — 쿠팡 파트너스 트래킹
        if (settings.coupangAccessKey !== undefined) envConfig.coupangAccessKey = settings.coupangAccessKey;
        if (settings.coupangSecretKey !== undefined) envConfig.coupangSecretKey = settings.coupangSecretKey;
        if (settings.coupangSubId !== undefined) envConfig.coupangSubId = settings.coupangSubId;

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

        // 라이선스 체크 (3개월 이상) — 개발자 모드, 영구제, 대소문자 무관 매칭
        const { app } = require('electron');
        const isDev = !app.isPackaged || process.env['NODE_ENV'] === 'development';
        const license = await licenseManager.loadLicense();
        const typeStr = String(license?.licenseType || license?.plan || '').toUpperCase();
        const isActuallyPremium = isDev || (license && license.isValid && (
          license.isUnlimited === true ||
          license.maxUses === -1 ||
          license.remaining === -1 ||
          !license.expiresAt ||  // 만료일 없음 = 영구제
          ['UNLIMITED', 'PERMANENT', 'LIFE'].includes(typeStr) ||
          ['1YEAR', '365DAY', 'YEARLY'].includes(typeStr) ||
          ['3MONTHS', '90DAY', 'THREE-MONTHS-PLUS'].includes(typeStr)
        ));

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
        const originalKeyword = String(params?.keyword ?? '').trim();
        const autoDiscovery = !originalKeyword;
        const autoDiscoveryLimit = Math.min(Math.max(Number(params?.autoDiscoveryLimit) || 10, 3), 12);
        const sort = (params?.sort ?? 'sim') as 'sim' | 'date' | 'asc' | 'dsc';
        const display = Math.min(Math.max(Number(params?.display) || 50, 1), 100);
        const start = Math.min(Math.max(Number(params?.start) || 1, 1), 1000);

        const {
          searchNaverShopping,
          pickBlogRecommendedItems,
          computeConversionScore,
          rankShoppingOpportunities,
          deriveShoppingExpansionQueries,
          buildProductLeWordSeeds,
          scoreLeWordEntryKeyword,
        } = await import('../../utils/naver-shopping-api');
        const { analyzeShoppingKeywords, expandWithIntentSuffixes } = await import('../../utils/shopping-keyword-analyzer');
        const { buildCoupangSearchUrl, simplifyTitleForCoupangSearch, convertToPartnersLinks, getCoupangPartnersConfig, coupangProductSearch, pickBestCoupangMatch } = await import('../../utils/coupang-partners');
        const { getNaverAutocompleteKeywords } = await import('../../utils/naver-autocomplete');
        const { EnvironmentManager } = await import('../../utils/environment-manager');
        const { classifySearchIntent, getIntentScoreAdjust } = await import('../../utils/search-intent-classifier');
        const { aggregateCommerceTrendSeeds, summarizeTrendSeeds } = await import('../../utils/sources/trend-seed-aggregator');
        const { NAVER_SHOPPING_CATEGORIES } = await import('../../utils/sources/naver-shopping-keyword-rank');
        const { getShoppingDiscoverySeeds } = await import('../../utils/shopping-keyword-suggestions');
        // v2.43.64: Phase 9 — 네이버 검색 추세 검증 (rising/stable/declining/dead)
        const { checkKeywordsRecency, getNaverKeywordSearchVolumeSeparate } = await import('../../utils/naver-datalab-api');

        let keyword = originalKeyword;
        let discoverySeeds: Awaited<ReturnType<typeof getShoppingDiscoverySeeds>> = [];
        if (autoDiscovery) {
          discoverySeeds = await getShoppingDiscoverySeeds(autoDiscoveryLimit);
          if (discoverySeeds.length === 0) {
            return {
              success: false,
              error: '자동 발굴에 사용할 쇼핑 시드가 없습니다. 추천 키워드 검증을 먼저 실행하거나 네이버 API 키를 확인해주세요.',
            };
          }
          keyword = discoverySeeds[0].keyword;
        }

        // 검색 의도 분류 (스코어링 가산 + UI 뱃지)
        const intent = classifySearchIntent(keyword);
        const intentAdjust = getIntentScoreAdjust(intent.primary);

        // 쇼핑 검색 + 자동완성 병렬 실행 (첫 페이지 요청에만)
        const envCfg = EnvironmentManager.getInstance().getConfig();
        const naverCfg = {
          clientId: envCfg.naverClientId || process.env['NAVER_CLIENT_ID'] || '',
          clientSecret: envCfg.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '',
        };
        const isFirstPage = start === 1;
        const [result, relatedKeywords] = await Promise.all([
          searchNaverShopping(keyword, { display, sort, start }),
          isFirstPage && naverCfg.clientId
            ? getNaverAutocompleteKeywords(keyword, naverCfg).catch(() => [] as string[])
            : Promise.resolve([] as string[]),
        ]);

        // 쿠팡 검색 URL + 전환 스코어 전체 상품에 부착
        // 의도 가산점: 구매/비교성 키워드는 전체 추천 적극, 정보성은 억제
        for (const item of result.items) {
          item.discoveryQuery = keyword;
          item.discoverySource = autoDiscovery ? 'auto-discovery' : 'direct';
          item.discoveryReason = autoDiscovery
            ? `무입력 자동 발굴 1순위 시드: ${discoverySeeds[0]?.reason || '쇼핑 발굴 시드'}`
            : '원 입력어 직접 검색';
          const simplified = simplifyTitleForCoupangSearch(item.title) || keyword;
          item.coupangSearchUrl = buildCoupangSearchUrl(simplified);
          computeConversionScore(item);
          if (item.conversionScore !== undefined) {
            item.conversionScore = Math.round((item.conversionScore + intentAdjust) * 10) / 10;
          }
        }

        let recommended = pickBlogRecommendedItems(result.items, 10);

        // 쿠팡파트너스 설정돼있으면 추천 10개를 트래킹 링크로 변환
        // v2.43.63: 4팀+2팀 — Product Search API 로 productId 정확 매칭 후 deeplink 변환
        //   이전: 네이버 상품명 → simplified 검색 URL → deeplink (검색 결과 페이지 어필리에이트 — 회색지대)
        //   신규: 네이버 상품명 → Product Search → 최적 매칭 1건의 productUrl → deeplink (상품 상세)
        //   매칭 실패 시: 기존 검색 URL fallback
        const partnersCfg = getCoupangPartnersConfig();
        let partnersEnabled = false;
        let productMatchCount = 0;
        const partnerConvertedIds = new Set<string>();
        const hydrateCoupangPartnerLinks = async (targetItems: any[]) => {
          const targets = (targetItems || []).filter((item: any) =>
            item?.productId && !partnerConvertedIds.has(item.productId)
          );
          if (!partnersCfg.accessKey || !partnersCfg.secretKey || targets.length === 0) return;
          try {
            // 1. 각 추천 상품에 대해 쿠팡 product search (캐시 적중 시 즉시)
            const matchedUrls = new Map<string, string>(); // 네이버 productId → 쿠팡 상품URL
            let localMatchCount = 0;
            await Promise.all(targets.map(async (item: any) => {
              try {
                const simpKw = simplifyTitleForCoupangSearch(item.title) || keyword;
                const candidates = await coupangProductSearch(simpKw, partnersCfg, { limit: 3 });
                const best = pickBestCoupangMatch(candidates, item.title, item.lprice);
                if (best && best.productUrl) {
                  matchedUrls.set(item.productId, best.productUrl);
                  // UI 표시용 매칭 정보 부착 (사용자 신뢰도 ↑)
                  (item as any).coupangMatchedName = best.productName;
                  (item as any).coupangMatchedPrice = best.productPrice;
                  localMatchCount++;
                }
              } catch (err: any) {
                // 개별 매칭 실패는 무시 (검색 URL fallback)
              }
            }));

            // 2. 매칭된 productUrl + fallback 검색 URL 합쳐서 deeplink 변환
            const urls = targets.map((r: any) => matchedUrls.get(r.productId) || r.coupangSearchUrl!).filter(Boolean);
            const converted = await convertToPartnersLinks(urls, partnersCfg);
            const map = new Map(converted.map(c => [c.originalUrl, c.shortenUrl || c.landingUrl]));
            for (const item of targets) {
              const originalUrl = matchedUrls.get(item.productId) || item.coupangSearchUrl;
              if (originalUrl && map.has(originalUrl)) {
                item.coupangSearchUrl = map.get(originalUrl)!;
              }
              partnerConvertedIds.add(item.productId);
            }
            partnersEnabled = true;
            productMatchCount += localMatchCount;
            console.log(`[SHOPPING-CONNECT] 쿠팡 정확 매칭: +${localMatchCount}/${targets.length}건 (productId), 나머지는 검색 URL`);
          } catch (e: any) {
            console.warn('[SHOPPING-CONNECT] 쿠팡파트너스 링크 변환 실패:', e?.message);
          }
        };
        await hydrateCoupangPartnerLinks(recommended);

        // 🔥 Phase 4: 판매중 제품 필터 — 리뷰/관심도 있는 상품만 analyzer 에 주입
        //   naver-shopping-api 는 reviewCount 필드 제공 안 함 → productType=1 일반상품만
        //   category1 있는 것만 (카테고리 미지정 = 해외직구/가짜 상품)
        const saleableItems = result.items.filter(it =>
          (it.productType === 1 || !it.productType) && !!it.category1
        );
        // v2.43.55: 10팀 — analyzer/intentExpanded 도 catch 격리 (한 단계 실패해도 부분 결과 반환)
        let insight: any;
        try {
          insight = analyzeShoppingKeywords(
            saleableItems.length > 0 ? saleableItems : result.items,
            result.total, keyword
          );
        } catch (e: any) {
          console.warn('[SHOPPING-CONNECT] analyzer 실패:', e?.message);
          insight = { priceAnalysis: {}, longtailKeywords: [], competition: {}, categories: {}, brands: [], priceTiers: {} };
        }
        let intentExpanded: any[] = [];
        try {
          intentExpanded = expandWithIntentSuffixes(insight.longtailKeywords || [], [keyword]);
        } catch (e: any) {
          console.warn('[SHOPPING-CONNECT] intentExpanded 실패:', e?.message);
        }

        // 🔥 Phase 3: Cross-source 실시간 시드 — 이 키워드의 주요 카테고리 실시간 유행 제품
        let crossSourceSeeds: Array<{ seed: string; sources: string[]; crossScore: number }> = [];
        try {
          // 상위 2개 category1 을 cid 로 역매핑
          const topCats = insight.categories.level1.slice(0, 2);
          const nameToCid: Record<string, string> = {};
          for (const [cid, name] of Object.entries(NAVER_SHOPPING_CATEGORIES)) {
            nameToCid[name] = cid;
          }
          const cids = topCats.map(c => nameToCid[c.name]).filter(Boolean);
          if (cids.length > 0) {
            // v2.43.60: 8팀 — userKeyword 전달해서 broad-match 카테고리 오염 차단
            const seeds = await aggregateCommerceTrendSeeds(cids, {
              youtubeEnabled: true, youtubeQuery: `${keyword} 추천`, userKeyword: keyword,
            });
            crossSourceSeeds = seeds.slice(0, 20).map(s => ({
              seed: s.seed, sources: s.sources, crossScore: s.crossScore,
            }));
            console.log(`[SHOPPING-CONNECT] 실시간 Cross-source: ${summarizeTrendSeeds(seeds)}`);
          }
        } catch (err: any) {
          console.warn('[SHOPPING-CONNECT] Cross-source aggregator 실패:', err?.message);
        }

        // 자동완성 키워드에서 원 검색어/너무 짧은 것/중복 제거, 상위 15개만
        const relatedKeywordsTrimmed = Array.from(new Set(
          (relatedKeywords || [])
            .filter(k => typeof k === 'string' && k.trim() && k.trim().toLowerCase() !== keyword.toLowerCase())
            .filter(k => k.length >= 2 && k.length <= 30)
        )).slice(0, 15);
        const autoDiscoveryQueries = autoDiscovery
          ? discoverySeeds.slice(1).map(seed => ({
              query: seed.keyword,
              source: 'auto-discovery' as const,
              reason: seed.reason || '무입력 자동 쇼핑 발굴 시드',
            }))
          : [];
        const demandKeywords = Array.from(new Set([
          ...relatedKeywordsTrimmed,
          ...(autoDiscovery ? discoverySeeds.map(seed => seed.keyword) : []),
        ])).slice(0, 24);

        // v2.43.64: Phase 9 — 검색 추세 검증 (DataLab 30일 트렌드)
        //   첫 페이지 요청에만 실행 (페이지네이션 시 매번 호출 X)
        //   첫 페이지 + naver 키 있을 때만, 5초 timeout으로 hang 방지
        let recency: any = undefined;
        if (isFirstPage && naverCfg.clientId && naverCfg.clientSecret) {
          try {
            const recencyTimeoutPromise = new Promise<Map<string, any>>((_, rej) =>
              setTimeout(() => rej(new Error('recency timeout 5s')), 5000)
            );
            const recencyMap = await Promise.race([
              checkKeywordsRecency(naverCfg, [keyword]),
              recencyTimeoutPromise,
            ]) as Map<string, any>;
            const r = recencyMap.get(keyword);
            if (r) recency = r;
          } catch (e: any) {
            console.warn('[SHOPPING-CONNECT] recency 검증 실패:', e?.message);
          }
        }

        // v2.49.44: 원 검색어 하나만 긁으면 결국 "인기상품 확인"에 머문다.
        // 같은 카테고리/대체 브랜드/자동완성 구매 의도/실시간 시드로 추가 쇼핑 검색을 병렬 수행해
        // 사용자가 생각 못 한 제품군까지 후보 풀에 넣는다. 첫 페이지에서만 실행해 더보기 성능은 보호.
        let expansionQueries: Array<{ query: string; source: any; reason: string }> = [];
        if (isFirstPage) {
          const baseExpansionQueries = deriveShoppingExpansionQueries(
            keyword,
            relatedKeywordsTrimmed,
            crossSourceSeeds,
            autoDiscovery ? 12 : 8
          );
          const seenExpansion = new Set<string>([keyword.toLowerCase()]);
          expansionQueries = [...autoDiscoveryQueries, ...baseExpansionQueries]
            .filter(q => {
              const key = String(q.query || '').replace(/\s+/g, ' ').trim().toLowerCase();
              if (!key || seenExpansion.has(key)) return false;
              seenExpansion.add(key);
              return true;
            })
            .slice(0, autoDiscovery ? 12 : 8);
          if (expansionQueries.length > 0) {
            try {
              const expandedResults = await Promise.allSettled(
                expansionQueries.slice(0, autoDiscovery ? 10 : 6).map(q =>
                  searchNaverShopping(q.query, { display: 20, sort: 'sim', start: 1 })
                    .then(r => ({ query: q, result: r }))
                )
              );
              const seenProducts = new Set(result.items.map((item: any) =>
                item.productId || `${item.title}|${item.lprice}|${item.mallName}`
              ));
              let expandedAdded = 0;
              for (const settled of expandedResults) {
                if (settled.status !== 'fulfilled') continue;
                const { query: q, result: extra } = settled.value;
                for (const item of extra.items || []) {
                  const key = item.productId || `${item.title}|${item.lprice}|${item.mallName}`;
                  if (!key || seenProducts.has(key)) continue;
                  seenProducts.add(key);
                  item.discoveryQuery = q.query;
                  item.discoverySource = q.source;
                  item.discoveryReason = q.reason;
                  item.coupangSearchUrl = buildCoupangSearchUrl(simplifyTitleForCoupangSearch(item.title) || q.query);
                  computeConversionScore(item);
                  if (item.conversionScore !== undefined) {
                    item.conversionScore = Math.round((item.conversionScore + intentAdjust) * 10) / 10;
                  }
                  result.items.push(item);
                  expandedAdded++;
                }
              }
              console.log(`[SHOPPING-CONNECT] 카테고리/대체 브랜드 확장 검색: query=${expansionQueries.length}, added=${expandedAdded}`);
            } catch (e: any) {
              console.warn('[SHOPPING-CONNECT] 확장 쇼핑 검색 실패:', e?.message);
            }

            // 확장 상품까지 반영한 최종 인사이트 재계산
            try {
              const finalSaleableItems = result.items.filter(it =>
                (it.productType === 1 || !it.productType) && !!it.category1
              );
              insight = analyzeShoppingKeywords(
                finalSaleableItems.length > 0 ? finalSaleableItems : result.items,
                Math.max(result.total, result.items.length),
                keyword
              );
              intentExpanded = expandWithIntentSuffixes(insight.longtailKeywords || [], [keyword]);
            } catch (e: any) {
              console.warn('[SHOPPING-CONNECT] 확장 후 analyzer 재계산 실패:', e?.message);
            }
          }
        }

        // v2.49.43: 쇼핑커넥트의 본질을 "인기상품 목록"에서 "지금 글 쓸 상품 판단"으로 전환.
        // 수요(자동완성/실시간 시드/최근추세) + 구매의도 + 전환성 + 글감 적합도를 상품별로 재랭킹한다.
        const opportunityContext = {
          keyword,
          intentPrimary: intent.primary,
          totalHits: result.total,
          relatedKeywords: demandKeywords,
          crossSourceSeeds,
          recency,
        };
        const opportunityRanked = rankShoppingOpportunities(result.items, opportunityContext, 20);
        if (opportunityRanked.length > 0) {
          recommended = opportunityRanked.slice(0, 10);
          await hydrateCoupangPartnerLinks(recommended);
        }

        // v2.49.44: 각 추천 상품을 LEWORD 진입판단 후보로 변환.
        // 제품명 그대로만 보지 않고 같은 계열 대체 브랜드/카테고리 구매 키워드까지 제시한다.
        const lewordSeedRows: Array<{ item: any; seed: any }> = [];
        for (const item of recommended) {
          const seeds = buildProductLeWordSeeds(item, keyword, 6);
          item.lewordEntryKeywords = seeds;
          for (const seed of seeds) lewordSeedRows.push({ item, seed });
        }
        if (lewordSeedRows.length > 0 && naverCfg.clientId && naverCfg.clientSecret) {
          try {
            const uniqueSeeds = Array.from(new Set(lewordSeedRows.map(row => row.seed.keyword))).slice(0, 40);
            const metricMap = new Map<string, { searchVolume: number; documentCount: number }>();
            for (let i = 0; i < uniqueSeeds.length; i += 20) {
              const batch = uniqueSeeds.slice(i, i + 20);
              try {
                const sigs = await getNaverKeywordSearchVolumeSeparate(naverCfg, batch, { includeDocumentCount: true });
                for (let j = 0; j < batch.length; j++) {
                  const sig = sigs?.[j];
                  if (!sig) continue;
                  metricMap.set(batch[j], {
                    searchVolume: (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0),
                    documentCount: sig.documentCount || 0,
                  });
                }
              } catch (e: any) {
                console.warn('[SHOPPING-CONNECT] LEWORD 후보 metric batch 실패:', e?.message);
              }
            }
            for (const item of recommended as any[]) {
              item.lewordEntryKeywords = (item.lewordEntryKeywords || [])
                .map((seed: any) => {
                  const m = metricMap.get(seed.keyword);
                  return m ? scoreLeWordEntryKeyword(seed, m.searchVolume, m.documentCount) : seed;
                })
                .sort((a: any, b: any) => (b.entryScore || 0) - (a.entryScore || 0));
            }
          } catch (e: any) {
            console.warn('[SHOPPING-CONNECT] LEWORD 후보 진입판단 실패:', e?.message);
          }
        }

        const topOpportunity = recommended[0] as any;
        const hotCount = recommended.filter((item: any) => (item.opportunityScore || 0) >= 75).length;
        const opportunitySummary = topOpportunity ? {
          topScore: topOpportunity.opportunityScore || 0,
          hotCount,
          verdict: topOpportunity.opportunityScore >= 75
            ? 'write-now'
            : topOpportunity.opportunityScore >= 62
              ? 'candidate'
              : topOpportunity.opportunityScore >= 48
                ? 'watch'
                : 'weak',
          title: topOpportunity.opportunityScore >= 75
            ? '🔥 지금 작성 우선'
            : topOpportunity.opportunityScore >= 62
              ? '✅ 작성 후보'
              : topOpportunity.opportunityScore >= 48
                ? '🟡 검토 필요'
                : '⚪ 전환 근거 약함',
          reason: topOpportunity.writeRecommendation || '',
          topProduct: topOpportunity.title || '',
          topReasons: topOpportunity.opportunityReasons || [],
          demandSignals: {
            recencyStatus: recency?.status || '',
            recencyRatio: recency?.ratio || 0,
            relatedCount: relatedKeywordsTrimmed.length,
            crossSourceCount: crossSourceSeeds.length,
            autoDiscoverySeedCount: discoverySeeds.length,
          },
        } : null;

        return {
          success: true,
          keyword,
          originalKeyword,
          autoDiscovery,
          discoverySeeds,
          discoverySeedCount: discoverySeeds.length,
          total: result.total,
          start: result.start,
          display: result.display,
          hasMore: (result.start + result.items.length) <= Math.min(result.total, 1000) && result.items.length === display,
          items: result.items,
          recommended,
          insight,
          intentExpanded,     // 🔥 검색의도 변형 (추천/후기/비교 자동 생성)
          crossSourceSeeds,   // 🔥 실시간 카테고리 유행 제품
          partnersEnabled,
          productMatchCount,  // v2.43.63: 쿠팡 productId 정확 매칭 건수
          recency,            // v2.43.64: DataLab 30일 추세 (rising/stable/declining/dead)
          relatedKeywords: relatedKeywordsTrimmed,
          intent, // 검색 의도 분류 (primary, scores, label, icon)
          opportunitySummary, // v2.49.43: 지금 글 쓸 상품/근거 요약
        };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT] 오류:', err?.message ?? err);
        return { success: false, error: err?.message ?? '쇼핑 검색 실패' };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-search 핸들러 등록 완료');
  }

  // 🛒 쇼핑 커넥트 — 추천 키워드 (모달 열자마자 노출)
  if (!ipcMain.listenerCount('shopping-connect-suggestions')) {
    ipcMain.handle('shopping-connect-suggestions', async () => {
      try {
        const { getShoppingSuggestions } = await import('../../utils/shopping-keyword-suggestions');
        const s = await getShoppingSuggestions();
        return { success: true, ...s };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT] 추천 키워드 로드 실패:', err?.message);
        return { success: false, error: err?.message, dynamic: [], verified: [], static: [] };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-suggestions 핸들러 등록 완료');
  }

  // 🛒 쇼핑 커넥트 — 정적 풀 실시간 검증 (첫 로드 시 10~15초 소요, 이후 24h 캐시)
  if (!ipcMain.listenerCount('shopping-connect-verify')) {
    ipcMain.handle('shopping-connect-verify', async () => {
      try {
        const { getVerifiedShoppingSuggestions } = await import('../../utils/shopping-keyword-suggestions');
        const items = await getVerifiedShoppingSuggestions(30);
        return { success: true, items };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT] 검증 실패:', err?.message);
        return { success: false, error: err?.message, items: [] };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-verify 핸들러 등록 완료');
  }

  // v2.43.56 Phase 1 100점화: 블로그 본문 초안 생성 (Manus 1순위 + Claude fallback)
  if (!ipcMain.listenerCount('shopping-connect-blog-draft-start')) {
    ipcMain.handle('shopping-connect-blog-draft-start', async (_event, payload: any) => {
      try {
        const { startBlogDraft } = await import('../../utils/shopping-blog-draft');
        const r = startBlogDraft(payload);
        return { success: true, ...r };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT-DRAFT] start 실패:', err?.message);
        return { success: false, error: err?.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-blog-draft-start 핸들러 등록 완료');
  }
  if (!ipcMain.listenerCount('shopping-connect-blog-draft-status')) {
    ipcMain.handle('shopping-connect-blog-draft-status', async (_event, requestId: string) => {
      try {
        const { getBlogDraftStatus } = await import('../../utils/shopping-blog-draft');
        const s = getBlogDraftStatus(requestId);
        if (!s) return { success: false, error: 'requestId 없음 (만료됐을 수 있음)' };
        return { success: true, ...s };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-blog-draft-status 핸들러 등록 완료');
  }

  // v2.42.56 Phase 5: 쇼핑 커넥트 피드백 루프 (👍/👎)
  if (!ipcMain.listenerCount('shopping-connect-feedback')) {
    ipcMain.handle('shopping-connect-feedback', async (_event, payload: any) => {
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const dir = app.getPath('userData');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'shopping-connect-feedback.jsonl');
        // JSONL: 한 줄 한 레코드 (append-only)
        fs.appendFileSync(file, JSON.stringify(payload) + '\n', 'utf8');
        return { success: true };
      } catch (err: any) {
        console.error('[SHOPPING-CONNECT-FEEDBACK] 실패:', err?.message);
        return { success: false, error: err?.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ shopping-connect-feedback IPC 등록');
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

  // 🤖 AI 챗봇 - Claude 우선 + Gemini legacy (IPC 핸들러)
  ipcMain.handle('gemini-chat', async (_event, args: { apiKey: string; message: string; history: any[]; modelName?: string }) => {
    console.log('[KEYWORD-MASTER] AI 채팅 요청 수신:', args?.modelName);
    try {
      // 🔥 v2.42.21: Claude 기본 (사용자 요청). modelName prefix로 provider 자동 라우팅.
      const { apiKey, message, history, modelName = 'claude-sonnet-4-6' } = args;
      if (!apiKey) throw new Error('API 키가 필요합니다');

      // Claude 경로
      if (modelName.startsWith('claude-')) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });
        // history (Gemini 형식 {role, parts}) → Claude 형식 {role, content}
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
        for (const h of (history || [])) {
          const role: 'user' | 'assistant' = (h?.role === 'model' || h?.role === 'assistant') ? 'assistant' : 'user';
          let content = '';
          if (typeof h?.parts === 'string') content = h.parts;
          else if (Array.isArray(h?.parts)) content = h.parts.map((p: any) => typeof p === 'string' ? p : (p?.text || '')).join('\n');
          else if (typeof h?.content === 'string') content = h.content;
          else content = String(h?.parts || h?.content || '');
          if (content.trim()) messages.push({ role, content });
        }
        messages.push({ role: 'user', content: message });
        const resp = await client.messages.create({
          model: modelName,
          max_tokens: 4096,
          messages,
        });
        const text = (resp.content as any[])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n').trim();
        return text || '(빈 응답)';
      }

      // Gemini 경로 (legacy 호환)
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const chat = model.startChat({
        history: history,
        generationConfig: { maxOutputTokens: 2048 },
      });
      const result = await chat.sendMessage(message);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] AI 채팅 실패:', error);
      throw error;
    }
  });

  // 🤖 Anthropic Claude 키 검증
  if (!ipcMain.listenerCount('verify-anthropic-key')) {
    ipcMain.handle('verify-anthropic-key', async (_event, args: { apiKey: string }) => {
      try {
        const { verifyClaudeKey } = await import('../../utils/pro-hunter-v12/ai-client');
        return await verifyClaudeKey(args.apiKey);
      } catch (err: any) {
        return { ok: false, error: err?.message || 'unknown' };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ verify-anthropic-key 핸들러 등록 완료');
  }

  // AI 모드 + 키 가용성 조회
  if (!ipcMain.listenerCount('get-ai-mode')) {
    ipcMain.handle('get-ai-mode', async () => {
      try {
        const { getAIMode } = await import('../../utils/pro-hunter-v12/ai-client');
        return { success: true, ...(await getAIMode()) };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ get-ai-mode 핸들러 등록 완료');
  }
}
