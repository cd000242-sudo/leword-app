/**
 * 숏텐츠 한 회차(2026-10-29) — 받기 → 해석 → 기록 → 급상승 계산 → 문서수 → 공개본 → 발행.
 * 전부 주입받는 순수 오케스트레이션이라 electron 없이 시험한다. 던지지 않는다 — 실패는 결과로 돌려준다.
 */
import { parseShortentsHtml, type ShortentsWindow } from './parse';
import { appendWindow, computeRising } from './rising';
import { measureTopicDocs, type DocCache } from './docs';
import { buildShortentsPublicPayload, type ShortentsPublicPayload } from './public-file';

export interface ShortentsState {
  windows: ShortentsWindow[];
  docCache: DocCache;
  /** 마지막으로 발행(또는 건너뜀 확정)을 끝낸 창의 publishTime. */
  publishedFor: string | null;
}

export const emptyShortentsState = (): ShortentsState => ({ windows: [], docCache: {}, publishedFor: null });

export interface ShortentsCycleDeps {
  fetchHtml: () => Promise<string>;
  readState: () => ShortentsState;
  writeState: (state: ShortentsState) => void;
  count: (keyword: string) => Promise<number | null>;
  publish: (payload: ShortentsPublicPayload | null) => Promise<{ status: string; reason: string }>;
  now?: () => number;
}

export interface ShortentsCycleResult {
  status: 'collected' | 'skipped' | 'failed';
  reason: string;
  publishTime?: string;
  publication?: { status: string; reason: string };
}

export async function runShortentsCycle(deps: ShortentsCycleDeps): Promise<ShortentsCycleResult> {
  try {
    const now = (deps.now || Date.now)();
    let window: ShortentsWindow | null;
    try {
      window = parseShortentsHtml(await deps.fetchHtml());
    } catch (error) {
      return { status: 'failed', reason: `fetch_failed:${String((error as Error)?.message || error).slice(0, 80)}` };
    }
    if (!window) return { status: 'failed', reason: 'parse_failed' };

    const state = deps.readState();
    const have = state.windows.some((w) => w.publishTime === window!.publishTime);
    if (have && state.publishedFor === window.publishTime) return { status: 'skipped', reason: 'already_collected', publishTime: window.publishTime };

    const windows = have ? state.windows : appendWindow(state.windows, window);
    const topics = computeRising(windows);
    const measured = await measureTopicDocs(topics, state.docCache, now, deps.count);
    const payload = buildShortentsPublicPayload(windows, measured.topics, new Date(now).toISOString());
    // 기록은 발행 결과와 상관없이 먼저 남긴다 — 발행이 실패해도 다음 창의 변동 계산은 이어져야 한다.
    deps.writeState({ windows, docCache: measured.cache, publishedFor: state.publishedFor });
    const publication = await deps.publish(payload);
    if (publication.status !== 'failed') {
      deps.writeState({ windows, docCache: measured.cache, publishedFor: window.publishTime });
    }
    return { status: 'collected', reason: 'ok', publishTime: window.publishTime, publication };
  } catch (error) {
    return { status: 'failed', reason: `cycle_failed:${String((error as Error)?.message || error).slice(0, 80)}` };
  }
}
