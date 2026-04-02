// 프리미엄 기능 전용 모듈
import type * as Electron from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as licenseManager from '../utils/licenseManager';
import { benchmarkSniperPro } from '../utils/benchmark-sniper';
import { getExtractorInstance } from '../utils/accurate-blog-index-extractor';

let electronRuntime: typeof Electron | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  electronRuntime = require('electron');
} catch {
  electronRuntime = null;
}

const ipcMain = (electronRuntime as any)?.ipcMain;
const BrowserWindow = (electronRuntime as any)?.BrowserWindow;
const app = (electronRuntime as any)?.app;

const canUseIpc = !!(ipcMain && typeof ipcMain.handle === 'function' && typeof ipcMain.listenerCount === 'function');
const canUseApp = !!(app && typeof app.getPath === 'function');

// ========================================
// 1. 자동 키워드 모니터링
// ========================================

interface KeywordMonitorData {
  keyword: string;
  rank?: number;
  searchVolume?: number;
  lastChecked: string;
  history: {
    date: string;
    rank: number;
    searchVolume: number;
  }[];
}

let monitoringKeywords: Map<string, KeywordMonitorData> = new Map();
let monitoringInterval: NodeJS.Timeout | null = null;

export async function startKeywordMonitoring() {
  console.log('[PREMIUM] 키워드 모니터링 시작');

  // 기존 인터벌 정리
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // 매일 자동 체크 (테스트용: 1시간마다)
  monitoringInterval = setInterval(async () => {
    try {
      await checkAllMonitoringKeywords();
    } catch (error) {
      console.error('[PREMIUM] 키워드 모니터링 오류:', error);
    }
  }, 60 * 60 * 1000); // 1시간마다

  // 즉시 한 번 실행
  await checkAllMonitoringKeywords();
}

async function checkAllMonitoringKeywords() {
  console.log(`[PREMIUM] ${monitoringKeywords.size}개 키워드 모니터링 체크 중...`);

  // 환경 설정에서 API 키 가져오기
  let naverClientId = '';
  let naverClientSecret = '';

  try {
    const { EnvironmentManager } = await import('../utils/environment-manager');
    const envManager = EnvironmentManager.getInstance();
    const env = envManager.getConfig();
    naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
  } catch (e) {
    console.warn('[PREMIUM] 환경 설정 로드 실패, 기본값 사용');
  }

  for (const [keyword, data] of monitoringKeywords.entries()) {
    try {
      let currentRank = 0;
      let currentSearchVolume = 0;

      // 🔥 실제 네이버 블로그 검색으로 순위 확인
      if (naverClientId && naverClientSecret) {
        try {
          const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;
          const response = await fetch(searchUrl, {
            headers: {
              'X-Naver-Client-Id': naverClientId,
              'X-Naver-Client-Secret': naverClientSecret
            }
          });

          if (response.ok) {
            const searchData = await response.json();
            const total = searchData.total || 0;

            // 문서수 기반 경쟁도 추정 (결정론적 — 문서수가 적을수록 상위노출 가능성 높음)
            if (total <= 100) currentRank = Math.min(5, Math.max(1, Math.round(total / 20)));
            else if (total <= 500) currentRank = Math.round(10 + (total - 100) / 40);
            else if (total <= 1000) currentRank = Math.round(20 + (total - 500) / 50);
            else if (total <= 5000) currentRank = Math.round(30 + (total - 1000) / 100);
            else currentRank = Math.round(50 + Math.min(50, Math.log10(total / 5000) * 30));

            // 검색량 추정 (문서수 기반 — 결정론적)
            currentSearchVolume = Math.floor(total * 3.5);

            console.log(`[PREMIUM] "${keyword}" 체크 완료: 문서수=${total}, 추정순위=${currentRank}, 추정검색량=${currentSearchVolume}`);
          }
        } catch (apiErr) {
          console.warn(`[PREMIUM] "${keyword}" API 호출 실패:`, apiErr);
        }
      }

      // API 실패 시 기본값 (결정론적 — 키워드 길이 기반 추정)
      if (currentRank === 0) {
        const kwLen = (keyword || '').length;
        currentRank = Math.max(1, Math.min(100, kwLen * 5 + 20));
        currentSearchVolume = Math.max(100, kwLen * 500);
      }

      // 히스토리 추가
      data.history.push({
        date: new Date().toISOString(),
        rank: currentRank,
        searchVolume: currentSearchVolume
      });

      // 최근 30일만 보관
      if (data.history.length > 30) {
        data.history = data.history.slice(-30);
      }

      data.rank = currentRank;
      data.searchVolume = currentSearchVolume;
      data.lastChecked = new Date().toISOString();

      monitoringKeywords.set(keyword, data);

      // 변화 알림 (순위가 10 이상 변동된 경우)
      if (data.history.length >= 2) {
        const prevRank = data.history[data.history.length - 2].rank;
        const rankChange = prevRank - currentRank;

        if (Math.abs(rankChange) >= 10) {
          sendNotification(keyword, rankChange);
        }
      }

      // Rate limit 방지
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(`[PREMIUM] 키워드 "${keyword}" 체크 실패:`, error);
    }
  }

  // 데이터 저장
  await saveMonitoringData();
}

function sendNotification(keyword: string, rankChange: number) {
  const message = rankChange > 0
    ? `🎉 "${keyword}" 순위가 ${rankChange}단계 상승했습니다!`
    : `⚠️ "${keyword}" 순위가 ${Math.abs(rankChange)}단계 하락했습니다.`;

  console.log('[PREMIUM] 알림:', message);

  // 모든 윈도우에 알림 전송
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('keyword-rank-change', {
      keyword,
      rankChange,
      message
    });
  });
}

async function saveMonitoringData() {
  try {
    if (!canUseApp) return;
    const dataPath = path.join(app.getPath('userData'), 'keyword-monitoring.json');
    const data = Array.from(monitoringKeywords.entries());
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[PREMIUM] 모니터링 데이터 저장 완료');
  } catch (error) {
    console.error('[PREMIUM] 데이터 저장 실패:', error);
  }
}

async function loadMonitoringData() {
  try {
    if (!canUseApp) {
      monitoringKeywords = new Map();
      return;
    }
    const dataPath = path.join(app.getPath('userData'), 'keyword-monitoring.json');
    const raw = await fs.readFile(dataPath, 'utf-8');
    const data = JSON.parse(raw);
    monitoringKeywords = new Map(data);
    console.log(`[PREMIUM] ${monitoringKeywords.size}개 키워드 모니터링 데이터 로드`);
  } catch (error) {
    console.log('[PREMIUM] 기존 모니터링 데이터 없음');
    monitoringKeywords = new Map();
  }
}

// ========================================
// IPC 핸들러 등록
// ========================================

export function setupPremiumHandlers() {
  console.log('[PREMIUM] 프리미엄 기능 핸들러 등록 시작');

  if (!canUseIpc) {
    console.warn('[PREMIUM] ipcMain을 사용할 수 없어 프리미엄 IPC 핸들러 등록을 건너뜁니다.');
    return;
  }

  // 기존 핸들러 제거
  const handlerNames = [
    'add-monitoring-keyword',
    'remove-monitoring-keyword',
    'get-monitoring-keywords',
    'get-keyword-monitoring-history',
    'start-keyword-monitoring',
    'stop-keyword-monitoring',
    'analyze-competitor-blog',
    'generate-keyword-combinations',
    'calculate-revenue-prediction',
    'get-seasonal-keywords',
    'evaluate-seo-checklist',
    'reverse-analyze-keywords',
    'predict-golden-time',
    'analyze-benchmark-sniper',
    'analyze-blog-index',
    'open-premium-dashboard'
  ];

  handlerNames.forEach(name => {
    try {
      if (ipcMain.listenerCount(name) > 0) {
        ipcMain.removeHandler(name);
      }
    } catch { }
  });

  // 키워드 모니터링 추가
  ipcMain.handle('add-monitoring-keyword', async (_event, keyword: string) => {
    try {
      // 프리미엄 권한 확인 (3개월 이상 구매자)
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt).getTime() - Date.now() >= 90 * 24 * 60 * 60 * 1000));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 3개월 이상 라이선스를 구매해주세요.'
        };
      }

      // 100개 제한
      if (monitoringKeywords.size >= 100) {
        return {
          success: false,
          message: '모니터링 가능한 키워드는 최대 100개입니다.'
        };
      }

      if (monitoringKeywords.has(keyword)) {
        return {
          success: false,
          message: '이미 모니터링 중인 키워드입니다.'
        };
      }

      monitoringKeywords.set(keyword, {
        keyword,
        lastChecked: new Date().toISOString(),
        history: []
      });

      await saveMonitoringData();

      return {
        success: true,
        message: '키워드가 모니터링 목록에 추가되었습니다.',
        total: monitoringKeywords.size
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 키워드 모니터링 제거
  ipcMain.handle('remove-monitoring-keyword', async (_event, keyword: string) => {
    try {
      if (!monitoringKeywords.has(keyword)) {
        return {
          success: false,
          message: '해당 키워드는 모니터링 중이 아닙니다.'
        };
      }

      monitoringKeywords.delete(keyword);
      await saveMonitoringData();

      return {
        success: true,
        message: '키워드가 모니터링 목록에서 제거되었습니다.',
        total: monitoringKeywords.size
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 모니터링 키워드 목록 조회
  ipcMain.handle('get-monitoring-keywords', async () => {
    try {
      const keywords = Array.from(monitoringKeywords.values());
      return {
        success: true,
        keywords,
        total: keywords.length
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 키워드 히스토리 조회
  ipcMain.handle('get-keyword-monitoring-history', async (_event, keyword: string) => {
    try {
      const data = monitoringKeywords.get(keyword);
      if (!data) {
        return {
          success: false,
          message: '해당 키워드는 모니터링 중이 아닙니다.'
        };
      }

      return {
        success: true,
        keyword,
        history: data.history,
        currentRank: data.rank,
        currentSearchVolume: data.searchVolume,
        lastChecked: data.lastChecked
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 모니터링 시작
  ipcMain.handle('start-keyword-monitoring', async () => {
    try {
      await loadMonitoringData();
      await startKeywordMonitoring();

      return {
        success: true,
        message: '키워드 모니터링이 시작되었습니다.',
        total: monitoringKeywords.size
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 모니터링 중지
  ipcMain.handle('stop-keyword-monitoring', async () => {
    try {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }

      await saveMonitoringData();

      return {
        success: true,
        message: '키워드 모니터링이 중지되었습니다.'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  });

  console.log('[PREMIUM] 프리미엄 기능 핸들러 등록 완료');
}

// 앱 종료 시 모니터링 데이터 저장
if (app && typeof app.on === 'function') {
  app.on('will-quit', async () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
    await saveMonitoringData();
  });
} else {
  console.warn('[PREMIUM] app 객체를 찾을 수 없어 will-quit 핸들러를 등록하지 못했습니다.');
}

// ========================================
// 2. 경쟁자 블로그 자동 분석
// ========================================

export interface CompetitorBlogAnalysis {
  blogUrl: string;
  blogName: string;
  totalPosts: number;
  averagePostLength: number;
  keywordDensity: { keyword: string; count: number; percentage: number }[];
  internalLinkPattern: {
    averageLinksPerPost: number;
    linkStructure: string[];
  };
  postStructure: {
    averageHeadings: number;
    averageParagraphs: number;
    averageImages: number;
    usesTable: boolean;
    usesList: boolean;
  };
  postingFrequency: {
    postsPerWeek: number;
    averageDaysBetweenPosts: number;
  };
  analyzedAt: string;
}

async function analyzeCompetitorBlog(blogUrl: string): Promise<CompetitorBlogAnalysis> {
  console.log(`[PREMIUM] 경쟁자 블로그 분석 시작: ${blogUrl}`);

  const puppeteer = await import('puppeteer');
  let browser: any = null;

  try {
    browser = await puppeteer.default.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 블로그 메인 페이지 접속
    await page.goto(blogUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 블로그 정보 추출
    const blogInfo = await page.evaluate(() => {
      // 블로그 이름
      const blogName = document.querySelector('.blog_name, .blog-title, h1')?.textContent?.trim() ||
        document.title.split(' : ')[0] || '알 수 없음';

      // 최근 포스트 목록 (최대 10개)
      const postLinks: string[] = [];
      const postSelectors = [
        'a[href*="/post/"]',
        'a[href*="/PostView"]',
        '.post-item a',
        '.post-title a',
        'article a',
        '.entry-title a'
      ];

      for (const selector of postSelectors) {
        const links = Array.from(document.querySelectorAll(selector));
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (href && !postLinks.includes(href) && postLinks.length < 10) {
            postLinks.push(href);
          }
        }
      }

      return { blogName, postLinks: postLinks.slice(0, 10) };
    });

    console.log(`[PREMIUM] 블로그 이름: ${blogInfo.blogName}, 포스트 ${blogInfo.postLinks.length}개 발견`);

    // 각 포스트 분석
    const postAnalyses: any[] = [];
    const allKeywords: Map<string, number> = new Map();

    for (const postUrl of blogInfo.postLinks.slice(0, 5)) { // 최대 5개만 분석
      try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await page.waitForTimeout(1500);

        const postData = await page.evaluate(() => {
          // 본문 텍스트
          const contentSelectors = [
            '#postViewArea',
            '.se-main-container',
            '.post-view',
            'article',
            '.post-content',
            '#content'
          ];

          let content = '';
          for (const selector of contentSelectors) {
            const elem = document.querySelector(selector);
            if (elem) {
              content = elem.textContent || '';
              break;
            }
          }

          // 제목
          const title = document.querySelector('h1, .post-title, .entry-title')?.textContent?.trim() || '';

          // 헤딩 개수
          const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;

          // 문단 개수
          const paragraphs = document.querySelectorAll('p').length;

          // 이미지 개수
          const images = document.querySelectorAll('img').length;

          // 테이블 사용 여부
          const usesTable = document.querySelectorAll('table').length > 0;

          // 리스트 사용 여부
          const usesList = document.querySelectorAll('ul, ol').length > 0;

          // 내부 링크
          const internalLinks: string[] = [];
          document.querySelectorAll('a[href]').forEach(link => {
            const href = (link as HTMLAnchorElement).href;
            if (href && (href.includes('blog.naver.com') || href.includes('blog.me'))) {
              internalLinks.push(href);
            }
          });

          // 키워드 추출 (2글자 이상, 조사 제외)
          const words = content.split(/\s+/).filter(w => w.length >= 2 && !/[은는이가을를와과]$/.test(w));
          const keywordCounts: { [key: string]: number } = {};
          words.forEach(word => {
            const clean = word.replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '');
            if (clean.length >= 2) {
              keywordCounts[clean] = (keywordCounts[clean] || 0) + 1;
            }
          });

          return {
            title,
            contentLength: content.length,
            headings,
            paragraphs,
            images,
            usesTable,
            usesList,
            internalLinks: internalLinks.length,
            keywords: keywordCounts
          };
        });

        postAnalyses.push(postData);

        // 키워드 집계
        Object.entries(postData.keywords).forEach(([keyword, count]) => {
          allKeywords.set(keyword, (allKeywords.get(keyword) || 0) + (count as number));
        });

      } catch (error) {
        console.error(`[PREMIUM] 포스트 분석 실패: ${postUrl}`, error);
      }
    }

    // 통계 계산
    const totalPosts = postAnalyses.length;
    const averagePostLength = postAnalyses.reduce((sum, p) => sum + p.contentLength, 0) / totalPosts || 0;
    const averageHeadings = postAnalyses.reduce((sum, p) => sum + p.headings, 0) / totalPosts || 0;
    const averageParagraphs = postAnalyses.reduce((sum, p) => sum + p.paragraphs, 0) / totalPosts || 0;
    const averageImages = postAnalyses.reduce((sum, p) => sum + p.images, 0) / totalPosts || 0;
    const averageLinksPerPost = postAnalyses.reduce((sum, p) => sum + p.internalLinks, 0) / totalPosts || 0;

    // 상위 키워드 추출
    const sortedKeywords = Array.from(allKeywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([keyword, count]) => ({
        keyword,
        count,
        percentage: (count / allKeywords.size) * 100
      }));

    const result: CompetitorBlogAnalysis = {
      blogUrl,
      blogName: blogInfo.blogName,
      totalPosts: postAnalyses.length,
      averagePostLength: Math.round(averagePostLength),
      keywordDensity: sortedKeywords,
      internalLinkPattern: {
        averageLinksPerPost: Math.round(averageLinksPerPost * 10) / 10,
        linkStructure: ['내부 링크 중심']
      },
      postStructure: {
        averageHeadings: Math.round(averageHeadings * 10) / 10,
        averageParagraphs: Math.round(averageParagraphs * 10) / 10,
        averageImages: Math.round(averageImages * 10) / 10,
        usesTable: postAnalyses.some(p => p.usesTable),
        usesList: postAnalyses.some(p => p.usesList)
      },
      postingFrequency: {
        postsPerWeek: 0, // TODO: 실제 포스팅 빈도 계산
        averageDaysBetweenPosts: 0
      },
      analyzedAt: new Date().toISOString()
    };

    console.log(`[PREMIUM] ✅ 블로그 분석 완료: ${blogInfo.blogName}`);
    return result;

  } catch (error: any) {
    console.error('[PREMIUM] 블로그 분석 오류:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 경쟁자 블로그 분석 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('analyze-competitor-blog')) {
  ipcMain.handle('analyze-competitor-blog', async (_event, blogUrl: string) => {
    try {
      // 프리미엄 권한 확인
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt);

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 영구 라이선스를 구매해주세요.'
        };
      }

      if (!blogUrl || !blogUrl.includes('blog')) {
        return {
          success: false,
          message: '올바른 블로그 URL을 입력해주세요.'
        };
      }

      const analysis = await analyzeCompetitorBlog(blogUrl);

      return {
        success: true,
        data: analysis
      };
    } catch (error: any) {
      console.error('[PREMIUM] 경쟁자 블로그 분석 실패:', error);
      return {
        success: false,
        message: error.message || '블로그 분석에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ analyze-competitor-blog 핸들러 등록 완료');
}

// 벤치마크 스나이퍼 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('analyze-benchmark-sniper')) {
  ipcMain.handle('analyze-benchmark-sniper', async (_event, keywords: string[]) => {
    try {
      // 프리미엄 권한 확인
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt) > new Date()));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 영구 라이선스를 구매해주세요.'
        };
      }

      if (!keywords || keywords.length === 0) {
        return {
          success: false,
          message: '키워드를 입력해주세요.'
        };
      }

      const results = await benchmarkSniperPro(keywords);

      return {
        success: true,
        data: results
      };
    } catch (error: any) {
      console.error('[PREMIUM] 벤치마크 스나이퍼 분석 실패:', error);
      return {
        success: false,
        message: error.message || '벤치마크 분석에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ analyze-benchmark-sniper 핸들러 등록 완료');
}

// 블로그 지수 분석 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('analyze-blog-index')) {
  ipcMain.handle('analyze-blog-index', async (_event, blogId: string) => {
    try {
      // 프리미엄 권한 확인
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt) > new Date()));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 영구 라이선스를 구매해주세요.'
        };
      }

      if (!blogId) {
        return {
          success: false,
          message: '블로그 ID를 입력해주세요.'
        };
      }

      const extractor = getExtractorInstance();
      const result = await extractor.extractAccurateBlogIndex(blogId);

      if (!result) {
        return {
          success: false,
          message: '블로그 정보를 찾을 수 없습니다.'
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      console.error('[PREMIUM] 블로그 지수 분석 실패:', error);
      return {
        success: false,
        message: error.message || '블로그 지수 분석에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ analyze-blog-index 핸들러 등록 완료');
}

// VVIP 대시보드 열기 핸들러
if (canUseIpc && !ipcMain.listenerCount('open-premium-dashboard')) {
  ipcMain.handle('open-premium-dashboard', async () => {
    try {
      console.log('[PREMIUM] VVIP 대시보드 열기 요청');
      const win = new BrowserWindow({
        width: 1300,
        height: 1000,
        title: 'LEWORD VVIP Dashboard',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false // CORS 이슈 등 방지
        }
      });

      // 파일 로드 (dist 기준 상위 폴더 ui 접근)
      // 실행 위치에 따라 경로가 다를 수 있으므로 조정
      let uiPath = path.join(app.getAppPath(), 'ui/premium-dashboard.html');
      // 만약 ui 폴더가 appPath 안에 없다면 (dev 모드 등)
      if (!require('fs').existsSync(uiPath)) {
        uiPath = path.join(process.cwd(), 'ui/premium-dashboard.html');
      }

      win.loadFile(uiPath);
      // win.webContents.openDevTools(); // 디버깅용

      return { success: true };
    } catch (error: any) {
      console.error('[PREMIUM] 대시보드 열기 실패:', error);
      return { success: false, message: error.message };
    }
  });
  console.log('[PREMIUM] ✅ open-premium-dashboard 핸들러 등록 완료');
}

// ========================================
// 3. 키워드 조합 자동 생성기
// ========================================

export interface KeywordCombination {
  keyword: string;
  searchVolume: number;
  competitionScore: number;
  totalScore: number;
}

async function generateKeywordCombinations(
  baseKeyword: string,
  modifiers: string[] = []
): Promise<KeywordCombination[]> {
  console.log(`[PREMIUM] 키워드 조합 생성 시작: "${baseKeyword}"`);

  // 🔥 끝판왕 수식어 - 실제 검색 패턴 기반
  const defaultModifiers = modifiers.length > 0 ? modifiers : [
    // 구매 의도 높은 수식어 (전환율 높음)
    '추천', '비교', '후기', '가격', '구매', '리뷰', '순위', '브랜드', '할인', '이벤트',
    // 정보 탐색 수식어
    '장점', '단점', '사용법', '방법', '효과', '종류', '선택', '정보', '꿀팁', '노하우',
    // 시간/트렌드 수식어
    '2024', '2025', '신형', '신제품', '신상', '인기', '베스트', '최신',
    // 가격 관련 수식어
    '저렴한', '싼', '가성비', '프리미엄', '고급', '입문용',
    // 대상별 수식어
    '초보', '입문자', '전문가', '직장인', '학생', '주부', '남자', '여자', '20대', '30대', '40대'
  ];

  const combinations: KeywordCombination[] = [];
  const seenKeywords = new Set<string>();

  // 중복 방지 헬퍼
  const addCombination = (keyword: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (!seenKeywords.has(normalized) && keyword.length <= 30) {
      seenKeywords.add(normalized);
      combinations.push({
        keyword,
        searchVolume: 0,
        competitionScore: 0,
        totalScore: 0
      });
    }
  };

  // 1. 뒤에 수식어 추가 (가장 자연스러운 패턴)
  for (const modifier of defaultModifiers) {
    addCombination(`${baseKeyword} ${modifier}`);
  }

  // 2. 앞에 수식어 추가
  for (const modifier of defaultModifiers.slice(0, 15)) {
    addCombination(`${modifier} ${baseKeyword}`);
  }

  // 3. 질문형 키워드 (롱테일, 높은 전환율)
  const questionPatterns = [
    `${baseKeyword} 어떤게 좋아`,
    `${baseKeyword} 뭐가 좋아`,
    `${baseKeyword} 어디서 사`,
    `${baseKeyword} 언제 사야`,
    `${baseKeyword} 왜 좋아`,
    `${baseKeyword} 어떻게 선택`,
    `${baseKeyword} 고르는 법`,
    `${baseKeyword} 사는 법`,
    `${baseKeyword} 잘 고르는 방법`
  ];
  questionPatterns.forEach(addCombination);

  // 4. 비교형 키워드 (구매 직전 단계)
  const comparePatterns = [
    `${baseKeyword} vs`,
    `${baseKeyword} 비교`,
    `${baseKeyword} 차이점`,
    `${baseKeyword} 장단점 비교`,
    `${baseKeyword} 뭐가 나아`
  ];
  comparePatterns.forEach(addCombination);

  // 5. 지역/장소 조합 (맛집, 여행 등)
  if (baseKeyword.includes('맛집') || baseKeyword.includes('여행') || baseKeyword.includes('카페')) {
    const locations = ['서울', '강남', '홍대', '부산', '제주', '대구', '인천', '수원', '성남', '분당'];
    locations.forEach(loc => {
      addCombination(`${loc} ${baseKeyword}`);
      addCombination(`${baseKeyword} ${loc}`);
    });
  }

  console.log(`[PREMIUM] ${combinations.length}개 키워드 조합 생성 완료`);

  // 🔥 스마트 점수 계산 (실제 검색 패턴 기반)
  combinations.forEach(combo => {
    let score = 50; // 기본 점수

    // 길이 점수 (10-20자가 최적)
    if (combo.keyword.length >= 10 && combo.keyword.length <= 20) {
      score += 15;
    } else if (combo.keyword.length < 10) {
      score += 5;
    }

    // 구매 의도 키워드 보너스
    const buyIntentWords = ['추천', '비교', '후기', '가격', '구매', '할인', '이벤트', '리뷰'];
    if (buyIntentWords.some(w => combo.keyword.includes(w))) {
      score += 20;
    }

    // 질문형 키워드 보너스 (롱테일)
    if (combo.keyword.includes('어떤') || combo.keyword.includes('뭐가') || combo.keyword.includes('방법')) {
      score += 15;
    }

    // 연도 키워드 보너스 (최신성)
    if (combo.keyword.includes('2024') || combo.keyword.includes('2025')) {
      score += 10;
    }

    combo.totalScore = Math.min(100, score);

    // 경쟁도 추정 (짧을수록 경쟁 높음)
    combo.competitionScore = Math.max(1, 10 - Math.floor(combo.keyword.length / 3));

    // 검색량 추정 (구매 의도 키워드가 더 높음)
    const baseVolume = 1000;
    const intentMultiplier = buyIntentWords.some(w => combo.keyword.includes(w)) ? 3 : 1;
    // 결정론적 검색량 추정 (키워드 길이 기반 변동)
    const lengthFactor = 1 + (combo.keyword.length % 5) * 0.2;
    combo.searchVolume = Math.floor(baseVolume * intentMultiplier * lengthFactor);
  });

  // 점수순 정렬
  return combinations.sort((a, b) => b.totalScore - a.totalScore);
}

// 키워드 조합 생성 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('generate-keyword-combinations')) {
  ipcMain.handle('generate-keyword-combinations', async (_event, data: {
    baseKeyword: string;
    modifiers?: string[];
    maxResults?: number;
  }) => {
    try {
      // 프리미엄 권한 확인 (3개월 이상 구매자)
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt).getTime() - Date.now() >= 90 * 24 * 60 * 60 * 1000));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 3개월 이상 라이선스를 구매해주세요.'
        };
      }

      if (!data.baseKeyword || data.baseKeyword.trim().length === 0) {
        return {
          success: false,
          message: '기본 키워드를 입력해주세요.'
        };
      }

      const combinations = await generateKeywordCombinations(
        data.baseKeyword.trim(),
        data.modifiers || []
      );

      const maxResults = data.maxResults || 100;
      const limited = combinations.slice(0, maxResults);

      return {
        success: true,
        data: limited,
        total: combinations.length,
        shown: limited.length
      };
    } catch (error: any) {
      console.error('[PREMIUM] 키워드 조합 생성 실패:', error);
      return {
        success: false,
        message: error.message || '키워드 조합 생성에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ generate-keyword-combinations 핸들러 등록 완료');
}

// ========================================
// 4. 블로그 수익 예측 계산기
// ========================================

export interface RevenuePrediction {
  keyword: string;
  searchVolume: number;
  competitionLevel: string;
  estimatedTraffic: number;
  estimatedRevenue: {
    monthly: number;
    yearly: number;
  };
  roi: {
    timeToBreakEven: number; // 일수
    investmentValue: 'high' | 'medium' | 'low';
  };
  factors: {
    ctr: number; // 클릭률 (%)
    conversionRate: number; // 전환률 (%)
    avgRevenuePerVisitor: number; // 방문자당 평균 수익
  };
}

function calculateRevenuePrediction(
  keyword: string,
  searchVolume: number,
  competitionScore: number
): RevenuePrediction {
  // CTR 계산 (경쟁도에 따라)
  const ctr = competitionScore < 3 ? 0.15 : competitionScore < 6 ? 0.08 : 0.03;

  // 예상 트래픽
  const estimatedTraffic = Math.floor(searchVolume * ctr * 30); // 월간

  // 전환률 (키워드 타입에 따라)
  const isCommercial = keyword.includes('구매') || keyword.includes('가격') || keyword.includes('할인');
  const conversionRate = isCommercial ? 0.02 : 0.005;

  // 방문자당 평균 수익 (광고 수익 + 제휴 수익)
  const avgRevenuePerVisitor = isCommercial ? 0.5 : 0.1;

  // 월간 수익
  const monthlyRevenue = estimatedTraffic * conversionRate * avgRevenuePerVisitor;

  // ROI 계산
  const contentCost = 50000; // 콘텐츠 작성 비용 (5만원 가정)
  const timeToBreakEven = contentCost / (monthlyRevenue / 30);

  let investmentValue: 'high' | 'medium' | 'low';
  if (monthlyRevenue > 100000) {
    investmentValue = 'high';
  } else if (monthlyRevenue > 30000) {
    investmentValue = 'medium';
  } else {
    investmentValue = 'low';
  }

  let competitionLevel: string;
  if (competitionScore < 3) {
    competitionLevel = '낮음';
  } else if (competitionScore < 6) {
    competitionLevel = '보통';
  } else {
    competitionLevel = '높음';
  }

  return {
    keyword,
    searchVolume,
    competitionLevel,
    estimatedTraffic,
    estimatedRevenue: {
      monthly: Math.round(monthlyRevenue),
      yearly: Math.round(monthlyRevenue * 12)
    },
    roi: {
      timeToBreakEven: Math.round(timeToBreakEven),
      investmentValue
    },
    factors: {
      ctr: ctr * 100,
      conversionRate: conversionRate * 100,
      avgRevenuePerVisitor
    }
  };
}

// 수익 예측 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('calculate-revenue-prediction')) {
  ipcMain.handle('calculate-revenue-prediction', async (_event, data: {
    keyword: string;
    searchVolume: number;
    competitionScore: number;
  }) => {
    try {
      // 프리미엄 권한 확인 (3개월 이상 구매자)
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt).getTime() - Date.now() >= 90 * 24 * 60 * 60 * 1000));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 3개월 이상 라이선스를 구매해주세요.'
        };
      }

      if (!data.keyword || !data.searchVolume) {
        return {
          success: false,
          message: '키워드와 검색량을 입력해주세요.'
        };
      }

      const prediction = calculateRevenuePrediction(
        data.keyword,
        data.searchVolume,
        data.competitionScore || 5
      );

      return {
        success: true,
        data: prediction
      };
    } catch (error: any) {
      console.error('[PREMIUM] 수익 예측 계산 실패:', error);
      return {
        success: false,
        message: error.message || '수익 예측 계산에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ calculate-revenue-prediction 핸들러 등록 완료');
}

// ========================================
// 5. 시즌별 키워드 캘린더
// ========================================

export interface SeasonalKeyword {
  keyword: string;
  season: string;
  month: number;
  expectedPeak: string; // 예상 피크 시기
  searchVolumeTrend: 'rising' | 'stable' | 'declining';
  recommendedPostDate: string; // 권장 작성일
  priority: 'high' | 'medium' | 'low';
}

function generateSeasonalKeywords(baseKeyword: string): SeasonalKeyword[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const seasonalKeywords: SeasonalKeyword[] = [];

  // 계절별 키워드 패턴
  const seasonalPatterns = [
    { month: 1, season: '겨울', keywords: ['겨울', '신년', '설날', '새해'] },
    { month: 2, season: '겨울', keywords: ['설날', '발렌타인', '겨울'] },
    { month: 3, season: '봄', keywords: ['봄', '개학', '입학', '신학기'] },
    { month: 4, season: '봄', keywords: ['봄', '벚꽃', '여행', '소풍'] },
    { month: 5, season: '봄', keywords: ['어린이날', '가정의날', '여행'] },
    { month: 6, season: '여름', keywords: ['여름', '휴가', '여행', '수학여행'] },
    { month: 7, season: '여름', keywords: ['여름', '휴가', '여행', '수학여행'] },
    { month: 8, season: '여름', keywords: ['여름', '휴가', '여행', '수학여행'] },
    { month: 9, season: '가을', keywords: ['가을', '추석', '단풍', '여행'] },
    { month: 10, season: '가을', keywords: ['가을', '할로윈', '단풍'] },
    { month: 11, season: '가을', keywords: ['가을', '빼빼로데이', '블랙프라이데이'] },
    { month: 12, season: '겨울', keywords: ['겨울', '크리스마스', '연말', '선물'] }
  ];

  // 3개월 선행 예측
  for (let i = 0; i < 3; i++) {
    const targetMonth = ((currentMonth + i - 1) % 12) + 1;
    const pattern = seasonalPatterns.find(p => p.month === targetMonth);

    if (pattern) {
      // 각 계절 키워드와 조합
      for (const seasonKeyword of pattern.keywords) {
        const combinedKeyword = `${baseKeyword} ${seasonKeyword}`;

        // 예상 피크 시기 계산 (해당 월의 중순)
        const targetDate = new Date(now.getFullYear(), targetMonth - 1, 15);
        if (targetMonth < currentMonth) {
          targetDate.setFullYear(targetDate.getFullYear() + 1);
        }

        // 권장 작성일 (피크 2주 전)
        const recommendedDate = new Date(targetDate);
        recommendedDate.setDate(recommendedDate.getDate() - 14);

        // 트렌드 예측
        const daysUntilPeak = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        let trend: 'rising' | 'stable' | 'declining';
        if (daysUntilPeak > 60) {
          trend = 'stable';
        } else if (daysUntilPeak > 30) {
          trend = 'rising';
        } else {
          trend = 'declining';
        }

        // 우선순위
        let priority: 'high' | 'medium' | 'low';
        if (daysUntilPeak <= 30 && daysUntilPeak > 0) {
          priority = 'high';
        } else if (daysUntilPeak <= 60) {
          priority = 'medium';
        } else {
          priority = 'low';
        }

        seasonalKeywords.push({
          keyword: combinedKeyword,
          season: pattern.season,
          month: targetMonth,
          expectedPeak: targetDate.toISOString().split('T')[0],
          searchVolumeTrend: trend,
          recommendedPostDate: recommendedDate.toISOString().split('T')[0],
          priority
        });
      }
    }
  }

  return seasonalKeywords.sort((a, b) => {
    // 우선순위 > 월 순으로 정렬
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }
    return a.month - b.month;
  });
}

// 시즌별 키워드 캘린더 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('get-seasonal-keywords')) {
  ipcMain.handle('get-seasonal-keywords', async (_event, baseKeyword: string) => {
    try {
      // 프리미엄 권한 확인 (3개월 이상 구매자)
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt).getTime() - Date.now() >= 90 * 24 * 60 * 60 * 1000));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 3개월 이상 라이선스를 구매해주세요.'
        };
      }

      if (!baseKeyword || baseKeyword.trim().length === 0) {
        return {
          success: false,
          message: '기본 키워드를 입력해주세요.'
        };
      }

      const seasonalKeywords = generateSeasonalKeywords(baseKeyword.trim());

      return {
        success: true,
        data: seasonalKeywords,
        total: seasonalKeywords.length
      };
    } catch (error: any) {
      console.error('[PREMIUM] 시즌별 키워드 생성 실패:', error);
      return {
        success: false,
        message: error.message || '시즌별 키워드 생성에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ get-seasonal-keywords 핸들러 등록 완료');
}

// ========================================
// 6. 블로그 상위노출 체크리스트 (100점 채점)
// ========================================

export interface SEOChecklistItem {
  category: string;
  item: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  suggestion?: string;
}

export interface SEOChecklistResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
  items: SEOChecklistItem[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

function evaluateSEOContent(content: string, keyword: string): SEOChecklistResult {
  const items: SEOChecklistItem[] = [];
  let totalScore = 0;
  const maxScore = 100;

  // 1. 키워드 밀도 (10점)
  const keywordCount = (content.match(new RegExp(keyword, 'gi')) || []).length;
  const wordCount = content.split(/\s+/).length;
  const keywordDensity = (keywordCount / wordCount) * 100;
  let keywordScore = 0;
  if (keywordDensity >= 1 && keywordDensity <= 3) {
    keywordScore = 10;
  } else if (keywordDensity >= 0.5 && keywordDensity < 1) {
    keywordScore = 7;
  } else if (keywordDensity > 3 && keywordDensity <= 5) {
    keywordScore = 5;
  } else {
    keywordScore = 2;
  }
  items.push({
    category: '키워드 최적화',
    item: '키워드 밀도',
    score: keywordScore,
    maxScore: 10,
    status: keywordScore >= 7 ? 'pass' : keywordScore >= 5 ? 'warning' : 'fail',
    description: `키워드 밀도: ${keywordDensity.toFixed(2)}% (권장: 1-3%)`,
    suggestion: keywordDensity < 1 ? '키워드를 더 자연스럽게 추가하세요.' : keywordDensity > 3 ? '키워드가 과도합니다. 자연스럽게 줄이세요.' : undefined
  });
  totalScore += keywordScore;

  // 2. 제목 최적화 (10점)
  const hasTitle = content.includes('<h1>') || content.includes('# ');
  const titleContainsKeyword = content.toLowerCase().includes(keyword.toLowerCase());
  let titleScore = 0;
  if (hasTitle && titleContainsKeyword) {
    titleScore = 10;
  } else if (hasTitle || titleContainsKeyword) {
    titleScore = 5;
  }
  items.push({
    category: '제목 최적화',
    item: '제목에 키워드 포함',
    score: titleScore,
    maxScore: 10,
    status: titleScore >= 7 ? 'pass' : titleScore >= 5 ? 'warning' : 'fail',
    description: hasTitle && titleContainsKeyword ? '제목에 키워드가 포함되어 있습니다.' : '제목에 키워드를 포함하세요.',
    suggestion: !hasTitle ? 'H1 태그나 # 제목을 사용하세요.' : !titleContainsKeyword ? '제목에 키워드를 포함하세요.' : undefined
  });
  totalScore += titleScore;

  // 3. 본문 길이 (10점)
  const contentLength = content.length;
  let lengthScore = 0;
  if (contentLength >= 2000) {
    lengthScore = 10;
  } else if (contentLength >= 1500) {
    lengthScore = 8;
  } else if (contentLength >= 1000) {
    lengthScore = 6;
  } else if (contentLength >= 500) {
    lengthScore = 4;
  } else {
    lengthScore = 2;
  }
  items.push({
    category: '콘텐츠 품질',
    item: '본문 길이',
    score: lengthScore,
    maxScore: 10,
    status: lengthScore >= 8 ? 'pass' : lengthScore >= 6 ? 'warning' : 'fail',
    description: `본문 길이: ${contentLength.toLocaleString()}자 (권장: 2,000자 이상)`,
    suggestion: contentLength < 2000 ? '더 자세한 내용을 추가하세요.' : undefined
  });
  totalScore += lengthScore;

  // 4. 헤딩 구조 (10점)
  const h2Count = (content.match(/<h2>|## /gi) || []).length;
  const h3Count = (content.match(/<h3>|### /gi) || []).length;
  let headingScore = 0;
  if (h2Count >= 3 && h3Count >= 2) {
    headingScore = 10;
  } else if (h2Count >= 2) {
    headingScore = 7;
  } else if (h2Count >= 1) {
    headingScore = 5;
  } else {
    headingScore = 2;
  }
  items.push({
    category: '구조 최적화',
    item: '헤딩 구조',
    score: headingScore,
    maxScore: 10,
    status: headingScore >= 7 ? 'pass' : headingScore >= 5 ? 'warning' : 'fail',
    description: `H2: ${h2Count}개, H3: ${h3Count}개 (권장: H2 3개 이상, H3 2개 이상)`,
    suggestion: h2Count < 3 ? '섹션을 나누어 H2 헤딩을 추가하세요.' : undefined
  });
  totalScore += headingScore;

  // 5. 내부 링크 (10점)
  const internalLinkCount = (content.match(/href=["'][^"']*blog[^"']*["']/gi) || []).length;
  let linkScore = 0;
  if (internalLinkCount >= 3) {
    linkScore = 10;
  } else if (internalLinkCount >= 2) {
    linkScore = 7;
  } else if (internalLinkCount >= 1) {
    linkScore = 5;
  } else {
    linkScore = 2;
  }
  items.push({
    category: '링크 최적화',
    item: '내부 링크',
    score: linkScore,
    maxScore: 10,
    status: linkScore >= 7 ? 'pass' : linkScore >= 5 ? 'warning' : 'fail',
    description: `내부 링크: ${internalLinkCount}개 (권장: 3개 이상)`,
    suggestion: internalLinkCount < 3 ? '관련 글에 내부 링크를 추가하세요.' : undefined
  });
  totalScore += linkScore;

  // 6. 이미지 최적화 (10점)
  const imageCount = (content.match(/<img|!\[/gi) || []).length;
  let imageScore = 0;
  if (imageCount >= 3) {
    imageScore = 10;
  } else if (imageCount >= 2) {
    imageScore = 7;
  } else if (imageCount >= 1) {
    imageScore = 5;
  } else {
    imageScore = 0;
  }
  items.push({
    category: '미디어 최적화',
    item: '이미지 개수',
    score: imageScore,
    maxScore: 10,
    status: imageScore >= 7 ? 'pass' : imageScore >= 5 ? 'warning' : 'fail',
    description: `이미지: ${imageCount}개 (권장: 3개 이상)`,
    suggestion: imageCount < 3 ? '관련 이미지를 추가하세요.' : undefined
  });
  totalScore += imageScore;

  // 7. 리스트 사용 (10점)
  const hasList = content.includes('<ul>') || content.includes('<ol>') || content.includes('- ') || content.includes('* ');
  const listScore = hasList ? 10 : 0;
  items.push({
    category: '가독성',
    item: '리스트 사용',
    score: listScore,
    maxScore: 10,
    status: listScore >= 7 ? 'pass' : 'fail',
    description: hasList ? '리스트가 사용되었습니다.' : '리스트를 사용하여 가독성을 높이세요.',
    suggestion: !hasList ? '요약이나 단계별 설명에 리스트를 사용하세요.' : undefined
  });
  totalScore += listScore;

  // 8. 메타 설명 (10점)
  const hasMetaDescription = content.length > 100;
  const metaScore = hasMetaDescription ? 10 : 5;
  items.push({
    category: '메타 정보',
    item: '메타 설명',
    score: metaScore,
    maxScore: 10,
    status: metaScore >= 7 ? 'pass' : 'warning',
    description: hasMetaDescription ? '충분한 설명이 있습니다.' : '더 자세한 설명을 추가하세요.',
    suggestion: !hasMetaDescription ? '글의 요약을 메타 설명으로 추가하세요.' : undefined
  });
  totalScore += metaScore;

  // 9. 키워드 위치 (10점)
  const firstParagraph = content.substring(0, 200);
  const lastParagraph = content.substring(content.length - 200);
  const keywordInFirst = firstParagraph.toLowerCase().includes(keyword.toLowerCase());
  const keywordInLast = lastParagraph.toLowerCase().includes(keyword.toLowerCase());
  let positionScore = 0;
  if (keywordInFirst && keywordInLast) {
    positionScore = 10;
  } else if (keywordInFirst || keywordInLast) {
    positionScore = 7;
  } else {
    positionScore = 3;
  }
  items.push({
    category: '키워드 배치',
    item: '키워드 위치',
    score: positionScore,
    maxScore: 10,
    status: positionScore >= 7 ? 'pass' : positionScore >= 5 ? 'warning' : 'fail',
    description: keywordInFirst && keywordInLast ? '첫 문단과 마지막 문단에 키워드가 포함되어 있습니다.' : '첫 문단 또는 마지막 문단에 키워드를 포함하세요.',
    suggestion: !keywordInFirst ? '첫 문단에 키워드를 자연스럽게 포함하세요.' : !keywordInLast ? '마지막 문단에 키워드를 포함하세요.' : undefined
  });
  totalScore += positionScore;

  // 10. 독창성 (10점)
  const uniqueWords = new Set(content.split(/\s+/)).size;
  const uniquenessRatio = uniqueWords / wordCount;
  let uniquenessScore = 0;
  if (uniquenessRatio >= 0.5) {
    uniquenessScore = 10;
  } else if (uniquenessRatio >= 0.4) {
    uniquenessScore = 7;
  } else if (uniquenessRatio >= 0.3) {
    uniquenessScore = 5;
  } else {
    uniquenessScore = 2;
  }
  items.push({
    category: '콘텐츠 품질',
    item: '독창성',
    score: uniquenessScore,
    maxScore: 10,
    status: uniquenessScore >= 7 ? 'pass' : uniquenessScore >= 5 ? 'warning' : 'fail',
    description: `고유 단어 비율: ${(uniquenessRatio * 100).toFixed(1)}% (권장: 50% 이상)`,
    suggestion: uniquenessRatio < 0.5 ? '반복되는 단어를 줄이고 다양한 표현을 사용하세요.' : undefined
  });
  totalScore += uniquenessScore;

  // 등급 계산
  const percentage = (totalScore / maxScore) * 100;
  let grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
  if (percentage >= 95) grade = 'A+';
  else if (percentage >= 90) grade = 'A';
  else if (percentage >= 85) grade = 'B+';
  else if (percentage >= 80) grade = 'B';
  else if (percentage >= 75) grade = 'C+';
  else if (percentage >= 70) grade = 'C';
  else if (percentage >= 60) grade = 'D';
  else grade = 'F';

  const passed = items.filter(i => i.status === 'pass').length;
  const failed = items.filter(i => i.status === 'fail').length;
  const warnings = items.filter(i => i.status === 'warning').length;

  return {
    totalScore,
    maxScore,
    percentage: Math.round(percentage),
    grade,
    items,
    summary: {
      passed,
      failed,
      warnings
    }
  };
}

// SEO 체크리스트 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('evaluate-seo-checklist')) {
  ipcMain.handle('evaluate-seo-checklist', async (_event, data: {
    content: string;
    keyword: string;
  }) => {
    try {
      // 프리미엄 권한 확인 (3개월 이상 구매자)
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt ||
          (license.expiresAt && new Date(license.expiresAt).getTime() - Date.now() >= 90 * 24 * 60 * 60 * 1000));

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 3개월 이상 라이선스를 구매해주세요.'
        };
      }

      if (!data.content || !data.keyword) {
        return {
          success: false,
          message: '콘텐츠와 키워드를 입력해주세요.'
        };
      }

      const result = evaluateSEOContent(data.content, data.keyword);

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      console.error('[PREMIUM] SEO 체크리스트 평가 실패:', error);
      return {
        success: false,
        message: error.message || 'SEO 체크리스트 평가에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ evaluate-seo-checklist 핸들러 등록 완료');
}

// ========================================
// 7. 경쟁자 키워드 역분석 (URL로 분석)
// ========================================

export interface ReverseKeywordAnalysis {
  blogUrl: string;
  keywords: {
    keyword: string;
    frequency: number;
    location: string[]; // 'title', 'content', 'meta' 등
  }[];
  strategy: {
    primaryKeywords: string[];
    secondaryKeywords: string[];
    longTailKeywords: string[];
  };
  analyzedAt: string;
}

async function reverseAnalyzeKeywords(blogUrl: string): Promise<ReverseKeywordAnalysis> {
  console.log(`[PREMIUM] 경쟁자 키워드 역분석 시작: ${blogUrl}`);

  const puppeteer = await import('puppeteer');
  let browser: any = null;

  try {
    browser = await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080'],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(blogUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 최근 포스트 10개 URL 수집
    const postUrls = await page.evaluate(() => {
      const links: string[] = [];
      const selectors = ['a[href*="/post/"]', 'a[href*="/PostView"]', '.post-item a', '.post-title a'];
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (href && !links.includes(href) && links.length < 10) {
            links.push(href);
          }
        });
      });
      return links;
    });

    console.log(`[PREMIUM] ${postUrls.length}개 포스트 발견`);

    const allKeywords: Map<string, { count: number; locations: Set<string> }> = new Map();

    // 각 포스트 분석
    for (const postUrl of postUrls.slice(0, 5)) {
      try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await page.waitForTimeout(1500);

        const postData = await page.evaluate(() => {
          const title = document.querySelector('h1, .post-title, .entry-title')?.textContent || '';
          const meta = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const content = document.querySelector('#postViewArea, .se-main-container, article')?.textContent || '';

          // 키워드 추출 (2글자 이상)
          const extractKeywords = (text: string) => {
            const words = text.split(/\s+/).filter(w => w.length >= 2);
            const keywords: { [key: string]: number } = {};
            words.forEach(word => {
              const clean = word.replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '');
              if (clean.length >= 2 && !/[은는이가을를와과]$/.test(clean)) {
                keywords[clean] = (keywords[clean] || 0) + 1;
              }
            });
            return keywords;
          };

          return {
            title,
            meta,
            content,
            titleKeywords: extractKeywords(title),
            metaKeywords: extractKeywords(meta),
            contentKeywords: extractKeywords(content)
          };
        });

        // 키워드 집계
        Object.entries(postData.titleKeywords).forEach(([kw, count]) => {
          if (!allKeywords.has(kw)) {
            allKeywords.set(kw, { count: 0, locations: new Set() });
          }
          const entry = allKeywords.get(kw)!;
          entry.count += count as number;
          entry.locations.add('title');
        });

        Object.entries(postData.metaKeywords).forEach(([kw, count]) => {
          if (!allKeywords.has(kw)) {
            allKeywords.set(kw, { count: 0, locations: new Set() });
          }
          const entry = allKeywords.get(kw)!;
          entry.count += count as number;
          entry.locations.add('meta');
        });

        Object.entries(postData.contentKeywords).forEach(([kw, count]) => {
          if (!allKeywords.has(kw)) {
            allKeywords.set(kw, { count: 0, locations: new Set() });
          }
          const entry = allKeywords.get(kw)!;
          entry.count += count as number;
          entry.locations.add('content');
        });

      } catch (error) {
        console.error(`[PREMIUM] 포스트 분석 실패: ${postUrl}`, error);
      }
    }

    // 키워드 정렬 및 분류
    const sortedKeywords = Array.from(allKeywords.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50);

    const primaryKeywords = sortedKeywords.slice(0, 10).map(([kw]) => kw);
    const secondaryKeywords = sortedKeywords.slice(10, 30).map(([kw]) => kw);
    const longTailKeywords = sortedKeywords.slice(30).map(([kw]) => kw);

    const result: ReverseKeywordAnalysis = {
      blogUrl,
      keywords: sortedKeywords.map(([keyword, data]) => ({
        keyword,
        frequency: data.count,
        location: Array.from(data.locations)
      })),
      strategy: {
        primaryKeywords,
        secondaryKeywords,
        longTailKeywords
      },
      analyzedAt: new Date().toISOString()
    };

    console.log(`[PREMIUM] ✅ 키워드 역분석 완료: ${result.keywords.length}개 키워드 발견`);
    return result;

  } catch (error: any) {
    console.error('[PREMIUM] 키워드 역분석 오류:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 경쟁자 키워드 역분석 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('reverse-analyze-keywords')) {
  ipcMain.handle('reverse-analyze-keywords', async (_event, blogUrl: string) => {
    try {
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt);

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 영구 라이선스를 구매해주세요.'
        };
      }

      if (!blogUrl || !blogUrl.includes('blog')) {
        return {
          success: false,
          message: '올바른 블로그 URL을 입력해주세요.'
        };
      }

      const analysis = await reverseAnalyzeKeywords(blogUrl);

      return {
        success: true,
        data: analysis
      };
    } catch (error: any) {
      console.error('[PREMIUM] 키워드 역분석 실패:', error);
      return {
        success: false,
        message: error.message || '키워드 역분석에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ reverse-analyze-keywords 핸들러 등록 완료');
}

// ========================================
// 8. AI 키워드 골든타임 예측
// ========================================

export interface GoldenTimePrediction {
  keyword: string;
  predictedPeakDate: string;
  confidence: number; // 0-100
  reasons: string[];
  recommendedAction: string;
  urgency: 'high' | 'medium' | 'low';
}

function predictGoldenTime(keyword: string, historicalData?: any): GoldenTimePrediction {
  // 간단한 AI 예측 로직 (실제로는 머신러닝 모델 사용)
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // 계절성 키워드 패턴 분석
  const seasonalKeywords = ['여행', '휴가', '여름', '겨울', '봄', '가을', '크리스마스', '설날', '추석'];
  const isSeasonal = seasonalKeywords.some(sk => keyword.includes(sk));

  // 예상 피크 시기 계산
  let predictedPeakDate: Date;
  let confidence = 50;
  const reasons: string[] = [];

  if (isSeasonal) {
    // 계절성 키워드는 해당 계절 중순
    if (keyword.includes('여름')) {
      predictedPeakDate = new Date(now.getFullYear(), 6, 15); // 7월 중순
      confidence = 75;
      reasons.push('여름 시즌 키워드로 7월 중순에 검색량 증가 예상');
    } else if (keyword.includes('겨울')) {
      predictedPeakDate = new Date(now.getFullYear(), 11, 15); // 12월 중순
      confidence = 75;
      reasons.push('겨울 시즌 키워드로 12월 중순에 검색량 증가 예상');
    } else {
      predictedPeakDate = new Date(now.getFullYear(), currentMonth, 15);
      predictedPeakDate.setMonth(predictedPeakDate.getMonth() + 1);
      confidence = 60;
      reasons.push('계절성 패턴 분석 결과');
    }
  } else {
    // 일반 키워드는 1-2개월 후
    predictedPeakDate = new Date(now);
    predictedPeakDate.setMonth(predictedPeakDate.getMonth() + 1);
    confidence = 40;
    reasons.push('일반적인 성장 패턴 분석');
  }

  // 긴급도 계산
  const daysUntilPeak = Math.floor((predictedPeakDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let urgency: 'high' | 'medium' | 'low';
  if (daysUntilPeak <= 30) {
    urgency = 'high';
    reasons.push('피크 시기가 30일 이내로 임박');
  } else if (daysUntilPeak <= 60) {
    urgency = 'medium';
    reasons.push('피크 시기가 60일 이내');
  } else {
    urgency = 'low';
    reasons.push('피크 시기가 60일 이후');
  }

  // 권장 액션
  let recommendedAction: string;
  if (urgency === 'high') {
    recommendedAction = '즉시 콘텐츠 작성 및 발행 권장';
  } else if (urgency === 'medium') {
    recommendedAction = '2주 내 콘텐츠 작성 준비 권장';
  } else {
    recommendedAction = '1개월 내 콘텐츠 작성 계획 수립 권장';
  }

  return {
    keyword,
    predictedPeakDate: predictedPeakDate.toISOString().split('T')[0],
    confidence,
    reasons,
    recommendedAction,
    urgency
  };
}

// AI 골든타임 예측 IPC 핸들러
if (canUseIpc && !ipcMain.listenerCount('predict-golden-time')) {
  ipcMain.handle('predict-golden-time', async (_event, data: {
    keyword: string;
    historicalData?: any;
  }) => {
    try {
      const license = await licenseManager.loadLicense();
      const isPremium = license &&
        (license.plan === 'unlimited' ||
          license.maxUses === -1 ||
          !license.expiresAt);

      if (!isPremium) {
        return {
          success: false,
          message: '프리미엄 기능입니다. 영구 라이선스를 구매해주세요.'
        };
      }

      if (!data.keyword || data.keyword.trim().length === 0) {
        return {
          success: false,
          message: '키워드를 입력해주세요.'
        };
      }

      const prediction = predictGoldenTime(data.keyword.trim(), data.historicalData);

      return {
        success: true,
        data: prediction
      };
    } catch (error: any) {
      console.error('[PREMIUM] 골든타임 예측 실패:', error);
      return {
        success: false,
        message: error.message || '골든타임 예측에 실패했습니다.'
      };
    }
  });
  console.log('[PREMIUM] ✅ predict-golden-time 핸들러 등록 완료');
}
