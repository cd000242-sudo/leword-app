/**
 * Per-domain Rate Limiter — 토큰 버킷 + 큐 + UA 로테이션
 *
 * 목적: 17개 외부 소스를 동시에 호출해도 도메인별 차단을 피하도록 보호.
 */

interface Bucket {
    tokens: number;
    maxTokens: number;
    refillPerSec: number;
    lastRefill: number;
    queue: Array<() => void>;
}

const DEFAULT_RATE: Record<string, { max: number; per: number }> = {
    // domain → max tokens per `per` ms
    'datalab.naver.com': { max: 5, per: 1000 },
    'openapi.naver.com': { max: 10, per: 1000 },
    'wikimedia.org': { max: 100, per: 1000 },
    'www.youtube.com': { max: 30, per: 1000 },
    'www.ppomppu.co.kr': { max: 5, per: 1000 },
    'www.google.com': { max: 1, per: 4000 },
    'ads.tiktok.com': { max: 5, per: 1000 },
    'graph.threads.net': { max: 10, per: 1000 },
    'api.openalex.org': { max: 10, per: 1000 },
    'app.rakuten.co.jp': { max: 5, per: 1000 },
    'www.bigkinds.or.kr': { max: 5, per: 1000 },
    'theqoo.net': { max: 3, per: 1000 },
    'www.bobaedream.co.kr': { max: 3, per: 1000 },
    'www.oliveyoung.co.kr': { max: 3, per: 1000 },
    'www.musinsa.com': { max: 3, per: 1000 },
    'www.facebook.com': { max: 2, per: 2000 },
    'kream.co.kr': { max: 3, per: 1000 },
    'namu.wiki': { max: 5, per: 1000 },
    'default': { max: 10, per: 1000 },
};

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

let uaIndex = 0;
export function getRotatingUA(): string {
    const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
    uaIndex++;
    return ua;
}

const buckets = new Map<string, Bucket>();

function getDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return 'default';
    }
}

function getBucket(domain: string): Bucket {
    let b = buckets.get(domain);
    if (b) return b;
    const cfg = DEFAULT_RATE[domain] || DEFAULT_RATE['default'];
    b = {
        tokens: cfg.max,
        maxTokens: cfg.max,
        refillPerSec: cfg.max * (1000 / cfg.per),
        lastRefill: Date.now(),
        queue: [],
    };
    buckets.set(domain, b);
    return b;
}

function refill(b: Bucket): void {
    const now = Date.now();
    const elapsed = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(b.maxTokens, b.tokens + elapsed * b.refillPerSec);
    b.lastRefill = now;
}

/**
 * 도메인별 토큰 1개를 소비할 때까지 대기
 */
export async function acquireToken(url: string): Promise<void> {
    const domain = getDomain(url);
    const b = getBucket(domain);

    return new Promise(resolve => {
        const tryAcquire = () => {
            refill(b);
            if (b.tokens >= 1) {
                b.tokens -= 1;
                resolve();
            } else {
                const waitMs = Math.ceil((1 - b.tokens) / b.refillPerSec * 1000) + 50;
                setTimeout(tryAcquire, waitMs);
            }
        };
        tryAcquire();
    });
}

/**
 * 호출 카운터 (헬스 체크용)
 */
const callCounter = new Map<string, { success: number; fail: number; lastCall: number }>();

export function recordCall(domain: string, success: boolean): void {
    let c = callCounter.get(domain);
    if (!c) {
        c = { success: 0, fail: 0, lastCall: 0 };
        callCounter.set(domain, c);
    }
    if (success) c.success++;
    else c.fail++;
    c.lastCall = Date.now();
}

export function getCallStats(): Record<string, { success: number; fail: number; successRate: number; lastCall: number }> {
    const out: Record<string, any> = {};
    for (const [domain, c] of callCounter.entries()) {
        const total = c.success + c.fail;
        out[domain] = {
            success: c.success,
            fail: c.fail,
            successRate: total > 0 ? parseFloat(((c.success / total) * 100).toFixed(1)) : 0,
            lastCall: c.lastCall,
        };
    }
    return out;
}

export function resetCallStats(): void {
    callCounter.clear();
}
