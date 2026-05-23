/**
 * Puppeteer 브라우저 인스턴스 풀링 시스템
 * 브라우저 재사용으로 성능 최적화 및 리소스 절약
 */

interface BrowserPoolConfig {
  maxSize?: number;
  idleTimeout?: number; // 밀리초
  headless?: boolean;
}

export type PuppeteerErrorCode =
  | 'TIMEOUT'
  | 'SPAWN_FAILED'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

export class PuppeteerLaunchError extends Error {
  code: PuppeteerErrorCode;
  isAntivirusSuspected: boolean;
  userMessage: string;
  originalError: Error;
  executablePath?: string;

  constructor(opts: {
    code: PuppeteerErrorCode;
    isAntivirusSuspected: boolean;
    userMessage: string;
    originalError: Error;
    executablePath?: string;
  }) {
    super(opts.userMessage);
    this.name = 'PuppeteerLaunchError';
    this.code = opts.code;
    this.isAntivirusSuspected = opts.isAntivirusSuspected;
    this.userMessage = opts.userMessage;
    this.originalError = opts.originalError;
    this.executablePath = opts.executablePath;
  }
}

function classifyLaunchError(err: any, executablePath?: string): PuppeteerLaunchError {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();

  let code: PuppeteerErrorCode = 'UNKNOWN';
  let isAntivirusSuspected = false;
  let userMessage = '브라우저를 시작하지 못했습니다.';

  // v2.45.0 H1: 연산자 우선순위 fix + TIMEOUT 오탐 방지 + 누락 패턴 추가
  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('access is denied') || lower.includes('access denied')) {
    code = 'PERMISSION_DENIED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 실행이 차단되었습니다. 백신/보안 프로그램이 막고 있을 가능성이 높습니다.';
  } else if (lower.includes('enoent') || (lower.includes('spawn') && lower.includes('not found'))) {
    // 괄호 추가: `spawn && not found`를 한 그룹으로 (이전 우선순위 버그)
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 실행 파일이 사라졌거나 격리됐습니다. 백신이 chrome.exe를 격리했을 수 있습니다.';
  } else if (lower.includes('eaddrinuse')) {
    // 포트 충돌 — 백신 아님, 좀비 프로세스
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = false;
    userMessage = '브라우저 디버그 포트 충돌. 이전 chrome.exe가 남아있을 수 있습니다. 재시작 후 다시 시도하세요.';
  } else if (lower.includes('protocolerror') || lower.includes('protocol error')) {
    // CDP 통신 실패 — 일반적 일시 오류
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = false;
    userMessage = '브라우저와의 통신 오류. 재시도하면 해결될 수 있습니다.';
  } else if (lower.includes('timeout') || lower.includes('timed out')) {
    // TIMEOUT은 백신뿐 아니라 네트워크/저사양 PC에서도 발생 — 오탐 방지
    code = 'TIMEOUT';
    isAntivirusSuspected = false;
    userMessage = '브라우저 시작이 시간 초과되었습니다. 시스템 과부하 또는 백신 검사로 지연됐을 수 있습니다.';
  } else if (lower.includes('executable doesn\'t exist') || (lower.includes('failed to launch') && !executablePath)) {
    code = 'NOT_FOUND';
    isAntivirusSuspected = false;
    userMessage = 'Chromium/Chrome을 찾을 수 없습니다. Chrome 설치 또는 앱 재설치가 필요합니다.';
  } else if (lower.includes('failed to launch')) {
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 시작 실패. 백신/보안 프로그램 차단 가능성이 있습니다.';
  }

  return new PuppeteerLaunchError({
    code,
    isAntivirusSuspected,
    userMessage,
    originalError: err instanceof Error ? err : new Error(msg),
    executablePath,
  });
}

class BrowserInstance {
  browser: any;
  pages: Set<any> = new Set(); // v2.47.0 P1: page 추적 (release 시 cleanup)
  lastUsed: number;
  inUse: boolean = false;

  constructor(browser: any) {
    this.browser = browser;
    this.lastUsed = Date.now();
  }

  /**
   * v2.47.0 P1: page 생성 + 자동 추적 헬퍼
   * 호출자가 browser.newPage() 대신 instance.newTrackedPage() 호출하면 자동 cleanup
   */
  async newTrackedPage(): Promise<any> {
    const page = await this.browser.newPage();
    this.pages.add(page);
    page.once('close', () => this.pages.delete(page));
    return page;
  }

  /**
   * v2.47.0 P1: 모든 page 강제 close (release 시 호출 — 누수 방지)
   */
  async closeAllPages(): Promise<void> {
    const pages = Array.from(this.pages);
    this.pages.clear();
    await Promise.allSettled(pages.map(p => {
      try { return p.close(); } catch { return Promise.resolve(); }
    }));
  }

  async close(): Promise<void> {
    // v2.47.0 P1: browser.close 전에 page 먼저 정리 (메모리 누수 방지)
    await this.closeAllPages();
    if (this.browser) {
      await this.browser.close();
    }
  }

  isIdle(timeout: number): boolean {
    return !this.inUse && (Date.now() - this.lastUsed) > timeout;
  }
}

export class PuppeteerPool {
  private pool: BrowserInstance[] = [];
  private maxSize: number;
  private idleTimeout: number;
  private headless: boolean;
  private puppeteer: any = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  // v2.44.1: 풀 가득 시 대기 큐 (재귀 대신 release 이벤트로 깨움)
  private waiters: Array<{ resolve: (b: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }> = [];
  private acquireTimeoutMs: number = 60000;

  constructor(config: BrowserPoolConfig = {}) {
    this.maxSize = config.maxSize || 3;
    // v2.43.52: 9팀 — 5분→60초로 단축. idle 브라우저는 ~150MB RAM 점유
    this.idleTimeout = config.idleTimeout || 60000;
    this.headless = config.headless !== false;
    this.startCleanup();
  }

  /**
   * 브라우저 인스턴스 가져오기
   * v2.44.1: 풀 가득 시 재귀 대신 waiters 큐에 등록 → release()가 깨움
   *   타임아웃 60s 후에도 못 받으면 reject
   */
  async acquire(): Promise<any> {
    // 1) 유휴 브라우저 즉시 반환
    const instance = this.pool.find(b => !b.inUse && b.browser && b.browser.isConnected());
    if (instance) {
      instance.inUse = true;
      instance.lastUsed = Date.now();
      return instance.browser;
    }

    // 2) 풀에 자리 있으면 새로 생성
    if (this.pool.length < this.maxSize) {
      const created = await this.createBrowser();
      this.pool.push(created);
      created.inUse = true;
      created.lastUsed = Date.now();
      return created.browser;
    }

    // 3) 풀 가득 → 대기 큐에 등록 (재귀 X, 무한 대기 X)
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('[PUPPETEER-POOL] acquire timeout (' + this.acquireTimeoutMs + 'ms) — 풀 가득 + release 없음'));
      }, this.acquireTimeoutMs);
      // unref: 타이머 때문에 이벤트 루프가 떨어지지 않도록
      (timer as any).unref?.();
      this.waiters.push({ resolve, reject, timer });
    });
  }

  /**
   * 브라우저 인스턴스 반환
   * v2.44.1: 대기 중인 waiter 있으면 즉시 넘김
   * v2.47.0 P1: release 시 미정리 page 강제 close (메모리 누수 방지)
   */
  release(browser: any): void {
    const instance = this.pool.find(b => b.browser === browser);
    if (instance) {
      // v2.47.0 P1: 미정리 page 비동기 cleanup (호출자가 page.close 누락한 경우)
      if (instance.pages.size > 0) {
        instance.closeAllPages().catch(() => {});
      }
      instance.inUse = false;
      instance.lastUsed = Date.now();
    }
    // 대기 중 waiter 깨우기
    const waiter = this.waiters.shift();
    if (waiter && instance) {
      clearTimeout(waiter.timer);
      instance.inUse = true;
      instance.lastUsed = Date.now();
      waiter.resolve(instance.browser);
    }
  }

  /**
   * v2.47.0 P1: stealth 적용된 page를 함께 반환
   *   네이버 SERP/블로그 등 봇 감지 우회 필수 사이트용
   *   반환 후 { browser, page } 사용. release(browser) 시 page는 자동 정리됨.
   */
  async acquireWithStealth(): Promise<{ browser: any; page: any }> {
    const browser = await this.acquire();
    const instance = this.pool.find(b => b.browser === browser)!;
    const page = await instance.newTrackedPage();
    try {
      const { setupStealthPage } = await import('./stealth-browser');
      await setupStealthPage(page);
    } catch (e: any) {
      console.warn('[PUPPETEER-POOL] setupStealthPage 실패 (무시):', e?.message);
    }
    return { browser, page };
  }

  /**
   * 새 브라우저 생성 (실패 시 PuppeteerLaunchError throw)
   * 1회 재시도 — 백신이 첫 spawn은 차단하고 두 번째는 통과하는 경우 있음
   */
  private async createBrowser(): Promise<BrowserInstance> {
    if (!this.puppeteer) {
      try {
        this.puppeteer = await import('puppeteer');
      } catch (err: any) {
        throw new PuppeteerLaunchError({
          code: 'NOT_FOUND',
          isAntivirusSuspected: false,
          userMessage: 'Puppeteer 모듈을 로드하지 못했습니다. 앱 재설치가 필요합니다.',
          originalError: err,
        });
      }
    }

    const { getPuppeteerLaunchOptions } = await import('./chrome-finder');
    const launchOptions = getPuppeteerLaunchOptions({
      headless: this.headless ? 'new' : false
    });

    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const browser = await this.puppeteer.default.launch(launchOptions);
        if (attempt > 1) {
          console.log('[PUPPETEER-POOL] ✅ 재시도 성공 (attempt ' + attempt + ')');
        }
        return new BrowserInstance(browser);
      } catch (err: any) {
        lastErr = err;
        console.warn('[PUPPETEER-POOL] ⚠️ launch 실패 (attempt ' + attempt + '):', err?.message || err);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    const classified = classifyLaunchError(lastErr, launchOptions.executablePath);
    console.error('[PUPPETEER-POOL] ❌ launch 최종 실패:', {
      code: classified.code,
      isAntivirusSuspected: classified.isAntivirusSuspected,
      executablePath: classified.executablePath,
      originalMessage: classified.originalError.message,
    });
    throw classified;
  }

  /**
   * 유휴 브라우저 정리
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: BrowserInstance[] = [];

    for (const instance of this.pool) {
      if (!instance.inUse && instance.isIdle(this.idleTimeout)) {
        toRemove.push(instance);
      } else if (!instance.browser || !instance.browser.isConnected()) {
        toRemove.push(instance);
      }
    }

    for (const instance of toRemove) {
      try {
        await instance.close();
      } catch (error) {
        console.warn('[PUPPETEER-POOL] 브라우저 종료 실패:', error);
      }
      const index = this.pool.indexOf(instance);
      if (index > -1) {
        this.pool.splice(index, 1);
      }
    }
  }

  /**
   * 주기적 정리 시작
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // v2.43.0: 1분마다 정리 + unref (idle 시 이벤트 루프 안 깨움)
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        console.warn('[PUPPETEER-POOL] 정리 중 오류:', err);
      });
    }, 60000);
    this.cleanupInterval?.unref?.();
  }

  /**
   * v2.43.53: 발굴 종료 즉시 호출 — idle 브라우저 즉시 제거 (펜 진정)
   * cleanupInterval 은 유지하여 다음 발굴 정상 동작
   */
  async closeIdle(): Promise<void> {
    const toClose = this.pool.filter(b => !b.inUse);
    if (toClose.length === 0) return;
    await Promise.all(toClose.map(b => b.close()));
    this.pool = this.pool.filter(b => b.inUse);
  }

  /**
   * 모든 브라우저 종료
   * v2.44.1: 대기 중인 waiter도 reject 처리
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 대기 큐 정리
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error('[PUPPETEER-POOL] destroy 호출됨 — 대기 취소'));
    }
    this.waiters = [];

    await Promise.all(
      this.pool.map(instance => instance.close())
    );
    this.pool = [];
  }

  /**
   * 풀 상태 조회
   */
  getStats(): {
    size: number;
    maxSize: number;
    inUse: number;
    idle: number;
  } {
    return {
      size: this.pool.length,
      maxSize: this.maxSize,
      inUse: this.pool.filter(b => b.inUse).length,
      idle: this.pool.filter(b => !b.inUse).length
    };
  }
}

// v2.44.0: 저사양 PC면 maxSize=1, idleTimeout=30s (RAM 절약)
//   - RAM<8GB or CPU<=4core 자동 감지
//   - 사용자 환경설정으로 강제 on/off 가능
function buildPoolConfig(): BrowserPoolConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EnvironmentManager } = require('./environment-manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSystemProfile, effectiveLowSpec } = require('./system-profile');
    const env = EnvironmentManager.getInstance().getConfig();
    const isLow = effectiveLowSpec(env.lowSpecMode);
    const profile = getSystemProfile();
    if (isLow) {
      console.log('[PUPPETEER-POOL] 저사양 모드 활성 (mode=' + (env.lowSpecMode || 'auto') + ', RAM=' + profile.totalMemGB + 'GB, CPU=' + profile.cpuCount + '코어)');
      return { maxSize: 1, idleTimeout: 30000, headless: true };
    }
  } catch (e) {
    // Electron 컨텍스트 밖에서 require 실패할 수 있음 → 기본값
  }
  return { maxSize: 3, idleTimeout: 60000, headless: true };
}

export const browserPool = new PuppeteerPool(buildPoolConfig());






