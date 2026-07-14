/**
 * 🗄️ SearchAd 검색량 전용 캐시 (read-before-measure)
 *
 * 네이버 월간 검색량은 월 단위 집계라 하루~수주 내 값은 사실상 동일하다. 그런데 라이브 워커는
 * 같은 후보 1,800개를 매 실행(하루 24회) 새로 측정해 쿼터를 태웠다. 이 캐시를 측정 직전에
 * 조회해 신선(<TTL)한 값은 API 없이 서빙하고, 미측정/만료만 API로 보낸다.
 *
 * persistent-keyword-cache 는 sv+dc 둘 다 있어야 저장하므로(등급 경로 보호) 볼륨-only 캐시로
 * 재사용할 수 없다 → 본 캐시가 볼륨 실측값만 별도로 30일 보존한다. 값은 항상 "실측 절대값"이라
 * UI 규칙(추정 금지) 준수. measuredAtMs 로 "N일 전 측정" 라벨 가능.
 *
 * /data 볼륨에 저장 → 워커·API 컨테이너 공유 + 재배포 생존.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TTL_DAYS = Number(process.env['LEWORD_SEARCHAD_VOLUME_CACHE_TTL_DAYS']) || 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const SCHEMA = 'searchad-vol-v1';
const MAX_ENTRIES = 80_000;
const WRITE_DEBOUNCE_MS = 5000;

export interface SearchAdVolumeEntry {
  pc: number | null;
  mo: number | null;
  total: number | null;
  comp?: string;
  cpc?: number | null;
  at: number; // measured epoch ms
}

let cache: Map<string, SearchAdVolumeEntry> | null = null;
let dirty = false;
let writeTimer: NodeJS.Timeout | null = null;

function cacheFile(): string {
  const explicit = process.env['LEWORD_SEARCHAD_VOLUME_CACHE_FILE'];
  if (explicit) return explicit;
  const dataDir =
    process.env['LEWORD_SERVER_USER_DATA'] ||
    process.env['LEWORD_MOBILE_DATA_DIR'] ||
    process.env['LEWORD_MOBILE_CACHE_DIR'] ||
    (fs.existsSync('/data') ? '/data' : '') ||
    path.join(os.tmpdir(), 'leword');
  return path.join(dataDir, 'searchad-volume-cache.json');
}

// naver-searchad-api 의 매칭 정규화와 동일 (소문자 + 공백/+ 제거)
const norm = (k: string): string => String(k || '').toLowerCase().replace(/[\s+]+/g, '');

function load(): Map<string, SearchAdVolumeEntry> {
  if (cache) return cache;
  cache = new Map();
  try {
    const file = cacheFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed?.schemaVersion === SCHEMA && parsed?.entries) {
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed.entries)) {
          const e = v as SearchAdVolumeEntry;
          if (e && typeof e.at === 'number' && now - e.at <= TTL_MS) cache.set(k, e);
        }
      }
    }
  } catch {
    // 캐시는 최적화용 — 실패해도 정상 동작
  }
  return cache;
}

/** 신선(<TTL)한 캐시 볼륨 반환. 없거나 만료면 null. ageMs 포함(신선도 라벨용). */
export function getSearchAdVolumeCached(keyword: string): (SearchAdVolumeEntry & { ageMs: number }) | null {
  const c = load();
  const key = norm(keyword);
  const e = c.get(key);
  if (!e) return null;
  const ageMs = Date.now() - e.at;
  if (ageMs > TTL_MS) {
    c.delete(key);
    return null;
  }
  return { ...e, ageMs };
}

/** 실측 양수 볼륨만 캐시 (null/0/음수는 저장 안 함 — 라이저 놓치기 방지, 측정실패 캐시 방지) */
export function setSearchAdVolumeCached(
  keyword: string,
  v: { pc: number | null; mo: number | null; total: number | null; comp?: string; cpc?: number | null },
): void {
  if (!keyword) return;
  if (
    typeof v.pc !== 'number'
    || !Number.isFinite(v.pc)
    || typeof v.mo !== 'number'
    || !Number.isFinite(v.mo)
    || typeof v.total !== 'number'
    || !Number.isFinite(v.total)
    || v.total <= 0
    || v.pc + v.mo !== v.total
  ) return;
  const c = load();
  c.set(norm(keyword), { pc: v.pc, mo: v.mo, total: v.total, comp: v.comp, cpc: v.cpc ?? null, at: Date.now() });
  scheduleWrite();
}

function scheduleWrite(): void {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (dirty) flush();
  }, WRITE_DEBOUNCE_MS);
  if (writeTimer && typeof writeTimer.unref === 'function') writeTimer.unref();
}

function flush(): void {
  if (!cache) return;
  dirty = false;
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let entries = Array.from(cache.entries());
    if (entries.length > MAX_ENTRIES) {
      entries = entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
      cache = new Map(entries);
    }
    const obj: Record<string, SearchAdVolumeEntry> = {};
    for (const [k, v] of entries) obj[k] = v;
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: SCHEMA, entries: obj }), 'utf8');
  } catch {
    // 영속 실패해도 인메모리로 동작
  }
}

export function searchAdVolumeCacheStats(): { size: number; ttlDays: number } {
  return { size: load().size, ttlDays: TTL_DAYS };
}

export function flushSearchAdVolumeCache(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flush();
}
