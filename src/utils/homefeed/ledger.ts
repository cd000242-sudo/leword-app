/**
 * 처음 본 시각 장부(C) — 이슈 키 정하기 · 등장 기록.
 *
 * 원천마다 같은 이슈를 조금씩 다르게 적고, 같은 원천도 회차마다 표기가 바뀐다("이란 유조선" → "이란 유조선 3척 타격").
 * 최근 6시간 안에 본 이슈와 같은 말이면 그 키를 이어 쓴다 — 표기가 바뀔 때마다 '새 이슈'로 나이가 0 이 되지 않게.
 *
 * 나이의 한계를 숨기지 않는다: 장부가 비어 있던 첫 회차, 또는 앞 회차와 사이가 벌어진 회차(앱이 꺼져 있던 구간)에
 * 처음 보인 이슈는 그 전에 이미 떠 있었을 수 있다 → firstSeenCensored = true, 화면은 "기록 이후 N분 이상".
 */
import { HOMEFEED_SCHEMA, type HomefeedSignalState, type HomefeedSignalStateEntry, type HomefeedSnapshot } from './types';
import { compactKey, sameIssueKeyword } from './text';

const REUSE_WINDOW_MS = 6 * 3_600_000;

/** 검색어의 이슈 키. taken 은 이번 회차에 이미 쓴 키(두 이슈가 한 키로 뭉치지 않게). */
export function resolveIssueKey(
  keyword: string,
  state: HomefeedSignalState,
  nowMs: number,
  taken: ReadonlySet<string>,
): string | null {
  const own = compactKey(keyword);
  if (!own) return null;
  if (state.entries[own]) return taken.has(own) ? null : own;
  const recent = Object.values(state.entries)
    .filter((entry) => nowMs - Date.parse(entry.lastSeenAt) <= REUSE_WINDOW_MS && !taken.has(entry.issueKey))
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  const match = recent.find((entry) => sameIssueKeyword(entry.keyword, keyword));
  if (match) return match.issueKey;
  return taken.has(own) ? null : own;
}

/**
 * 스냅샷 한 장을 장부에 적는다(새 객체를 돌려준다).
 * previousCapturedAt: 이 스냅샷 바로 앞 회차 시각(없으면 null). maxGapMs 보다 벌어졌으면 새로 보인 이슈도 검열(censored)로 둔다.
 */
export function recordSnapshotInLedger(
  state: HomefeedSignalState,
  snapshot: HomefeedSnapshot,
  previousCapturedAt: string | null,
  maxGapMs: number,
  retentionDays: number,
): HomefeedSignalState {
  const nowMs = Date.parse(snapshot.capturedAt);
  const ledgerEmpty = Object.keys(state.entries).length === 0;
  const gapMs = previousCapturedAt ? nowMs - Date.parse(previousCapturedAt) : null;
  const gapCensored = ledgerEmpty || gapMs === null || gapMs > maxGapMs;
  const entries: Record<string, HomefeedSignalStateEntry> = {};
  const cutoff = nowMs - Math.max(1, retentionDays) * 86_400_000;

  for (const [key, entry] of Object.entries(state.entries)) {
    if (Date.parse(entry.lastSeenAt) >= cutoff) entries[key] = { ...entry };
  }
  for (const issue of snapshot.issues) {
    const existing = entries[issue.issueKey];
    entries[issue.issueKey] = existing
      ? { ...existing, keyword: issue.keyword, lastSeenAt: snapshot.capturedAt, appearances: existing.appearances + 1 }
      : {
        issueKey: issue.issueKey,
        keyword: issue.keyword,
        firstSeenAt: snapshot.capturedAt,
        lastSeenAt: snapshot.capturedAt,
        firstSeenCensored: gapCensored,
        appearances: 1,
      };
  }
  return { schemaVersion: HOMEFEED_SCHEMA.signalState, updatedAt: snapshot.capturedAt, entries };
}
