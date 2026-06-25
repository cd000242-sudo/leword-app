interface BrowserPoolConfig {
  maxSize?: number;
  idleTimeout?: number;
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

type BrowserEngine = 'patchright' | 'playwright';

const compatibleBrowserLaunches = new Set<any>();
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

function classifyLaunchError(err: any, executablePath?: string): PuppeteerLaunchError {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();

  let code: PuppeteerErrorCode = 'UNKNOWN';
  let isAntivirusSuspected = false;
  let userMessage = '브라우저를 시작하지 못했습니다.';

  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('access is denied') || lower.includes('access denied')) {
    code = 'PERMISSION_DENIED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 실행이 차단되었습니다. 백신/보안 프로그램이 chrome.exe를 막고 있을 수 있습니다.';
  } else if (lower.includes('enoent') || (lower.includes('spawn') && lower.includes('not found'))) {
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 실행 파일을 찾지 못했거나 격리되었습니다.';
  } else if (lower.includes('eaddrinuse')) {
    code = 'SPAWN_FAILED';
    userMessage = '브라우저 디버그 포트 충돌이 발생했습니다. 이전 chrome.exe가 남아있을 수 있습니다.';
  } else if (lower.includes('protocolerror') || lower.includes('protocol error')) {
    code = 'SPAWN_FAILED';
    userMessage = '브라우저와의 통신 오류가 발생했습니다.';
  } else if (lower.includes('timeout') || lower.includes('timed out')) {
    code = 'TIMEOUT';
    userMessage = '브라우저 시작 시간이 초과되었습니다.';
  } else if (lower.includes('executable doesn\'t exist') || (lower.includes('failed to launch') && !executablePath)) {
    code = 'NOT_FOUND';
    userMessage = 'Chromium/Chrome을 찾을 수 없습니다.';
  } else if (lower.includes('failed to launch')) {
    code = 'SPAWN_FAILED';
    isAntivirusSuspected = true;
    userMessage = '브라우저 시작에 실패했습니다. 백신/보안 프로그램 차단 가능성이 있습니다.';
  }

  return new PuppeteerLaunchError({
    code,
    isAntivirusSuspected,
    userMessage,
    originalError: err instanceof Error ? err : new Error(msg),
    executablePath,
  });
}

async function loadBrowserEngine(): Promise<{ engine: BrowserEngine; chromium: any }> {
  try {
    const mod = await import('patchright');
    return { engine: 'patchright', chromium: (mod as any).chromium };
  } catch (patchrightErr: any) {
    try {
      const mod = await import('playwright');
      return { engine: 'playwright', chromium: (mod as any).chromium };
    } catch (playwrightErr: any) {
      throw patchrightErr || playwrightErr;
    }
  }
}

function normalizeLaunchOptions(opts: any): any {
  const out: any = {
    headless: opts?.headless === false ? false : true,
    args: Array.isArray(opts?.args) ? opts.args : [],
    timeout: opts?.timeout ?? 60000,
  };
  if (opts?.executablePath) out.executablePath = opts.executablePath;
  return out;
}

function adaptWaitForSelectorOptions(opts: any): any {
  if (!opts || typeof opts !== 'object') return opts;
  const next = { ...opts };
  if ('visible' in next) {
    next.state = next.visible ? 'visible' : 'attached';
    delete next.visible;
  }
  if ('hidden' in next) {
    next.state = next.hidden ? 'hidden' : 'attached';
    delete next.hidden;
  }
  return next;
}

function adaptNavigationOptions(opts: any): any {
  if (!opts || typeof opts !== 'object') return opts;
  const next = { ...opts };
  if (next.waitUntil === 'networkidle0' || next.waitUntil === 'networkidle2') {
    next.waitUntil = 'networkidle';
  }
  return next;
}

function makeRequestShim(route: any): any {
  const request = route.request();
  return {
    url: () => request.url(),
    method: () => request.method(),
    headers: () => request.headers(),
    resourceType: () => request.resourceType(),
    postData: () => request.postData(),
    abort: () => route.abort().catch(() => {}),
    continue: (overrides?: any) => route.continue(overrides || {}).catch(() => {}),
  };
}

async function applyNavigatorStealth(page: any, userAgent: string): Promise<void> {
  try {
    await page.addInitScript((ua: string) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'userAgent', { get: () => ua });
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    }, userAgent);
  } catch {}
}

function adaptPage(rawPage: any, context: any): any {
  let userAgent = DEFAULT_UA;
  let requestHandler: ((req: any) => any) | null = null;
  let interceptionEnabled = false;

  const proxy: any = new Proxy(rawPage, {
    get(target, prop, receiver) {
      if (prop === '__raw') return target;
      if (prop === 'setUserAgent') {
        return async (ua: string) => {
          userAgent = ua || userAgent;
          await target
            .setExtraHTTPHeaders({
              'User-Agent': userAgent,
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            })
            .catch(() => {});
          await applyNavigatorStealth(target, userAgent);
        };
      }
      if (prop === 'setViewport') {
        return async (viewport: { width: number; height: number }) => target.setViewportSize(viewport);
      }
      if (prop === 'setRequestInterception') {
        return async (enabled: boolean) => {
          interceptionEnabled = enabled;
          if (!enabled) {
            await target.unroute('**/*').catch(() => {});
            return;
          }
          await target
            .route('**/*', async (route: any) => {
              if (!interceptionEnabled || !requestHandler) return route.continue().catch(() => {});
              try {
                await requestHandler(makeRequestShim(route));
              } catch {
                await route.continue().catch(() => {});
              }
            })
            .catch(() => {});
        };
      }
      if (prop === 'on') {
        return (eventName: string, handler: (...args: any[]) => any) => {
          if (eventName === 'request') {
            requestHandler = handler;
            return proxy;
          }
          target.on(eventName, handler);
          return proxy;
        };
      }
      if (prop === 'once') {
        return (eventName: string, handler: (...args: any[]) => any) => {
          target.once(eventName, handler);
          return proxy;
        };
      }
      if (prop === 'waitForSelector') {
        return (selector: string, opts?: any) => target.waitForSelector(selector, adaptWaitForSelectorOptions(opts));
      }
      if (prop === 'goto') {
        return (url: string, opts?: any) => target.goto(url, adaptNavigationOptions(opts));
      }
      if (prop === 'waitForNavigation') {
        return (opts?: any) => target.waitForNavigation(adaptNavigationOptions(opts));
      }
      if (prop === 'evaluateOnNewDocument') {
        return (fn: any, ...args: any[]) => target.addInitScript(fn, ...args);
      }
      if (prop === 'waitForTimeout') {
        return (ms: number) =>
          target.waitForTimeout ? target.waitForTimeout(ms) : new Promise(resolve => setTimeout(resolve, ms));
      }
      if (prop === 'close') {
        return async (...args: any[]) => {
          await target.close(...args).catch(() => {});
          await context.close().catch(() => {});
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  void applyNavigatorStealth(rawPage, userAgent);
  return proxy;
}

function adaptBrowser(rawBrowser: any, engine: BrowserEngine, defaultContextOptions: any): any {
  const ownedContexts = new Set<any>();
  return {
    __raw: rawBrowser,
    __engine: engine,
    __closeAllPages: async () => {
      const contexts = Array.from(ownedContexts);
      ownedContexts.clear();
      await Promise.allSettled(contexts.map((ctx: any) => ctx.close().catch(() => {})));
    },
    isConnected: () => rawBrowser.isConnected(),
    close: () => rawBrowser.close(),
    newPage: async (opts: any = {}) => {
      const context = await rawBrowser.newContext({
        ...defaultContextOptions,
        ...opts,
        viewport: opts.viewport || defaultContextOptions.viewport || DEFAULT_VIEWPORT,
        userAgent: opts.userAgent || defaultContextOptions.userAgent || DEFAULT_UA,
      });
      ownedContexts.add(context);
      const page = await context.newPage();
      const adapted = adaptPage(page, context);
      adapted.once('close', () => ownedContexts.delete(context));
      return adapted;
    },
    pages: async () => {
      const contexts = rawBrowser.contexts ? rawBrowser.contexts() : [];
      return contexts.flatMap((ctx: any) => ctx.pages().map((p: any) => adaptPage(p, ctx)));
    },
  };
}

class BrowserInstance {
  browser: any;
  pages: Set<any> = new Set();
  lastUsed: number;
  inUse: boolean = false;

  constructor(browser: any) {
    this.browser = browser;
    this.lastUsed = Date.now();
  }

  async newTrackedPage(): Promise<any> {
    const page = await this.browser.newPage();
    this.pages.add(page);
    page.once('close', () => this.pages.delete(page));
    return page;
  }

  async closeAllPages(): Promise<void> {
    const pages = Array.from(this.pages);
    this.pages.clear();
    await Promise.allSettled(
      pages.map(p => {
        try {
          return p.close();
        } catch {
          return Promise.resolve();
        }
      }),
    );
    if (this.browser && typeof this.browser.__closeAllPages === 'function') {
      await this.browser.__closeAllPages();
    }
  }

  async close(): Promise<void> {
    await this.closeAllPages();
    if (!this.browser) return;
    await Promise.race([
      this.browser.close(),
      new Promise(resolve => {
        const timer = setTimeout(resolve, 2500);
        (timer as any).unref?.();
      }),
    ]);
  }

  isIdle(timeout: number): boolean {
    return !this.inUse && Date.now() - this.lastUsed > timeout;
  }
}

export class PuppeteerPool {
  private pool: BrowserInstance[] = [];
  private maxSize: number;
  private idleTimeout: number;
  private headless: boolean;
  private engine: { engine: BrowserEngine; chromium: any } | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private waiters: Array<{ resolve: (b: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }> = [];
  private acquireTimeoutMs: number = 60000;

  constructor(config: BrowserPoolConfig = {}) {
    this.maxSize = config.maxSize || 3;
    this.idleTimeout = config.idleTimeout || 60000;
    this.headless = config.headless !== false;
    this.startCleanup();
  }

  async acquire(): Promise<any> {
    const instance = this.pool.find(b => !b.inUse && b.browser && b.browser.isConnected());
    if (instance) {
      instance.inUse = true;
      instance.lastUsed = Date.now();
      return instance.browser;
    }

    if (this.pool.length < this.maxSize) {
      const created = await this.createBrowser();
      this.pool.push(created);
      created.inUse = true;
      created.lastUsed = Date.now();
      return created.browser;
    }

    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('[BROWSER-POOL] acquire timeout (' + this.acquireTimeoutMs + 'ms)'));
      }, this.acquireTimeoutMs);
      (timer as any).unref?.();
      this.waiters.push({ resolve, reject, timer });
    });
  }

  release(browser: any): void {
    const instance = this.pool.find(b => b.browser === browser);
    if (instance) {
      if (instance.pages.size > 0) instance.closeAllPages().catch(() => {});
      instance.inUse = false;
      instance.lastUsed = Date.now();
    }

    const waiter = this.waiters.shift();
    if (waiter && instance) {
      clearTimeout(waiter.timer);
      instance.inUse = true;
      instance.lastUsed = Date.now();
      waiter.resolve(instance.browser);
    }
  }

  async acquireWithStealth(): Promise<{ browser: any; page: any }> {
    const browser = await this.acquire();
    const instance = this.pool.find(b => b.browser === browser)!;
    const page = await instance.newTrackedPage();
    try {
      const { setupStealthPage } = await import('./stealth-browser');
      await setupStealthPage(page);
    } catch (e: any) {
      console.warn('[BROWSER-POOL] setupStealthPage failed:', e?.message);
    }
    return { browser, page };
  }

  private async createBrowser(): Promise<BrowserInstance> {
    if (!this.engine) {
      try {
        this.engine = await loadBrowserEngine();
        console.log(`[BROWSER-POOL] using ${this.engine.engine}`);
      } catch (err: any) {
        throw new PuppeteerLaunchError({
          code: 'NOT_FOUND',
          isAntivirusSuspected: false,
          userMessage: 'Patchright/Playwright 모듈을 로드하지 못했습니다. npm install이 필요합니다.',
          originalError: err,
        });
      }
    }

    const { getPuppeteerLaunchOptions } = await import('./chrome-finder');
    const puppeteerOptions = getPuppeteerLaunchOptions({ headless: this.headless ? true : false });
    const launchOptions = normalizeLaunchOptions(puppeteerOptions);
    const contextOptions = {
      ignoreHTTPSErrors: true,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      viewport: DEFAULT_VIEWPORT,
      userAgent: DEFAULT_UA,
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
    };

    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const rawBrowser = await this.engine.chromium.launch(launchOptions);
        if (attempt > 1) console.log('[BROWSER-POOL] launch succeeded on retry ' + attempt);
        return new BrowserInstance(adaptBrowser(rawBrowser, this.engine.engine, contextOptions));
      } catch (err: any) {
        lastErr = err;
        console.warn('[BROWSER-POOL] launch failed (attempt ' + attempt + '):', err?.message || err);
        if (attempt < 2) await new Promise(r => setTimeout(r, 800));
      }
    }

    const classified = classifyLaunchError(lastErr, launchOptions.executablePath);
    console.error('[BROWSER-POOL] launch failed finally:', {
      code: classified.code,
      isAntivirusSuspected: classified.isAntivirusSuspected,
      executablePath: classified.executablePath,
      originalMessage: classified.originalError.message,
    });
    throw classified;
  }

  private async cleanup(): Promise<void> {
    const toRemove: BrowserInstance[] = [];
    for (const instance of this.pool) {
      if (!instance.inUse && instance.isIdle(this.idleTimeout)) toRemove.push(instance);
      else if (!instance.browser || !instance.browser.isConnected()) toRemove.push(instance);
    }

    for (const instance of toRemove) {
      try {
        await instance.close();
      } catch (error) {
        console.warn('[BROWSER-POOL] close failed:', error);
      }
      const index = this.pool.indexOf(instance);
      if (index > -1) this.pool.splice(index, 1);
    }
  }

  private startCleanup(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => console.warn('[BROWSER-POOL] cleanup failed:', err));
    }, 60000);
    this.cleanupInterval?.unref?.();
  }

  async closeIdle(): Promise<void> {
    const toClose = this.pool.filter(b => !b.inUse);
    if (toClose.length === 0) return;
    await Promise.allSettled(toClose.map(b => b.close()));
    this.pool = this.pool.filter(b => b.inUse);
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error('[BROWSER-POOL] destroy called; waiter canceled'));
    }
    this.waiters = [];

    await Promise.allSettled(this.pool.map(instance => instance.close()));
    this.pool = [];
    await destroyCompatibleBrowserLaunches();
  }

  getStats(): { size: number; maxSize: number; inUse: number; idle: number; engine?: BrowserEngine } {
    return {
      size: this.pool.length,
      maxSize: this.maxSize,
      inUse: this.pool.filter(b => b.inUse).length,
      idle: this.pool.filter(b => !b.inUse).length,
      engine: this.engine?.engine,
    };
  }
}

export async function launchCompatibleBrowser(options: any = {}): Promise<any> {
  const engine = await loadBrowserEngine();
  const { getPuppeteerLaunchOptions } = await import('./chrome-finder');
  const launchOptions = normalizeLaunchOptions({
    ...getPuppeteerLaunchOptions({ headless: options.headless === false ? false : true }),
    ...options,
  });
  let rawBrowser: any;
  try {
    rawBrowser = await engine.chromium.launch(launchOptions);
  } catch (err: any) {
    throw classifyLaunchError(err, launchOptions.executablePath);
  }
  const browser = adaptBrowser(rawBrowser, engine.engine, {
    ignoreHTTPSErrors: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: DEFAULT_VIEWPORT,
    userAgent: DEFAULT_UA,
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
  });
  compatibleBrowserLaunches.add(browser);
  const close = browser.close.bind(browser);
  browser.close = async (...args: any[]) => {
    compatibleBrowserLaunches.delete(browser);
    return close(...args);
  };
  return browser;
}

export async function destroyCompatibleBrowserLaunches(): Promise<void> {
  const browsers = Array.from(compatibleBrowserLaunches);
  compatibleBrowserLaunches.clear();
  const closeBrowser = async (browser: any) => {
    try {
      await Promise.resolve(browser?.close?.());
    } catch {}
  };
  await Promise.allSettled(
    browsers.map(browser => Promise.race([
      closeBrowser(browser),
      new Promise(resolve => {
        const timer = setTimeout(resolve, 2500);
        (timer as any).unref?.();
      }),
    ])),
  );
}

function buildPoolConfig(): BrowserPoolConfig {
  const envMaxSize = Number.parseInt(process.env.LEWORD_BROWSER_POOL_MAX_SIZE || '', 10);
  const envIdleTimeout = Number.parseInt(process.env.LEWORD_BROWSER_POOL_IDLE_MS || '', 10);
  if (Number.isFinite(envMaxSize) && envMaxSize > 0) {
    return {
      maxSize: Math.max(1, Math.min(8, envMaxSize)),
      idleTimeout: Number.isFinite(envIdleTimeout) && envIdleTimeout >= 5000
        ? envIdleTimeout
        : 30000,
      headless: true,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EnvironmentManager } = require('./environment-manager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSystemProfile, effectiveLowSpec } = require('./system-profile');
    const env = EnvironmentManager.getInstance().getConfig();
    const isLow = effectiveLowSpec(env.lowSpecMode);
    const profile = getSystemProfile();
    if (isLow) {
      console.log(
        '[BROWSER-POOL] low-spec mode enabled (mode=' +
          (env.lowSpecMode || 'auto') +
          ', RAM=' +
          profile.totalMemGB +
          'GB, CPU=' +
          profile.cpuCount +
          ')',
      );
      return { maxSize: 1, idleTimeout: 30000, headless: true };
    }
  } catch {
    // Non-Electron contexts can fail requiring environment modules.
  }
  return { maxSize: 3, idleTimeout: 60000, headless: true };
}

export const browserPool = new PuppeteerPool(buildPoolConfig());
