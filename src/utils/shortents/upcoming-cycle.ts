/**
 * 곧 뜰 숏텐츠 후보 한 회차(2026-10-30) — 장부 적중 확인 → 후보 받기 → 뉴스 실측 → 선별 → 장부 기록 → 공개본 → 발행.
 * 전부 주입받는 순수 오케스트레이션이라 electron 없이 시험한다. 던지지 않는다 — 실패는 결과로 돌려준다.
 */
import type { ShortentsWindow } from './parse';
import { isInShortents, measureCandidate, selectUpcoming, type NewsSample, type UpcomingCandidate } from './upcoming';
import { markHits, pruneLedger, recordFlags, summarizeHits, type LedgerEntry } from './upcoming-ledger';
import { buildUpcomingPublicPayload, type UpcomingPublicPayload } from './upcoming-public';

export const NEWS_CONCURRENCY = 4;

export interface UpcomingState {
  ledger: LedgerEntry[];
}

export const emptyUpcomingState = (): UpcomingState => ({ ledger: [] });

export interface UpcomingCycleDeps {
  fetchCandidates: () => Promise<Array<{ keyword: string; sources: string[] }>>;
  fetchNews: (keyword: string) => Promise<NewsSample[]>;
  latestWindow: () => ShortentsWindow | null;
  readState: () => UpcomingState;
  writeState: (state: UpcomingState) => void;
  publish: (payload: UpcomingPublicPayload | null) => Promise<{ status: string; reason: string }>;
  now?: () => number;
}

export interface UpcomingCycleResult {
  status: 'collected' | 'failed';
  reason: string;
  measured?: number;
  candidates?: number;
  publication?: { status: string; reason: string };
}

async function measureAll(
  list: ReadonlyArray<{ keyword: string; sources: string[] }>,
  fetchNews: UpcomingCycleDeps['fetchNews'],
  nowMs: number,
): Promise<UpcomingCandidate[]> {
  const out: UpcomingCandidate[] = [];
  for (let i = 0; i < list.length; i += NEWS_CONCURRENCY) {
    const settled = await Promise.allSettled(list.slice(i, i + NEWS_CONCURRENCY)
      .map(async (c) => measureCandidate(c.keyword, c.sources, await fetchNews(c.keyword), nowMs)));
    for (const s of settled) if (s.status === 'fulfilled') out.push(s.value);
  }
  return out;
}

export async function runUpcomingCycle(deps: UpcomingCycleDeps): Promise<UpcomingCycleResult> {
  try {
    const nowMs = (deps.now || Date.now)();
    const nowIso = new Date(nowMs).toISOString();
    let list: Array<{ keyword: string; sources: string[] }>;
    try {
      list = await deps.fetchCandidates();
    } catch (error) {
      return { status: 'failed', reason: `candidates_failed:${String((error as Error)?.message || error).slice(0, 80)}` };
    }

    const window = deps.latestWindow();
    // 이미 숏텐츠에 뜬 말은 '곧 뜰' 후보가 아니다 — 뉴스 검색 횟수도 아낀다.
    const fresh = list.filter((c) => !isInShortents(c.keyword, window));
    const measured = await measureAll(fresh, deps.fetchNews, nowMs);
    const selected = selectUpcoming(measured, window);

    const before = deps.readState().ledger;
    const checked = window ? markHits(before, window) : before;
    const ledger = pruneLedger(recordFlags(checked, selected.map((c) => c.keyword), nowIso), nowMs);
    deps.writeState({ ledger });

    const payload = buildUpcomingPublicPayload(selected, measured.length, summarizeHits(ledger, nowMs), nowIso);
    const publication = await deps.publish(payload);
    return { status: 'collected', reason: 'ok', measured: measured.length, candidates: selected.length, publication };
  } catch (error) {
    return { status: 'failed', reason: `cycle_failed:${String((error as Error)?.message || error).slice(0, 80)}` };
  }
}
