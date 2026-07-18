/**
 * Cross-run cache for measured keyword data.
 *
 * Document counts are safe to reuse only when they came from the unquoted
 * Naver Blog OpenAPI total.  Search volume/CPC freshness is deliberately
 * independent from document-count freshness, so updating those fields cannot
 * extend the life of an old document measurement.
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeNaverBlogBroadQuery } from './naver-blog-api';

export type PersistentDocumentCountSource = 'naver-api' | 'scrape' | 'fallback' | 'legacy';
export type PersistentDocumentCountConfidence = 'high' | 'medium' | 'low';
export type PersistentDocumentCountQueryMode = 'broad' | 'exact-phrase';

export interface PersistentCacheEntry {
  searchVolume: number | null;
  documentCount: number | null;
  documentCountSource?: PersistentDocumentCountSource;
  documentCountConfidence?: PersistentDocumentCountConfidence;
  documentCountQueryMode?: PersistentDocumentCountQueryMode;
  /** Exact normalized broad Blog query that produced this total. */
  documentCountQueryKey?: string;
  isDocumentCountEstimated?: boolean;
  documentCountMeasuredAt?: string;
  /** Epoch milliseconds when the document-count value was persisted. */
  documentCountSavedAt?: number;
  realCpc?: number | null;
  compIdx?: number | null;
  /** Epoch milliseconds for general cache fields such as search volume/CPC. */
  savedAt: number;
}

export type PersistentCacheWrite = Omit<PersistentCacheEntry, 'savedAt' | 'documentCountSavedAt'>;
export type PersistentDocumentCountEvidence = Pick<
  PersistentCacheEntry,
  | 'documentCount'
  | 'documentCountSource'
  | 'documentCountConfidence'
  | 'documentCountQueryMode'
  | 'documentCountQueryKey'
  | 'isDocumentCountEstimated'
  | 'documentCountMeasuredAt'
  | 'documentCountSavedAt'
>;

// Keep document counts aligned with the canonical Naver Blog OpenAPI cache.
// Search volume may remain cached for 30 days, but competition counts must not.
export const PERSISTENT_DOCUMENT_COUNT_TTL_MS = 15 * 60 * 1000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 5000;
const CACHE_FILE_NAME = 'keyword-cache.json';
const MAX_ENTRIES = 50_000;
const DOCUMENT_COUNT_CACHE_KEY_PREFIX = '__document_count_broad__:';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CACHE_SCHEMA_VERSION: SG_VER } = require('./sanity-gate');
// Keep the existing schema so SearchAd volume/CPC data survives this migration.
// Provenance-less document fields remain loaded only as untrusted diagnostics.
const CACHE_SCHEMA_VERSION = `pk-${SG_VER}`;

let cache: Map<string, PersistentCacheEntry> = new Map();
let cachePath: string | null = null;
let loaded = false;
let pendingWrite = false;
let writeTimer: NodeJS.Timeout | null = null;

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Preserve spaces because they are part of the actual Blog broad query. */
export function normalizePersistentDocumentCountQueryKey(keyword: unknown): string {
  return normalizeNaverBlogBroadQuery(keyword).normalize('NFKC').toLowerCase();
}

function isValidDocumentCountQueryKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === normalizePersistentDocumentCountQueryKey(value);
}

function documentCountStorageKey(keyword: unknown): string {
  const queryKey = normalizePersistentDocumentCountQueryKey(keyword);
  return queryKey ? `${DOCUMENT_COUNT_CACHE_KEY_PREFIX}${queryKey}` : '';
}

/** True only for the product-wide canonical document-count measurement. */
export function isCanonicalPersistentDocumentCount(
  entry: PersistentDocumentCountEvidence | null | undefined,
  expectedQuery?: unknown,
): boolean {
  const expectedQueryKey = expectedQuery === undefined
    ? ''
    : normalizePersistentDocumentCountQueryKey(expectedQuery);
  return Boolean(
    entry
      && isFiniteNonNegative(entry.documentCount)
      && entry.documentCountSource === 'naver-api'
      && entry.documentCountConfidence === 'high'
      && entry.documentCountQueryMode === 'broad'
      && (!expectedQueryKey || (
        isValidDocumentCountQueryKey(entry.documentCountQueryKey)
          && entry.documentCountQueryKey === expectedQueryKey
      ))
      && entry.isDocumentCountEstimated === false
      && isValidIsoTimestamp(entry.documentCountMeasuredAt)
      && typeof entry.documentCountSavedAt === 'number'
      && Number.isFinite(entry.documentCountSavedAt),
  );
}

/** Return a reusable official count, or null when provenance/freshness is unsafe. */
export function getCanonicalPersistentDocumentCount(
  entry: PersistentDocumentCountEvidence | null | undefined,
  now = Date.now(),
  expectedQuery?: unknown,
): number | null {
  if (!isCanonicalPersistentDocumentCount(entry, expectedQuery)) return null;
  const savedAt = entry!.documentCountSavedAt!;
  const age = now - savedAt;
  if (age < 0 || age > PERSISTENT_DOCUMENT_COUNT_TTL_MS) return null;
  return entry!.documentCount;
}

/**
 * Pure merge used by both production writes and provenance regression tests.
 * A secondary/noncanonical value can be retained for diagnostics, but it can
 * never overwrite or refresh an existing canonical document count.
 */
export function mergePersistentCacheEntry(
  existing: PersistentCacheEntry | null | undefined,
  incoming: PersistentCacheWrite,
  now = Date.now(),
): PersistentCacheEntry | null {
  const searchVolume = typeof incoming.searchVolume === 'number'
    && Number.isFinite(incoming.searchVolume)
    && incoming.searchVolume > 0
    ? incoming.searchVolume
    : (existing?.searchVolume ?? null);
  const incomingHasDocumentCount = isFiniteNonNegative(incoming.documentCount);
  const incomingQueryKey = isValidDocumentCountQueryKey(incoming.documentCountQueryKey)
    ? incoming.documentCountQueryKey
    : '';
  const incomingDocumentMeasuredAtMs = Date.parse(String(incoming.documentCountMeasuredAt || ''));
  const incomingIsCanonical = incomingHasDocumentCount
    && incoming.documentCountSource === 'naver-api'
    && incoming.documentCountConfidence === 'high'
    && incoming.documentCountQueryMode === 'broad'
    && Boolean(incomingQueryKey)
    && incoming.isDocumentCountEstimated === false
    && isValidIsoTimestamp(incoming.documentCountMeasuredAt)
    && incomingDocumentMeasuredAtMs <= now + 5 * 60 * 1000;
  const existingMatchesQuery = Boolean(
    incomingQueryKey
      && existing?.documentCountQueryKey === incomingQueryKey,
  );
  const existingIsCanonical = existingMatchesQuery
    && isCanonicalPersistentDocumentCount(existing, incomingQueryKey);
  const existingDocumentMeasuredAtMs = existing?.documentCountSavedAt
    ?? Date.parse(String(existing?.documentCountMeasuredAt || ''));
  const preserveCanonical = existingIsCanonical && (
    !incomingIsCanonical
    || incomingDocumentMeasuredAtMs < existingDocumentMeasuredAtMs
  );

  let documentFields: Pick<
    PersistentCacheEntry,
    | 'documentCount'
    | 'documentCountSource'
    | 'documentCountConfidence'
    | 'documentCountQueryMode'
    | 'documentCountQueryKey'
    | 'isDocumentCountEstimated'
    | 'documentCountMeasuredAt'
    | 'documentCountSavedAt'
  >;

  if (preserveCanonical) {
    documentFields = {
      documentCount: existing!.documentCount,
      documentCountSource: existing!.documentCountSource,
      documentCountConfidence: existing!.documentCountConfidence,
      documentCountQueryMode: existing!.documentCountQueryMode,
      documentCountQueryKey: existing!.documentCountQueryKey,
      isDocumentCountEstimated: existing!.isDocumentCountEstimated,
      documentCountMeasuredAt: existing!.documentCountMeasuredAt,
      documentCountSavedAt: existing!.documentCountSavedAt,
    };
  } else if (incomingHasDocumentCount) {
    const source = incoming.documentCountSource ?? 'legacy';
    documentFields = {
      documentCount: incoming.documentCount,
      documentCountSource: source,
      documentCountConfidence: incoming.documentCountConfidence
        ?? (source === 'scrape' ? 'medium' : source === 'legacy' ? 'low' : 'low'),
      documentCountQueryMode: incoming.documentCountQueryMode,
      documentCountQueryKey: incomingQueryKey || undefined,
      // Only the exact canonical tuple may ever claim a non-estimated value.
      isDocumentCountEstimated: !incomingIsCanonical,
      documentCountMeasuredAt: isValidIsoTimestamp(incoming.documentCountMeasuredAt)
        ? incoming.documentCountMeasuredAt
        : undefined,
      documentCountSavedAt: isValidIsoTimestamp(incoming.documentCountMeasuredAt)
        ? Date.parse(incoming.documentCountMeasuredAt)
        : now,
    };
  } else {
    documentFields = {
      documentCount: existingMatchesQuery ? (existing?.documentCount ?? null) : null,
      documentCountSource: existingMatchesQuery ? existing?.documentCountSource : undefined,
      documentCountConfidence: existingMatchesQuery ? existing?.documentCountConfidence : undefined,
      documentCountQueryMode: existingMatchesQuery ? existing?.documentCountQueryMode : undefined,
      documentCountQueryKey: existingMatchesQuery ? existing?.documentCountQueryKey : undefined,
      isDocumentCountEstimated: existingMatchesQuery ? existing?.isDocumentCountEstimated : undefined,
      documentCountMeasuredAt: existingMatchesQuery ? existing?.documentCountMeasuredAt : undefined,
      documentCountSavedAt: existingMatchesQuery ? existing?.documentCountSavedAt : undefined,
    };
  }

  if (searchVolume === null && documentFields.documentCount === null && !existing) return null;

  return {
    searchVolume,
    ...documentFields,
    realCpc: incoming.realCpc ?? existing?.realCpc ?? null,
    compIdx: incoming.compIdx ?? existing?.compIdx ?? null,
    savedAt: now,
  };
}

function withoutDocumentCount(entry: PersistentCacheEntry): PersistentCacheEntry {
  return {
    ...entry,
    documentCount: null,
    documentCountSource: undefined,
    documentCountConfidence: undefined,
    documentCountQueryMode: undefined,
    documentCountQueryKey: undefined,
    isDocumentCountEstimated: undefined,
    documentCountMeasuredAt: undefined,
    documentCountSavedAt: undefined,
  };
}

function withDocumentCountEvidence(
  general: PersistentCacheEntry | null,
  evidence: PersistentCacheEntry | null,
): PersistentCacheEntry | null {
  const base = general || evidence;
  if (!base) return null;
  const result = withoutDocumentCount({
    ...base,
    searchVolume: general?.searchVolume ?? evidence?.searchVolume ?? null,
    realCpc: general?.realCpc ?? evidence?.realCpc ?? null,
    compIdx: general?.compIdx ?? evidence?.compIdx ?? null,
    savedAt: Math.max(general?.savedAt || 0, evidence?.savedAt || 0),
  });
  if (!evidence) return result;
  return {
    ...result,
    documentCount: evidence.documentCount,
    documentCountSource: evidence.documentCountSource,
    documentCountConfidence: evidence.documentCountConfidence,
    documentCountQueryMode: evidence.documentCountQueryMode,
    documentCountQueryKey: evidence.documentCountQueryKey,
    isDocumentCountEstimated: evidence.isDocumentCountEstimated,
    documentCountMeasuredAt: evidence.documentCountMeasuredAt,
    documentCountSavedAt: evidence.documentCountSavedAt,
  };
}

function resolveCachePath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), CACHE_FILE_NAME);
    }
  } catch {
    // Electron is unavailable in CLI/test contexts.
  }
  const appData = process.env['APPDATA'] || '';
  if (appData) return path.join(appData, 'blogger-admin-panel', CACHE_FILE_NAME);
  return path.join(__dirname, '..', '..', CACHE_FILE_NAME);
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  cachePath = resolveCachePath();
  try {
    if (!fs.existsSync(cachePath)) {
      console.log(`[PERSISTENT-CACHE] cache file not found; starting empty: ${cachePath}`);
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const savedVersion = parsed.__schemaVersion;
    if (savedVersion !== CACHE_SCHEMA_VERSION) {
      console.log(`[PERSISTENT-CACHE] schema changed (${savedVersion || 'none'} -> ${CACHE_SCHEMA_VERSION}); ignoring old cache`);
      cache = new Map();
      return;
    }

    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (key === '__schemaVersion') continue;
      const entry = value as PersistentCacheEntry;
      if (!entry || typeof entry.savedAt !== 'number') continue;
      if (now - entry.savedAt > TTL_MS) {
        expiredCount++;
        continue;
      }
      cache.set(key, entry);
      validCount++;
    }
    console.log(`[PERSISTENT-CACHE] loaded ${validCount} entries; removed ${expiredCount} expired entries`);
  } catch (error: any) {
    console.warn(`[PERSISTENT-CACHE] load failed: ${error?.message || error}`);
    cache = new Map();
  }
}

function scheduleWrite(): void {
  if (pendingWrite) return;
  pendingWrite = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    pendingWrite = false;
    writeTimer = null;
    flushToDisk();
  }, WRITE_DEBOUNCE_MS);
}

function flushToDisk(): void {
  if (!cachePath) return;
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (cache.size > MAX_ENTRIES) {
      const entries = Array.from(cache.entries())
        .sort((a, b) => b[1].savedAt - a[1].savedAt)
        .slice(0, MAX_ENTRIES);
      cache = new Map(entries);
    }
    const obj: Record<string, unknown> = { __schemaVersion: CACHE_SCHEMA_VERSION };
    for (const [key, value] of cache.entries()) obj[key] = value;
    fs.writeFileSync(cachePath, JSON.stringify(obj), 'utf-8');
  } catch (error: any) {
    console.warn(`[PERSISTENT-CACHE] write failed: ${error?.message || error}`);
  }
}

export function getPersistent(keyword: string): PersistentCacheEntry | null {
  ensureLoaded();
  const now = Date.now();
  const clean = keyword.replace(/\s+/g, '');
  const queryKey = normalizePersistentDocumentCountQueryKey(keyword);
  const storageKey = documentCountStorageKey(queryKey);
  const readFresh = (key: string): PersistentCacheEntry | null => {
    if (!key) return null;
    const entry = cache.get(key) || null;
    if (!entry) return null;
    if (now - entry.savedAt <= TTL_MS) return entry;
    cache.delete(key);
    return null;
  };
  const general = readFresh(keyword) || readFresh(clean);
  const exactDocumentEntry = readFresh(storageKey);
  const compatibleLegacyEntry = general?.documentCountQueryKey === queryKey
    ? general
    : null;
  const documentEntry = exactDocumentEntry?.documentCountQueryKey === queryKey
    ? exactDocumentEntry
    : compatibleLegacyEntry;
  return withDocumentCountEvidence(general, documentEntry);
}

function hasDocumentCountValue(entry: PersistentCacheEntry): boolean {
  return isFiniteNonNegative(entry.documentCount);
}

function mergeInputWithDerivedDocumentQueryKey(
  keyword: string,
  entry: PersistentCacheWrite,
): PersistentCacheWrite {
  return {
    ...entry,
    documentCountQueryKey: normalizePersistentDocumentCountQueryKey(keyword),
  };
}

function setGeneralPersistentAliases(
  keyword: string,
  clean: string,
  entry: PersistentCacheEntry,
): void {
  const general = withoutDocumentCount(entry);
  cache.set(keyword, general);
  if (clean !== keyword) cache.set(clean, general);
}

function setExactPersistentDocumentEntry(
  queryKey: string,
  entry: PersistentCacheEntry,
): void {
  const storageKey = documentCountStorageKey(queryKey);
  if (!storageKey || !hasDocumentCountValue(entry)) return;
  cache.set(storageKey, entry);
}

export function setPersistent(keyword: string, entry: PersistentCacheWrite): void {
  ensureLoaded();
  if (!keyword) return;
  const clean = keyword.replace(/\s+/g, '');
  const queryKey = normalizePersistentDocumentCountQueryKey(keyword);
  if (!queryKey) return;
  const existing = getPersistent(keyword);
  const merged = mergePersistentCacheEntry(
    existing,
    mergeInputWithDerivedDocumentQueryKey(keyword, entry),
    Date.now(),
  );
  if (!merged) return;
  setGeneralPersistentAliases(keyword, clean, merged);
  setExactPersistentDocumentEntry(queryKey, merged);
  scheduleWrite();
}

export function getCacheStats(): { size: number; path: string | null } {
  ensureLoaded();
  return { size: cache.size, path: cachePath };
}

export function getAllKeywordsWithCompleteData(): Array<{
  keyword: string;
  searchVolume: number;
  documentCount: number;
  documentCountSource: 'naver-api';
  documentCountConfidence: 'high';
  documentCountQueryMode: 'broad';
  documentCountQueryKey: string;
  isDocumentCountEstimated: false;
  documentCountMeasuredAt: string;
  documentCountSavedAt: number;
  savedAt: number;
}> {
  ensureLoaded();
  const result: ReturnType<typeof getAllKeywordsWithCompleteData> = [];
  const now = Date.now();
  const queryKeys = new Set<string>();
  for (const entry of cache.values()) {
    if (isValidDocumentCountQueryKey(entry.documentCountQueryKey)) {
      queryKeys.add(entry.documentCountQueryKey);
    }
  }
  for (const queryKey of queryKeys) {
    const entry = getPersistent(queryKey);
    if (!entry || typeof entry.searchVolume !== 'number' || entry.searchVolume <= 0) continue;
    const documentCount = getCanonicalPersistentDocumentCount(entry, now, queryKey);
    if (documentCount === null || documentCount <= 0) continue;
    result.push({
      keyword: queryKey,
      searchVolume: entry.searchVolume,
      documentCount,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountQueryKey: queryKey,
      isDocumentCountEstimated: false,
      documentCountMeasuredAt: entry.documentCountMeasuredAt!,
      documentCountSavedAt: entry.documentCountSavedAt!,
      savedAt: entry.savedAt,
    });
  }
  return result;
}

export function flushNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  pendingWrite = false;
  flushToDisk();
}
