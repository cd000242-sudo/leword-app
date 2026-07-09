/**
 * 자동완성 신규 진입 감지 (급등 레인 Phase 2) — "방금 자동완성에 등장한 제안어가 가장 빠른 급등 신호다."
 *
 * 사이클마다 관측한 자동완성 제안어를 스냅샷 파일에 기록하고, 이전 스냅샷에 없던 제안어를
 * '신규 진입(fresh)'으로 판정한다. 신규 진입은 검색 수요가 막 형성되기 시작했다는 실측 사실이라
 * 경쟁 툴 리스트에 오르기 전 단계를 선점할 수 있다.
 *
 * 콜드스타트 규칙: 스냅샷 파일이 없던 첫 관측은 기준선 수집으로만 쓰고 fresh 를 반환하지 않는다
 * (첫 사이클에 전부 "신규"로 오탐하는 것을 방지).
 */

import * as fs from 'fs';
import * as path from 'path';

interface SeenEntry {
  keyword: string;
  firstSeenAt: string;
  lastSeenAt: string;
  // 콜드스타트 기준선 수집분 — '신규 진입'으로 태깅하지 않는다
  baseline?: boolean;
}

export interface SurgeEmergenceTrackerOptions {
  file?: string;
  now?: () => Date;
  maxEntries?: number;
  expireMs?: number;
}

const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;
export const SURGE_NEW_ENTRY_WINDOW_MS = 48 * 60 * 60 * 1000;

function compactText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

export class SurgeEmergenceTracker {
  private readonly file?: string;
  private readonly now: () => Date;
  private readonly maxEntries: number;
  private readonly expireMs: number;
  private readonly seen = new Map<string, SeenEntry>();
  private loaded = false;
  private hadBaseline = false;

  constructor(options: SurgeEmergenceTrackerOptions = {}) {
    this.file = options.file;
    this.now = options.now || (() => new Date());
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.expireMs = options.expireMs ?? DEFAULT_EXPIRE_MS;
  }

  /**
   * 관측한 제안어를 기록하고 신규 진입 목록을 돌려준다.
   * coldStart(기준선 없음)면 전부 기록만 하고 fresh 는 비운다.
   */
  observe(suggestions: string[]): { fresh: string[]; coldStart: boolean } {
    this.loadSnapshot();
    const coldStart = !this.hadBaseline && this.seen.size === 0;
    const stamp = this.now().toISOString();
    const fresh: string[] = [];
    const freshKeys = new Set<string>();
    let dirty = false;
    for (const raw of suggestions || []) {
      const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
      const key = compactText(keyword);
      if (!key) continue;
      const existing = this.seen.get(key);
      if (existing) {
        if (existing.lastSeenAt !== stamp) {
          this.seen.set(key, { ...existing, lastSeenAt: stamp });
          dirty = true;
        }
        continue;
      }
      this.seen.set(key, { keyword, firstSeenAt: stamp, lastSeenAt: stamp, ...(coldStart ? { baseline: true } : {}) });
      dirty = true;
      if (!coldStart && !freshKeys.has(key)) {
        freshKeys.add(key);
        fresh.push(keyword);
      }
    }
    if (dirty) {
      this.hadBaseline = true;
      this.expireAndCap();
      this.saveSnapshot();
    }
    return { fresh, coldStart };
  }

  /** 관측 기준 신규 진입 여부(기본 48h 창) — 표시 태깅용 실측 사실. */
  isRecentNewEntry(keyword: string, windowMs = SURGE_NEW_ENTRY_WINDOW_MS): boolean {
    this.loadSnapshot();
    const entry = this.seen.get(compactText(keyword));
    if (!entry || entry.baseline === true) return false;
    const age = this.now().getTime() - Date.parse(entry.firstSeenAt);
    return Number.isFinite(age) && age >= 0 && age <= windowMs;
  }

  private expireAndCap(): void {
    const nowMs = this.now().getTime();
    for (const [key, entry] of this.seen.entries()) {
      const idle = nowMs - Date.parse(entry.lastSeenAt);
      if (!Number.isFinite(idle) || idle > this.expireMs) this.seen.delete(key);
    }
    if (this.seen.size <= this.maxEntries) return;
    const overflow = [...this.seen.entries()]
      .sort((a, b) => Date.parse(a[1].lastSeenAt) - Date.parse(b[1].lastSeenAt))
      .slice(0, this.seen.size - this.maxEntries);
    for (const [key] of overflow) this.seen.delete(key);
  }

  private loadSnapshot(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = fs.readFileSync(this.file, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' ? parsed.seen : null;
      if (!entries || typeof entries !== 'object') return;
      for (const [key, value] of Object.entries(entries as Record<string, SeenEntry>)) {
        if (!value || !value.firstSeenAt || !value.lastSeenAt) continue;
        this.seen.set(compactText(key), {
          keyword: String(value.keyword || key),
          firstSeenAt: String(value.firstSeenAt),
          lastSeenAt: String(value.lastSeenAt),
          ...(value.baseline === true ? { baseline: true } : {}),
        });
      }
      this.hadBaseline = this.seen.size > 0;
    } catch {
      // 스냅샷 손상은 기준선 재수집으로 회복 — 추적 실패가 발굴을 막으면 안 된다.
    }
  }

  private saveSnapshot(): void {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const payload = {
        version: 1,
        savedAt: this.now().toISOString(),
        seen: Object.fromEntries(this.seen.entries()),
      };
      const tmpFile = `${this.file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.file);
    } catch {
      // 저장 실패는 다음 사이클에 재기록 — 치명적이지 않다.
    }
  }
}
