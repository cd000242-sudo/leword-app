/**
 * 네이버 접속 제한 우회를 위한 Stealth Browser 설정
 * 실제 브라우저처럼 동작하도록 최적화
 */

import type * as puppeteer from 'puppeteer';
import * as fs from 'fs';

/**
 * 시스템에 설치된 Chrome 경로 찾기
 */
export function getSystemChromePath(): string | undefined {
  const possiblePaths = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe' : '',
    // Mac
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ].filter(p => p);
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log('[BROWSER] ✅ 시스템 Chrome 발견:', p);
        return p;
      }
    } catch (e) {}
  }
  console.log('[BROWSER] ⚠️ 시스템 Chrome 미발견, Puppeteer 기본 브라우저 사용');
  return undefined;
}

/**
 * 랜덤 딜레이 (봇 감지 회피)
 */
export function randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 실제 브라우저처럼 보이는 User-Agent 목록
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

/**
 * 랜덤 User-Agent 선택
 */
export function getRandomUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index] || USER_AGENTS[0] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

/**
 * Stealth 브라우저 설정으로 페이지 구성
 */
export async function setupStealthPage(page: puppeteer.Page): Promise<void> {
  // 1. User-Agent 설정
  const userAgent = getRandomUserAgent();
  await page.setUserAgent(userAgent);
  
  // 2. 추가 헤더 설정 (실제 브라우저처럼)
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  });
  
  // 3. JavaScript 실행 활성화
  await page.setJavaScriptEnabled(true);
  
  // 4. 뷰포트 설정 (일반적인 데스크톱 크기)
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  });
  
  // 5. WebDriver 감지 방지 스크립트 주입 (v2.47.0 P2 강화)
  await page.evaluateOnNewDocument(() => {
    // webdriver 속성 숨기기
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });

    // v2.47.0 P2: Chrome runtime 완전 모킹 (네이버 봇 감지 우회)
    (window as any).chrome = {
      runtime: {
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
      },
      loadTimes: () => ({ requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000 }),
      csi: () => ({ pageT: Date.now(), startE: Date.now(), tran: 15 }),
      app: { isInstalled: false }
    };

    // v2.47.0 P2: Permissions API 완전 모킹
    const originalQuery = (window.navigator as any).permissions?.query;
    if (originalQuery) {
      (window.navigator as any).permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission } as PermissionStatus);
        }
        // 일반 권한도 정상값 반환 (실제 브라우저 흉내)
        return originalQuery(parameters).catch(() =>
          Promise.resolve({ state: 'prompt' } as PermissionStatus)
        );
      };
    }

    // Plugins 모킹 (실제 PluginArray 흉내)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
        ];
        (plugins as any).item = (i: number) => plugins[i];
        (plugins as any).namedItem = (name: string) => plugins.find(p => p.name === name);
        (plugins as any).refresh = () => {};
        return plugins;
      }
    });

    // MimeTypes 모킹
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const types = [{ type: 'application/pdf', suffixes: 'pdf', description: '' }];
        (types as any).item = (i: number) => types[i];
        return types;
      }
    });

    // Languages 설정
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en']
    });

    // v2.47.0 P2: connection 정보 (실제 PC처럼)
    if (!(navigator as any).connection) {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false })
      });
    }
  });
  
  // 6. 쿠키 설정 (네이버 관련)
  await page.setCookie({
    name: 'NID_AUT',
    value: '',
    domain: '.naver.com',
    path: '/'
  });
}

/**
 * Stealth 브라우저로 페이지 로드 (네이버 접속 제한 우회)
 */
export async function loadPageWithStealth(
  page: puppeteer.Page,
  url: string,
  options: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    timeout?: number;
    retries?: number;
  } = {}
): Promise<void> {
  const {
    waitUntil = 'networkidle2',
    timeout = 60000,
    retries = 3
  } = options;
  
  // Stealth 설정 적용
  await setupStealthPage(page);
  
  // 랜덤 딜레이 (첫 접속 전)
  await randomDelay(2000, 4000);
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[STEALTH] 페이지 로드 시도 ${attempt}/${retries}: ${url}`);
      
      // 페이지 이동
      await page.goto(url, {
        waitUntil,
        timeout
      });
      
      // 추가 대기 (JavaScript 실행 대기)
      await page.waitForTimeout(3000 + Math.random() * 2000);
      
      // 에러 페이지 체크
      const pageTitle = await page.title();
      const pageContent = await page.content();
      
      if (pageTitle.includes('에러') || pageTitle.includes('오류') || 
          pageContent.includes('접속이 불가합니다') || 
          pageContent.includes('동시에 접속하는 이용자 수가 많')) {
        throw new Error('네이버 접속 제한 감지됨');
      }
      
      console.log(`[STEALTH] ✅ 페이지 로드 성공: ${url}`);
      return;
      
    } catch (error: any) {
      lastError = error;
      console.warn(`[STEALTH] ⚠️ 페이지 로드 실패 (시도 ${attempt}/${retries}):`, error?.message || error);
      
      if (attempt < retries) {
        // 재시도 전 더 긴 딜레이
        const delay = 5000 * attempt + Math.random() * 3000;
        console.log(`[STEALTH] ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // User-Agent 변경
        const newUserAgent = getRandomUserAgent();
        await page.setUserAgent(newUserAgent);
      }
    }
  }
  
  throw lastError || new Error('페이지 로드 실패');
}

/**
 * Stealth 브라우저 인스턴스 생성 (시스템 Chrome 사용)
 */
export async function createStealthBrowser(options: {
  headless?: boolean | 'new';
  args?: string[];
} = {}): Promise<puppeteer.Browser> {
  const {
    headless = 'new',
    args = []
  } = options;
  
  const defaultArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--start-maximized'
  ];
  
  const { launchCompatibleBrowser } = await import('./puppeteer-pool');
  const browser = await launchCompatibleBrowser({
    headless,
    args: [...defaultArgs, ...args],
    ignoreHTTPSErrors: true
  });
  
  return browser;
}
