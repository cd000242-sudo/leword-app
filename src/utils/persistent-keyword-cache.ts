/**
 * 🗄️ 영구 디스크 캐시 — 키워드 검색량/문서수 cross-run 보존
 *
 * 이유: Naver SearchAd API가 배치 응답 비결정적 + 분당 Rate Limit.
 * 한 번 성공한 데이터를 디스크에 저장하면 다음 run에서 재활용 가능.
 * 메모리 apiCache 위에 덮어쓰는 계층.
 */
import * as fs from 'fs';
import * as path from 'path';

interface PersistentCacheEntry {
  searchVolume: number | null;
  documentCount: number | null;
  realCpc?: number | null;
  compIdx?: number | null;
  savedAt: number; // epoch ms
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const WRITE_DEBOUNCE_MS = 5000;
const CACHE_FILE_NAME = 'keyword-cache.json';

let cache: Map<string, PersistentCacheEntry> = new Map();
let cachePath: string | null = null;
let loaded = false;
let pendingWrite = false;
let writeTimer: NodeJS.Timeout | null = null;

function resolveCachePath(): string {
  // Electron app 경로 우선, fallback으로 APPDATA
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), CACHE_FILE_NAME);
    }
  } catch {
    // ignore
  }
  const appData = process.env['APPDATA'] || '';
  if (appData) {
    return path.join(appData, 'blogger-admin-panel', CACHE_FILE_NAME);
  }
  // 마지막 fallback
  return path.join(__dirname, '..', '..', CACHE_FILE_NAME);
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  cachePath = resolveCachePath();
  try {
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const now = Date.now();
      let validCount = 0;
      let expiredCount = 0;
      for (const [key, value] of Object.entries(parsed)) {
        const entry = value as PersistentCacheEntry;
        if (!entry || typeof entry.savedAt !== 'number') continue;
        if (now - entry.savedAt > TTL_MS) {
          expiredCount++;
          continue;
        }
        cache.set(key, entry);
        validCount++;
      }
      console.log(`[PERSISTENT-CACHE] 🗄️ 로드 완료: ${validCount}개 유효, ${expiredCount}개 만료 제거`);
    } else {
      console.log(`[PERSISTENT-CACHE] 🗄️ 캐시 파일 없음, 새로 시작: ${cachePath}`);
    }
  } catch (e: any) {
    console.warn(`[PERSISTENT-CACHE] ⚠️ 로드 실패: ${e?.message || e}`);
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj: Record<string, PersistentCacheEntry> = {};
    for (const [key, value] of cache.entries()) {
      obj[key] = value;
    }
    fs.writeFileSync(cachePath, JSON.stringify(obj), 'utf-8');
    console.log(`[PERSISTENT-CACHE] 💾 저장 완료: ${cache.size}개 → ${cachePath}`);
  } catch (e: any) {
    console.warn(`[PERSISTENT-CACHE] ⚠️ 저장 실패: ${e?.message || e}`);
  }
}

export function getPersistent(keyword: string): PersistentCacheEntry | null {
  ensureLoaded();
  const entry = cache.get(keyword) || cache.get(keyword.replace(/\s+/g, ''));
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    cache.delete(keyword);
    return null;
  }
  return entry;
}

export function setPersistent(keyword: string, entry: Omit<PersistentCacheEntry, 'savedAt'>): void {
  ensureLoaded();
  if (!keyword) return;
  // searchVolume이나 documentCount 중 하나라도 유효한 숫자면 저장
  const hasData = (typeof entry.searchVolume === 'number' && entry.searchVolume > 0)
    || (typeof entry.documentCount === 'number' && entry.documentCount > 0);
  if (!hasData) return;

  const existing = cache.get(keyword) || cache.get(keyword.replace(/\s+/g, ''));
  // 기존 값과 머지 (더 좋은 데이터 유지)
  const merged: PersistentCacheEntry = {
    searchVolume: (typeof entry.searchVolume === 'number' && entry.searchVolume > 0)
      ? entry.searchVolume
      : (existing?.searchVolume ?? null),
    documentCount: (typeof entry.documentCount === 'number' && entry.documentCount > 0)
      ? entry.documentCount
      : (existing?.documentCount ?? null),
    realCpc: entry.realCpc ?? existing?.realCpc ?? null,
    compIdx: entry.compIdx ?? existing?.compIdx ?? null,
    savedAt: Date.now(),
  };
  cache.set(keyword, merged);
  const clean = keyword.replace(/\s+/g, '');
  if (clean !== keyword) cache.set(clean, merged);
  scheduleWrite();
}

export function getCacheStats(): { size: number; path: string | null } {
  ensureLoaded();
  return { size: cache.size, path: cachePath };
}

/**
 * 영구 캐시에 저장된 모든 키워드(완전 데이터 보유) 반환
 * 시드 풀 사전 주입용
 */
export function getAllKeywordsWithCompleteData(): Array<{
  keyword: string;
  searchVolume: number;
  documentCount: number;
}> {
  ensureLoaded();
  const result: Array<{ keyword: string; searchVolume: number; documentCount: number }> = [];
  const seen = new Set<string>();
  for (const [key, entry] of cache.entries()) {
    if (!entry || typeof entry.searchVolume !== 'number' || typeof entry.documentCount !== 'number') continue;
    if (entry.searchVolume <= 0 || entry.documentCount <= 0) continue;
    // 공백제거/원본 중 원본 선호 (공백 있는 형태가 사용자 친화적)
    const hasSpace = key.includes(' ');
    const canonKey = hasSpace ? key : key;
    if (seen.has(canonKey)) continue;
    seen.add(canonKey);
    result.push({
      keyword: canonKey,
      searchVolume: entry.searchVolume,
      documentCount: entry.documentCount,
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
