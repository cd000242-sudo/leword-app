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
 */
export function findSystemChrome(): string | undefined {
  const platform = process.platform;
  
  if (platform === 'win32') {
    const windowsPaths = [
      process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      // Edge 폴백 (Windows)
      process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env['PROGRAMFILES'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    
    for (const chromePath of windowsPaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        console.log('[CHROME] ✅ 시스템 브라우저 발견:', chromePath);
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
 * 우선순위:
 * 1. Puppeteer 번들 Chromium
 * 2. 시스템 Chrome
 * 3. undefined (Puppeteer가 자동으로 다운로드 시도)
 */
export function findChromePath(): string | undefined {
  // 캐시된 경로가 있으면 반환
  if (chromiumChecked && cachedChromePath) {
    return cachedChromePath;
  }

  // 1. Puppeteer 번들 Chromium 찾기
  const puppeteerChrome = findPuppeteerChromium();
  if (puppeteerChrome) {
    cachedChromePath = puppeteerChrome;
    chromiumChecked = true;
    return puppeteerChrome;
  }

  // 2. 시스템 Chrome 찾기
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
} {
  const chromePath = findChromePath();
  
  const defaultArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--lang=ko-KR',
  ];
  
  const launchOptions: {
    headless: boolean | 'new';
    args: string[];
    executablePath?: string;
    timeout: number;
    ignoreHTTPSErrors: boolean;
  } = {
    headless: options.headless ?? 'new',
    args: [...defaultArgs, ...(options.args || [])],
    timeout: options.timeout ?? 60000,
    ignoreHTTPSErrors: true,
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
