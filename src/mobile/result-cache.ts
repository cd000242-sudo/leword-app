import {
  MOBILE_PC_PARITY_SLA,
  type MobileKeywordProduct,
  type MobileKeywordResult,
} from './contracts';
import * as fs from 'fs';
import * as path from 'path';

export interface MobileResultCacheOptions {
  now?: () => number;
  maxEntries?: number;
  persistenceFile?: string | null;
}

interface MobileResultCacheEntry {
  key: string;
  product: MobileKeywordProduct;
  result: MobileKeywordResult;
  createdAtMs: number;
  expiresAtMs: number;
}

const FRESH_PRODUCTS = new Set<MobileKeywordProduct>([
  'golden-discovery',
  'home-board-hunter',
  'kin-hidden-honey',
]);

const DAILY_PREWARM_PRODUCTS = new Set<MobileKeywordProduct>([
  'pro-traffic-hunter',
  'shopping-connect',
  'youtube-golden',
  'naver-mate-hunter',
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function cloneResult(result: MobileKeywordResult, fromCache: boolean): MobileKeywordResult {
  const keywords = cacheableKeywords(result);
  return {
    keywords: keywords.map((item) => ({
      ...item,
      evidence: [...item.evidence],
    })),
    summary: {
      ...result.summary,
      total: keywords.length,
      sss: keywords.filter((item) => item.grade === 'SSS').length,
      measured: keywords.filter((item) => item.isMeasured === true).length,
      fromCache,
    },
  };
}

function isKeywordCacheVisible(item: MobileKeywordResult['keywords'][number]): boolean {
  const aiVerdict = String(item.aiJudge?.verdict || '').toLowerCase();
  const publishVerdict = String(item.publishDecision?.verdict || '').toLowerCase();
  return aiVerdict !== 'exclude' && publishVerdict !== 'exclude';
}

function cacheableKeywords(result: MobileKeywordResult | undefined): MobileKeywordResult['keywords'] {
  return Array.isArray(result?.keywords)
    ? result.keywords.filter(isKeywordCacheVisible)
    : [];
}

function targetCountFromParams(params: unknown): number | null {
  if (!params || typeof params !== 'object') return null;
  const raw = (params as Record<string, unknown>)['targetCount'];
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function minimumCacheKeywordCount(product: MobileKeywordProduct, params: unknown): number {
  const targetCount = targetCountFromParams(params);
  if (product === 'pro-traffic-hunter' && targetCount && targetCount >= 20) {
    return Math.min(90, Math.max(30, Math.ceil(targetCount * 0.75)));
  }
  if (DAILY_PREWARM_PRODUCTS.has(product) && targetCount && targetCount >= 20) {
    return Math.min(10, Math.max(3, Math.floor(targetCount * 0.25)));
  }
  if (targetCount && targetCount >= 20) {
    return Math.min(10, Math.max(3, Math.floor(targetCount * 0.25)));
  }
  return 1;
}

function isCacheableResult(
  product: MobileKeywordProduct,
  result: MobileKeywordResult | undefined,
  params: unknown,
): boolean {
  const keywords = cacheableKeywords(result);
  if (keywords.length === 0) return false;
  if (keywords.length < minimumCacheKeywordCount(product, params)) return false;
  if (product === 'pro-traffic-hunter') {
    return keywords.every((item) => {
      const total = typeof item.totalSearchVolume === 'number' ? item.totalSearchVolume : 0;
      const docs = typeof item.documentCount === 'number' ? item.documentCount : 0;
      return item.isMeasured === true && total > 0 && docs > 0;
    });
  }
  const hasUsefulMetric = keywords.some((item) => {
    const total = typeof item.totalSearchVolume === 'number' ? item.totalSearchVolume : 0;
    const docs = typeof item.documentCount === 'number' ? item.documentCount : 0;
    return item.isMeasured === true || total > 0 || docs > 0;
  });
  const allLiveSourceFallback = keywords.every((item) => String(item.source || '').includes('live-source-fallback'));
  return hasUsefulMetric || !allLiveSourceFallback;
}

export function makeMobileResultCacheKey(product: MobileKeywordProduct, params: unknown): string {
  return `${product}:${stableStringify(params)}`;
}

export function getMobileResultCacheTtlMs(product: MobileKeywordProduct): number {
  const minutes = DAILY_PREWARM_PRODUCTS.has(product)
    ? MOBILE_PC_PARITY_SLA.workerBudgets.proTrafficPrewarmCacheTtlMinutes
    : FRESH_PRODUCTS.has(product)
      ? MOBILE_PC_PARITY_SLA.workerBudgets.cacheTtlMinutesForFreshIssue
      : MOBILE_PC_PARITY_SLA.workerBudgets.cacheTtlMinutesForEvergreen;
  return minutes * 60 * 1000;
}

export class InMemoryMobileResultCache {
  private readonly entries = new Map<string, MobileResultCacheEntry>();
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly persistenceFile: string | null;

  constructor(options: MobileResultCacheOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.maxEntries = options.maxEntries || 500;
    this.persistenceFile = options.persistenceFile || null;
    this.load();
  }

  get(product: MobileKeywordProduct, params: unknown): MobileKeywordResult | undefined {
    const key = makeMobileResultCacheKey(product, params);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    if (!isCacheableResult(product, entry.result, params)) {
      this.entries.delete(key);
      this.persist();
      return undefined;
    }
    return cloneResult(entry.result, true);
  }

  set(product: MobileKeywordProduct, params: unknown, result: MobileKeywordResult): void {
    const key = makeMobileResultCacheKey(product, params);
    if (!isCacheableResult(product, result, params)) {
      this.entries.delete(key);
      this.persist();
      return;
    }
    const createdAtMs = this.now();
    this.entries.set(key, {
      key,
      product,
      result: cloneResult(result, false),
      createdAtMs,
      expiresAtMs: createdAtMs + getMobileResultCacheTtlMs(product),
    });
    this.trim();
    this.persist();
  }

  size(): number {
    return this.entries.size;
  }

  recent(product?: MobileKeywordProduct, limit = 10): MobileKeywordResult[] {
    const now = this.now();
    return [...this.entries.values()]
      .filter((entry) => (!product || entry.product === product) && entry.expiresAtMs > now)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .filter((entry) => isCacheableResult(entry.product, entry.result, {}))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map((entry) => cloneResult(entry.result, true));
  }

  private trim(): void {
    if (this.entries.size <= this.maxEntries) return;
    const overflow = this.entries.size - this.maxEntries;
    const ordered = [...this.entries.values()].sort((a, b) => a.createdAtMs - b.createdAtMs);
    for (const entry of ordered.slice(0, overflow)) {
      this.entries.delete(entry.key);
    }
  }

  private load(): void {
    if (!this.persistenceFile || !fs.existsSync(this.persistenceFile)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8')) as {
        entries?: MobileResultCacheEntry[];
      };
      const now = this.now();
      for (const entry of parsed.entries || []) {
        if (!entry?.key || !entry?.result || entry.expiresAtMs <= now) continue;
        this.entries.set(entry.key, entry);
      }
      this.trim();
    } catch {
      this.entries.clear();
    }
  }

  private persist(): void {
    if (!this.persistenceFile) return;
    try {
      fs.mkdirSync(path.dirname(this.persistenceFile), { recursive: true });
      fs.writeFileSync(this.persistenceFile, JSON.stringify({
        schemaVersion: 1,
        savedAtMs: this.now(),
        entries: [...this.entries.values()],
      }), 'utf8');
    } catch {
      // Cache persistence must never break a keyword job.
    }
  }
}
