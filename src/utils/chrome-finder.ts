/**
 * 🔍 Chrome/Chromium 브라우저 자동 탐지 및 Puppeteer 설정 유틸리티
 * 
 * 우선순위:
 * 1. Puppeteer 번들 Chromium (앱 내장)
 * 2. 시스템 Chrome
 * 3. Edge (Windows)
 * 4. 에러 메시지
 */

import * as fs from 'fs';
import * as path from 'path';

// Chromium 경로 캐시
let cachedChromePath: string | null = null;
let chromiumChecked = false;

function existsFile(filePath: string | undefined): filePath is string {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function addUniquePath(list: string[], candidate: string | undefined): void {
  if (!candidate) return;
  const normalized = path.normalize(candidate);
  if (!list.includes(normalized)) list.push(normalized);
}

function findConfiguredChromePath(): string | undefined {
  const configured = process.env['LEWORD_CHROME_PATH'] || process.env['CHROME_PATH'];
  if (existsFile(configured)) {
    console.log('[CHROME] ✅ 환경변수 Chrome 경로 사용:', configured);
    return configured;
  }
  if (configured) {
    console.warn('[CHROME] ⚠️ 환경변수 Chrome 경로가 존재하지 않음:', configured);
  }
  return undefined;
}

/**
 * v2.44.0: 앱 패키지에 번들된 Chromium 경로를 찾습니다 (최우선).
 *
 * extraResources로 포함되면:
 *   - Packaged: process.resourcesPath/chromium/chrome.exe
 *   - Dev:      <cwd>/resources/chromium/chrome.exe
 *
 * 백신이 시스템 chrome을 차단해도 앱 내장 Chromium은 별도 경로라 종종 통과.
 */
function findBundledChromium(): string | undefined {
  const platform = process.platform;
  const execName = platform === 'win32'
    ? 'chrome.exe'
    : platform === 'darwin'
      ? path.join('Chromium.app', 'Contents', 'MacOS', 'Chromium')
      : 'chrome';

  const bases: string[] = [];
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  const execDir = process.execPath ? path.dirname(process.execPath) : undefined;

  // Electron packaged: resources/chromium/
  addUniquePath(bases, resourcesPath ? path.join(resourcesPath, 'chromium') : undefined);
  // Electron packaged fallback: <app exe dir>/resources/chromium/
  addUniquePath(bases, execDir ? path.join(execDir, 'resources', 'chromium') : undefined);
  // asarUnpack/file-layout variants
  addUniquePath(bases, resourcesPath ? path.join(resourcesPath, 'app.asar.unpacked', 'resources', 'chromium') : undefined);
  addUniquePath(bases, execDir ? path.join(execDir, 'resources', 'app.asar.unpacked', 'resources', 'chromium') : undefined);
  // Dev: <cwd>/resources/chromium/
  addUniquePath(bases, path.join(process.cwd(), 'resources', 'chromium'));
  // Dist/dev when cwd differs from project root
  addUniquePath(bases, path.resolve(__dirname, '..', '..', 'resources', 'chromium'));
  addUniquePath(bases, path.resolve(__dirname, '..', 'resources', 'chromium'));
  // Rare layout: chromium is next to the app executable.
  addUniquePath(bases, execDir ? path.join(execDir, 'chromium') : undefined);

  // 옆에 chrome-win64/chrome-win 디렉토리로 풀린 경우도 대응
  for (const base of [...bases]) {
    addUniquePath(bases, path.join(base, 'chrome-win64'));
    addUniquePath(bases, path.join(base, 'chrome-win'));
    addUniquePath(bases, path.join(base, 'chrome-linux'));
    addUniquePath(bases, path.join(base, 'chrome-mac'));
    addUniquePath(bases, path.join(base, 'chrome-mac-arm64'));
  }

  for (const base of bases) {
    const candidate = path.join(base, execName);
    if (existsFile(candidate)) {
      console.log('[CHROME] ✅ 번들 Chromium 발견:', candidate);
      return candidate;
    }
  }
  return undefined;
}

/**
 * Puppeteer가 다운로드한 Chromium 경로를 찾습니다.
 */
function findPuppeteerChromium(): string | undefined {
  try {
    // 1. puppeteer 패키지에서 직접 경로 가져오기
    const puppeteer = require('puppeteer');
    if (puppeteer.executablePath) {
      const execPath = puppeteer.executablePath();
      if (execPath && fs.existsSync(execPath)) {
        console.log('[CHROME] ✅ Puppeteer Chromium 발견:', execPath);
        return execPath;
      }
    }
  } catch (e) {
    // puppeteer가 없거나 executablePath가 없음
  }

  // 2. 글로벌 캐시에서 찾기 (Puppeteer 21+)
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const globalCachePaths = [
    path.join(homeDir, '.cache', 'puppeteer', 'chrome'),
    path.join(homeDir, 'AppData', 'Local', 'puppeteer', 'chrome'),
  ];

  for (const cachePath of globalCachePaths) {
    if (!fs.existsSync(cachePath)) continue;
    
    try {
      const versions = fs.readdirSync(cachePath).sort().reverse(); // 최신 버전 우선
      for (const version of versions) {
        const versionPath = path.join(cachePath, version);
        const chromePath = findChromiumInPlatformDir(versionPath);
        if (chromePath) {
          console.log('[CHROME] ✅ Puppeteer 캐시 Chromium 발견:', chromePath);
          return chromePath;
        }
      }
    } catch (e) {
      continue;
    }
  }

  // 3. node_modules에서 직접 찾기 (레거시)
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium'),
    path.join(__dirname, '..', '..', 'node_modules', 'puppeteer', '.local-chromium'),
  ];

  for (const basePath of possiblePaths) {
    if (!fs.existsSync(basePath)) continue;
    
    try {
      const platforms = fs.readdirSync(basePath);
      for (const platform of platforms) {
        const chromePath = findChromiumInPlatformDir(path.join(basePath, platform));
        if (chromePath) {
          console.log('[CHROME] ✅ Puppeteer Chromium 발견:', chromePath);
          return chromePath;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return undefined;
}

/**
 * Playwright/Patchright가 이미 내려받은 Chromium을 찾습니다.
 * 기본 launch가 ms-playwright의 "현재 버전"만 찾다가 실패하는 경우가 있어,
 * 캐시에 남아있는 실행 가능한 Chromium을 직접 executablePath로 지정합니다.
 */
function findPlaywrightChromium(): string | undefined {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || (homeDir ? path.join(homeDir, 'AppData', 'Local') : '');
  const browserPathEnv = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const roots: string[] = [];

  if (browserPathEnv && browserPathEnv !== '0') addUniquePath(roots, browserPathEnv);
  addUniquePath(roots, localAppData ? path.join(localAppData, 'ms-playwright') : undefined);
  addUniquePath(roots, homeDir ? path.join(homeDir, 'AppData', 'Local', 'ms-playwright') : undefined);
  addUniquePath(roots, homeDir ? path.join(homeDir, '.cache', 'ms-playwright') : undefined);
  addUniquePath(roots, path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers'));
  addUniquePath(roots, path.join(process.cwd(), 'node_modules', 'patchright-core', '.local-browsers'));
  addUniquePath(roots, path.join(__dirname, '..', '..', 'node_modules', 'playwright-core', '.local-browsers'));
  addUniquePath(roots, path.join(__dirname, '..', '..', 'node_modules', 'patchright-core', '.local-browsers'));

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const versions = fs.readdirSync(root)
        .filter(name => /^chromium-/.test(name))
        .sort()
        .reverse();
      for (const version of versions) {
        const chromePath = findChromiumInPlatformDir(path.join(root, version));
        if (chromePath) {
          console.log('[CHROME] ✅ Playwright/Patchright 캐시 Chromium 발견:', chromePath);
          return chromePath;
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

/**
 * 플랫폼별 Chromium 실행 파일 찾기
 */
function findChromiumInPlatformDir(platformDir: string): string | undefined {
  if (!fs.existsSync(platformDir)) return undefined;

  const platform = process.platform;
  
  if (platform === 'win32') {
    const chromePath = path.join(platformDir, 'chrome-win', 'chrome.exe');
    if (fs.existsSync(chromePath)) return chromePath;
    
    const chromePath2 = path.join(platformDir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(chromePath2)) return chromePath2;
  } else if (platform === 'darwin') {
    const chromePath = path.join(platformDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
    if (fs.existsSync(chromePath)) return chromePath;
    
    const chromePath2 = path.join(platformDir, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
    if (fs.existsSync(chromePath2)) return chromePath2;
  } else if (platform === 'linux') {
    const chromePath = path.join(platformDir, 'chrome-linux', 'chrome');
    if (fs.existsSync(chromePath)) return chromePath;
  }

  return undefined;
}

/**
 * 시스템에 설치된 Chrome 실행 파일 경로를 찾습니다.
 *
 * v2.44.0: LEWORD_PREFER_EDGE=1 환경변수로 Edge 우선 가능
 *   한국 환경에서 Edge는 Windows 내장이라 백신 화이트리스트에 보통 등록됨.
 *   백신이 chrome.exe spawn을 차단하는 케이스에서 우회 효과.
 */
export function findSystemChrome(): string | undefined {
  const platform = process.platform;
  const preferEdge = process.env['LEWORD_PREFER_EDGE'] === '1';

  if (platform === 'win32') {
    const chromePaths = [
      process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const edgePaths = [
      process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env['PROGRAMFILES'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    const windowsPaths = preferEdge ? [...edgePaths, ...chromePaths] : [...chromePaths, ...edgePaths];

    for (const chromePath of windowsPaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        console.log('[CHROME] ✅ 시스템 브라우저 발견' + (preferEdge ? ' (Edge 우선 모드)' : '') + ':', chromePath);
        return chromePath;
      }
    }
  } else if (platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
    
    for (const chromePath of macPaths) {
      if (fs.existsSync(chromePath)) {
        console.log('[CHROME] ✅ 시스템 브라우저 발견:', chromePath);
        return chromePath;
      }
    }
  } else if (platform === 'linux') {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
    ];
    
    for (const chromePath of linuxPaths) {
      if (fs.existsSync(chromePath)) {
        console.log('[CHROME] ✅ 시스템 브라우저 발견:', chromePath);
        return chromePath;
      }
    }
  }
  
  return undefined;
}

/**
 * Chrome/Chromium 경로를 찾습니다. (캐시됨)
 *
 * v2.44.0 우선순위:
 * 1. 앱 번들 Chromium (resources/chromium) — 백신 우회 효과
 * 2. Puppeteer 캐시 Chromium (~/.cache/puppeteer)
 * 3. 시스템 Chrome / Edge
 * 4. undefined (Puppeteer 기본 동작)
 */
export function findChromePath(): string | undefined {
  // 캐시된 경로가 있으면 반환
  if (chromiumChecked && cachedChromePath) {
    return cachedChromePath;
  }

  // 0. 수동 지정 경로 — 고객 PC별 보안 정책 우회용
  const configured = findConfiguredChromePath();
  if (configured) {
    cachedChromePath = configured;
    chromiumChecked = true;
    return configured;
  }

  // 1. 앱 번들 Chromium (최우선) — packaged 앱에서 가장 신뢰 가능
  const bundled = findBundledChromium();
  if (bundled) {
    cachedChromePath = bundled;
    chromiumChecked = true;
    return bundled;
  }

  // 2. Puppeteer 캐시 Chromium
  const puppeteerChrome = findPuppeteerChromium();
  if (puppeteerChrome) {
    cachedChromePath = puppeteerChrome;
    chromiumChecked = true;
    return puppeteerChrome;
  }

  // 3. Playwright/Patchright 캐시 Chromium
  const playwrightChrome = findPlaywrightChromium();
  if (playwrightChrome) {
    cachedChromePath = playwrightChrome;
    chromiumChecked = true;
    return playwrightChrome;
  }

  // 4. 시스템 Chrome 찾기
  const systemChrome = findSystemChrome();
  if (systemChrome) {
    cachedChromePath = systemChrome;
    chromiumChecked = true;
    return systemChrome;
  }

  console.log('[CHROME] ⚠️ Chrome/Chromium을 찾을 수 없습니다. Puppeteer 기본값 사용');
  chromiumChecked = true;
  return undefined;
}

/**
 * Chrome 사용 가능 여부 확인
 */
export function isChromeAvailable(): boolean {
  return !!findChromePath();
}

/**
 * Puppeteer 실행 옵션을 반환합니다.
 * Chrome이 없어도 작동하도록 최적화
 */
export function getPuppeteerLaunchOptions(options: {
  headless?: boolean | 'new';
  args?: string[];
  timeout?: number;
} = {}): {
  headless: boolean | 'new';
  args: string[];
  executablePath?: string;
  timeout: number;
  ignoreHTTPSErrors: boolean;
  pipe?: boolean;
  dumpio?: boolean;
} {
  const chromePath = findChromePath();

  // v2.47.0 P0: browserPool 통일 시 stealth-필수 사이트(네이버 SERP) 봇 감지 우회 args 복원
  //   v2.44.0에서 백신 의심으로 제거했으나, 30팀 분석 결과 stealth 필수 9개 파일 마이그레이션 시
  //   회귀 위험 HIGH 판정. 다음 args 복원:
  //   - --disable-blink-features=AutomationControlled: navigator.webdriver 숨김 (네이버 봇 감지 핵심)
  //   - --disable-web-security: CORS 우회 (네이버 iframe 접근 필요)
  //   - --disable-features=IsolateOrigins,site-per-process: iframe 크로스도메인 (블로그 mainFrame)
  // v2.42.57 유지: 작업표시줄 깜빡임 방지
  const defaultArgs = [
    '--no-sandbox',                    // Electron 환경 필수
    '--disable-setuid-sandbox',        // Linux/macOS sandbox 비활성
    '--disable-dev-shm-usage',         // 메모리 부족 환경 안정
    '--disable-accelerated-2d-canvas', // GPU 의존 줄임
    '--disable-gpu',                   // headless 환경 GPU 비활성
    '--window-size=1920,1080',
    '--disable-infobars',
    '--lang=ko-KR',
    '--no-startup-window',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
    // v2.47.0 P0 복원
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
  ];

  // v2.44.0: 저사양 모드면 V8 메모리 + 백그라운드 작업 추가 절감
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EnvironmentManager } = require('./environment-manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { effectiveLowSpec } = require('./system-profile');
    const env = EnvironmentManager.getInstance().getConfig();
    if (effectiveLowSpec(env.lowSpecMode)) {
      defaultArgs.push(
        '--js-flags=--max-old-space-size=384',          // V8 heap 384MB (기본 ~1.4GB)
        '--disable-features=Translate,BackgroundTimerThrottling,CalculateNativeWinOcclusion',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      );
    }
  } catch { /* 무시 */ }

  // v2.42.57: 'new' 헤드리스 → 'true' (구 헤드리스, 작업표시줄 등록 X)
  //   Puppeteer 21에서 deprecated 경고는 무시 가능 (동작 보장됨)
  //   'new' 모드가 Windows 11 + Electron 28 조합에서 깜빡임 유발하는 알려진 이슈
  const resolvedHeadless: boolean | 'new' = options.headless === false ? false : true;

  const launchOptions: {
    headless: boolean | 'new';
    args: string[];
    executablePath?: string;
    timeout: number;
    ignoreHTTPSErrors: boolean;
    pipe?: boolean;
    dumpio?: boolean;
  } = {
    headless: resolvedHeadless,
    args: [...defaultArgs, ...(options.args || [])],
    timeout: options.timeout ?? 60000,
    ignoreHTTPSErrors: true,
    // v2.42.57: pipe IPC (websocket 대신 stdio 파이프) — 자식 프로세스 stdio 격리
    pipe: false, // pipe: true 는 일부 환경에서 hang. 우선 비활성, args 변경만으로 시도
    dumpio: false,
  };

  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }

  return launchOptions;
}

/**
 * 캐시 초기화 (테스트용)
 */
export function clearChromePathCache(): void {
  cachedChromePath = null;
  chromiumChecked = false;
}
