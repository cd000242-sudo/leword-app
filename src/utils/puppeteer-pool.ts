/**
 * Puppeteer 브라우저 인스턴스 풀링 시스템
 * 브라우저 재사용으로 성능 최적화 및 리소스 절약
 */

interface BrowserPoolConfig {
  maxSize?: number;
  idleTimeout?: number; // 밀리초
  headless?: boolean;
}

class BrowserInstance {
  browser: any;
  pages: any[] = [];
  lastUsed: number;
  inUse: boolean = false;

  constructor(browser: any) {
    this.browser = browser;
    this.lastUsed = Date.now();
  }

  async close(): Promise<void> {
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

  constructor(config: BrowserPoolConfig = {}) {
    this.maxSize = config.maxSize || 3;
    // v2.43.52: 9팀 — 5분→60초로 단축. idle 브라우저는 ~150MB RAM 점유
    this.idleTimeout = config.idleTimeout || 60000;
    this.headless = config.headless !== false;
    this.startCleanup();
  }

  /**
   * 브라우저 인스턴스 가져오기
   */
  async acquire(): Promise<any> {
    // 유휴 브라우저 찾기
    let instance = this.pool.find(b => !b.inUse && b.browser && b.browser.isConnected());
    
    if (!instance) {
      // 새 브라우저 생성
      if (this.pool.length < this.maxSize) {
        instance = await this.createBrowser();
        this.pool.push(instance);
      } else {
        // 풀이 가득 찬 경우, 가장 오래된 유휴 브라우저 재사용
        instance = this.pool
          .filter(b => b.browser && b.browser.isConnected())
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];
        
        if (!instance) {
          // 모든 브라우저가 사용 중이면 대기
          await new Promise(resolve => setTimeout(resolve, 100));
          return this.acquire();
        }
      }
    }

    instance.inUse = true;
    instance.lastUsed = Date.now();
    return instance.browser;
  }

  /**
   * 브라우저 인스턴스 반환
   */
  release(browser: any): void {
    const instance = this.pool.find(b => b.browser === browser);
    if (instance) {
      instance.inUse = false;
      instance.lastUsed = Date.now();
    }
  }

  /**
   * 새 브라우저 생성
   */
  private async createBrowser(): Promise<BrowserInstance> {
    if (!this.puppeteer) {
      this.puppeteer = await import('puppeteer');
    }

    // 배포 환경에서 시스템 Chrome 사용
    const { getPuppeteerLaunchOptions } = await import('./chrome-finder');
    const launchOptions = getPuppeteerLaunchOptions({
      headless: this.headless ? 'new' : false
    });
    
    const browser = await this.puppeteer.default.launch(launchOptions);

    return new BrowserInstance(browser);
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
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

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

// 전역 브라우저 풀 인스턴스
export const browserPool = new PuppeteerPool({
  maxSize: 3,
  idleTimeout: 60000, // v2.43.52: 5분 → 60초 (idle 브라우저 RAM 점유 축소)
  headless: true
});






