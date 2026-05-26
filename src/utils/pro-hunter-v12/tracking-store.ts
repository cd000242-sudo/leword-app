// PRO Hunter v12 — 추적 데이터 저장소
// 작성: 2026-04-15
// Lifecycle 추적 + Rank Tracker를 위한 시계열 저장

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface TrackedKeyword {
  keyword: string;
  registeredAt: number;
  lastCheckedAt: number;
  initialDocCount: number;
  history: Array<{ ts: number; docCount: number; searchVolume: number | null; topRank?: number | null }>;
  alerts: Array<{ ts: number; type: 'saturation' | 'decay' | 'opportunity'; message: string }>;
  // v2.43.38: surge 감지된 키워드 보호 (eviction 우선순위 낮춤)
  surgeProtected?: boolean;
  surgeProtectedAt?: number;
}

export interface TrackedPost {
  postUrl: string;
  keyword: string;            // 주 키워드 (호환성)
  keywords?: string[];        // 다중 키워드 (v12.1+)
  registeredAt: number;
  lastCheckedAt: number;
  predictedRank: number;
  history: Array<{ ts: number; rank: number | null; checked: boolean; perKeyword?: Record<string, number | null> }>;
}

interface StoreSchema {
  version: 1;
  keywords: Record<string, TrackedKeyword>;
  posts: Record<string, TrackedPost>;
}

const FILE_NAME = 'tracking-store.json';

function getPath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function load(): StoreSchema {
  const p = getPath();
  if (!fs.existsSync(p)) return { version: 1, keywords: {}, posts: {} };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) return parsed;
  } catch (err) {
    console.error('[TRACKING] 로드 실패:', err);
  }
  return { version: 1, keywords: {}, posts: {} };
}

function save(data: StoreSchema): void {
  fs.writeFileSync(getPath(), JSON.stringify(data, null, 2), 'utf8');
}

// ── Tracked Keywords ──

export function addTrackedKeyword(keyword: string, initialDocCount: number, searchVolume: number | null): void {
  const store = load();
  if (!store.keywords[keyword]) {
    store.keywords[keyword] = {
      keyword,
      registeredAt: Date.now(),
      lastCheckedAt: Date.now(),
      initialDocCount,
      history: [{ ts: Date.now(), docCount: initialDocCount, searchVolume }],
      alerts: [],
    };
    save(store);
  }
}

export function recordKeywordCheck(keyword: string, docCount: number, searchVolume: number | null): TrackedKeyword | null {
  const store = load();
  const t = store.keywords[keyword];
  if (!t) return null;

  t.lastCheckedAt = Date.now();
  t.history.push({ ts: Date.now(), docCount, searchVolume });

  // history 100개 제한
  if (t.history.length > 100) t.history = t.history.slice(-100);

  // 알림 룰 — v2.49.7: cooldown 7일 + 임계값 상향 (사용자 보고: "포화 임박 알림 자꾸 뜸")
  const ALERT_COOLDOWN_MS = 7 * 86400000; // 7일
  const findLastAlertOfType = (type: 'saturation' | 'decay'): number =>
    t.alerts.filter(a => a.type === type).reduce((max, a) => Math.max(max, a.ts), 0);

  if (t.history.length >= 2) {
    const prev = t.history[t.history.length - 2];
    const docDelta = docCount - prev.docCount;
    const dailyGrowth = docDelta / Math.max(1, (Date.now() - prev.ts) / 86400000);

    // v2.49.7: 임계 50 → 100 (50은 일반 키워드도 흔함)
    if (dailyGrowth >= 100) {
      const lastSat = findLastAlertOfType('saturation');
      if (Date.now() - lastSat >= ALERT_COOLDOWN_MS) {
        t.alerts.push({
          ts: Date.now(),
          type: 'saturation',
          message: `포화 임박 — 일간 +${Math.round(dailyGrowth)}개 문서 증가`,
        });
      }
    }
    if (searchVolume != null && prev.searchVolume != null) {
      const svDelta = (searchVolume - prev.searchVolume) / Math.max(1, prev.searchVolume);
      if (svDelta <= -0.15) {
        const lastDecay = findLastAlertOfType('decay');
        if (Date.now() - lastDecay >= ALERT_COOLDOWN_MS) {
          t.alerts.push({
            ts: Date.now(),
            type: 'decay',
            message: `검색량 ${Math.round(svDelta * 100)}% 하락`,
          });
        }
      }
    }
  }

  // 알림 50개 제한
  if (t.alerts.length > 50) t.alerts = t.alerts.slice(-50);

  save(store);
  return t;
}

export function listTrackedKeywords(): TrackedKeyword[] {
  return Object.values(load().keywords);
}

export function removeTrackedKeyword(keyword: string): void {
  const store = load();
  delete store.keywords[keyword];
  save(store);
}

// v2.43.35 (Phase 2): 외부 trending 키워드 일괄 자동 등록
//   1팀 비평: "surge-detector autoScan 이 listTrackedKeywords().slice(0, 20) 만 봄.
//   사용자가 추적 안 한 신규 이벤트는 영원히 감지 못 함" → tracking-store 자체를 동적 풀로 전환
const MAX_TRACKED_KEYWORDS = 800;   // 풀 size cap (surge-detector 입력)
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 미체크 → 자동 제거

export interface BulkRegisterResult {
  added: number;
  skipped: number;
  evicted: number;
  totalSize: number;
}

export function bulkRegisterTrending(
  items: Array<{ keyword: string; docCount?: number; searchVolume?: number | null }>,
): BulkRegisterResult {
  const store = load();
  const now = Date.now();
  let added = 0;
  let skipped = 0;
  let evicted = 0;

  // 1. stale 30일+ 미체크 자동 제거
  for (const [k, v] of Object.entries(store.keywords)) {
    if (now - v.lastCheckedAt > STALE_TTL_MS) {
      delete store.keywords[k];
      evicted++;
    }
  }

  // 2. 신규 키워드 등록 (이미 있으면 skip)
  for (const it of items) {
    const kw = String(it.keyword || '').trim();
    if (!kw || kw.length < 2 || kw.length > 40) { skipped++; continue; }
    if (store.keywords[kw]) { skipped++; continue; }
    store.keywords[kw] = {
      keyword: kw,
      registeredAt: now,
      lastCheckedAt: now,
      initialDocCount: it.docCount || 0,
      history: [{ ts: now, docCount: it.docCount || 0, searchVolume: it.searchVolume ?? null }],
      alerts: [],
    };
    added++;
  }

  // 3. size cap 초과 시 가장 오래된 lastCheckedAt 순으로 제거
  //    v2.43.38: surgeProtected 키워드는 7일간 evict 면제 (검증된 키워드 보호)
  const total = Object.keys(store.keywords).length;
  if (total > MAX_TRACKED_KEYWORDS) {
    const SURGE_PROTECTION_TTL = 7 * 24 * 60 * 60 * 1000;
    const sorted = Object.values(store.keywords).sort((a, b) => {
      // surge 보호 키워드는 뒤로 (evict 우선순위 낮춤)
      const aProtected = !!a.surgeProtected && (now - (a.surgeProtectedAt || 0)) < SURGE_PROTECTION_TTL;
      const bProtected = !!b.surgeProtected && (now - (b.surgeProtectedAt || 0)) < SURGE_PROTECTION_TTL;
      if (aProtected && !bProtected) return 1;
      if (!aProtected && bProtected) return -1;
      return a.lastCheckedAt - b.lastCheckedAt;
    });
    const toRemove = sorted.slice(0, total - MAX_TRACKED_KEYWORDS);
    for (const t of toRemove) {
      delete store.keywords[t.keyword];
      evicted++;
    }
  }

  save(store);
  return { added, skipped, evicted, totalSize: Object.keys(store.keywords).length };
}

// v2.43.38: surge 감지된 키워드에 보호 플래그 부여 (eviction 면제 7일)
export function markSurgeProtected(keywords: string[]): number {
  const store = load();
  const now = Date.now();
  let count = 0;
  for (const kw of keywords) {
    const t = store.keywords[kw];
    if (t) {
      t.surgeProtected = true;
      t.surgeProtectedAt = now;
      count++;
    }
  }
  if (count > 0) save(store);
  return count;
}

// ── Tracked Posts ──

export function addTrackedPost(postUrl: string, keyword: string, predictedRank: number, additionalKeywords?: string[]): void {
  const store = load();
  const allKeywords = [keyword, ...(additionalKeywords || [])].filter((k, i, arr) => k && arr.indexOf(k) === i);
  if (!store.posts[postUrl]) {
    store.posts[postUrl] = {
      postUrl,
      keyword,
      keywords: allKeywords,
      registeredAt: Date.now(),
      lastCheckedAt: 0,
      predictedRank,
      history: [],
    };
  } else {
    // 기존 글에 키워드 추가
    const existing = store.posts[postUrl];
    const merged = new Set([...(existing.keywords || [existing.keyword]), ...allKeywords]);
    existing.keywords = Array.from(merged);
  }
  save(store);
}

export function recordPostRankMulti(postUrl: string, perKeyword: Record<string, number | null>): TrackedPost | null {
  const store = load();
  const p = store.posts[postUrl];
  if (!p) return null;
  p.lastCheckedAt = Date.now();
  // 가장 좋은 순위를 대표값으로
  const ranks = Object.values(perKeyword).filter((r): r is number => r != null);
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;
  p.history.push({ ts: Date.now(), rank: bestRank, checked: true, perKeyword });
  if (p.history.length > 100) p.history = p.history.slice(-100);
  save(store);
  return p;
}

export function recordPostRank(postUrl: string, rank: number | null): TrackedPost | null {
  const store = load();
  const p = store.posts[postUrl];
  if (!p) return null;
  p.lastCheckedAt = Date.now();
  p.history.push({ ts: Date.now(), rank, checked: true });
  if (p.history.length > 100) p.history = p.history.slice(-100);
  save(store);
  return p;
}

export function listTrackedPosts(): TrackedPost[] {
  return Object.values(load().posts);
}

export function removeTrackedPost(postUrl: string): void {
  const store = load();
  delete store.posts[postUrl];
  save(store);
}

// ── Keyword Tracking Data Lookup ──

export interface KeywordTrackingSnapshot {
  isTracked: boolean;
  latestRank: number | null;
  previousRank: number | null;
  rankChange: number | null;       // +면 하락, -면 상승
  startDate: string | null;
  postUrl: string | null;
  checkCount: number;
}

/**
 * 특정 키워드에 대한 추적 이력을 조회한다.
 * tracked posts 중 해당 keyword를 포함하는 글의 순위 이력을 반환.
 */
export function getTrackingDataForKeyword(keyword: string): KeywordTrackingSnapshot | null {
  const store = load();
  const posts = Object.values(store.posts);

  // keyword가 일치하는 글 찾기 (다중 키워드도 검색)
  const matched = posts.filter(
    (p) => p.keyword === keyword || (p.keywords && p.keywords.includes(keyword))
  );
  if (matched.length === 0) return null;

  // 가장 최근에 체크된 글 우선
  const sorted = [...matched].sort((a, b) => b.lastCheckedAt - a.lastCheckedAt);
  const best = sorted[0];

  // 순위 이력에서 최신 2개 추출
  const rankedHistory = best.history.filter((h) => h.rank != null);
  const latest = rankedHistory.length > 0 ? rankedHistory[rankedHistory.length - 1] : null;
  const previous = rankedHistory.length > 1 ? rankedHistory[rankedHistory.length - 2] : null;

  const latestRank = latest?.rank ?? null;
  const previousRank = previous?.rank ?? null;
  const rankChange = (latestRank != null && previousRank != null)
    ? latestRank - previousRank   // +면 하락, -면 상승
    : null;

  return {
    isTracked: true,
    latestRank,
    previousRank,
    rankChange,
    startDate: new Date(best.registeredAt).toISOString().split('T')[0],
    postUrl: best.postUrl,
    checkCount: rankedHistory.length,
  };
}
