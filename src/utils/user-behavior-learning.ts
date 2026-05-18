// v2.43.49: 사용자 행동 학습
// 사용자가 SSS 키워드를 클릭/복사/제외했는지 추적 → 다음 발굴에 보너스/페널티
// 결정론적 (LLM 아님), 로컬 영속, AI 정책 부합

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type BehaviorType = 'clicked' | 'copied' | 'excluded' | 'liked' | 'disliked';

export interface BehaviorEvent {
  keyword: string;
  type: BehaviorType;
  ts: number;
  source?: string; // 'rich-feed' / 'pro-hunter' / 'mindmap'
}

export interface KeywordStats {
  keyword: string;
  clicked: number;
  copied: number;
  excluded: number;
  liked: number;
  disliked: number;
  lastInteractedAt: number;
}

interface BehaviorStore {
  version: 1;
  events: BehaviorEvent[];
  stats: Record<string, KeywordStats>;
}

const MAX_EVENTS = 5000; // 최근 5000건만
const FILE_NAME = 'user-behavior.json';

function getPath(): string {
  const dir = path.join(app.getPath('userData'), 'leword');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

let memory: BehaviorStore | null = null;

function load(): BehaviorStore {
  if (memory) return memory;
  try {
    const p = getPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as BehaviorStore;
      if (parsed?.version === 1) {
        memory = parsed;
        return memory;
      }
    }
  } catch (e: any) {
    console.warn('[BEHAVIOR] load 실패:', e?.message);
  }
  memory = { version: 1, events: [], stats: {} };
  return memory;
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!memory) return;
    try {
      fs.writeFileSync(getPath(), JSON.stringify(memory), 'utf8');
    } catch (e: any) {
      console.warn('[BEHAVIOR] save 실패:', e?.message);
    }
    saveTimer = null;
  }, 2000);
  saveTimer.unref?.();
}

export function recordBehavior(keyword: string, type: BehaviorType, source?: string): void {
  const clean = String(keyword || '').trim();
  if (!clean) return;
  const store = load();
  const now = Date.now();
  store.events.push({ keyword: clean, type, ts: now, source });
  // 통계 업데이트
  if (!store.stats[clean]) {
    store.stats[clean] = {
      keyword: clean,
      clicked: 0,
      copied: 0,
      excluded: 0,
      liked: 0,
      disliked: 0,
      lastInteractedAt: now,
    };
  }
  store.stats[clean][type]++;
  store.stats[clean].lastInteractedAt = now;
  // 이벤트 cap
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
  scheduleSave();
}

export function getStats(keyword: string): KeywordStats | null {
  const store = load();
  return store.stats[keyword.trim()] || null;
}

/**
 * 키워드에 대한 사용자 가중치 (-1.0 ~ +1.0)
 * +: 자주 클릭/복사한 키워드 → 다음 발굴 우선
 * -: 제외/dislike 한 키워드 → 다음 발굴 차단
 */
export function getUserPreferenceScore(keyword: string): number {
  const s = getStats(keyword);
  if (!s) return 0;
  const positive = s.clicked + s.copied * 2 + s.liked * 3;
  const negative = s.excluded * 5 + s.disliked * 3;
  const total = positive + negative;
  if (total === 0) return 0;
  const raw = (positive - negative) / total;
  return Math.max(-1, Math.min(1, raw));
}

/**
 * 사용자가 제외한 키워드 목록 (다음 발굴에서 차단)
 */
export function getExcludedKeywords(): Set<string> {
  const store = load();
  const result = new Set<string>();
  for (const [kw, s] of Object.entries(store.stats)) {
    // excluded > liked/copied 면 차단 유지
    if (s.excluded > 0 && s.excluded >= s.clicked + s.copied + s.liked) {
      result.add(kw);
    }
  }
  return result;
}

/**
 * 자주 클릭/복사한 카테고리 패턴 추출 (학습 기반 카테고리 추론)
 */
export function getTopInteractedKeywords(limit = 50): KeywordStats[] {
  const store = load();
  return Object.values(store.stats)
    .map(s => ({ s, score: s.clicked + s.copied * 2 + s.liked * 3 - s.excluded * 5 - s.disliked * 3 }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.s);
}

export function clearBehavior(): void {
  memory = { version: 1, events: [], stats: {} };
  scheduleSave();
}
