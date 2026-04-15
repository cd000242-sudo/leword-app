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
}

export interface TrackedPost {
  postUrl: string;
  keyword: string;
  registeredAt: number;
  lastCheckedAt: number;
  predictedRank: number;
  history: Array<{ ts: number; rank: number | null; checked: boolean }>;
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

  // 알림 룰
  if (t.history.length >= 2) {
    const prev = t.history[t.history.length - 2];
    const docDelta = docCount - prev.docCount;
    const dailyGrowth = docDelta / Math.max(1, (Date.now() - prev.ts) / 86400000);

    if (dailyGrowth >= 50) {
      t.alerts.push({
        ts: Date.now(),
        type: 'saturation',
        message: `포화 임박 — 일간 +${Math.round(dailyGrowth)}개 문서 증가`,
      });
    }
    if (searchVolume != null && prev.searchVolume != null) {
      const svDelta = (searchVolume - prev.searchVolume) / Math.max(1, prev.searchVolume);
      if (svDelta <= -0.15) {
        t.alerts.push({
          ts: Date.now(),
          type: 'decay',
          message: `검색량 ${Math.round(svDelta * 100)}% 하락`,
        });
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

// ── Tracked Posts ──

export function addTrackedPost(postUrl: string, keyword: string, predictedRank: number): void {
  const store = load();
  if (!store.posts[postUrl]) {
    store.posts[postUrl] = {
      postUrl,
      keyword,
      registeredAt: Date.now(),
      lastCheckedAt: 0,
      predictedRank,
      history: [],
    };
    save(store);
  }
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
