/**
 * 신호 계산 — 이력 스냅샷에서 나이 · 원천 확산 · 순위 변화 · 문서 증가 · 가속 · 지속성 · 포화 · 이미지 후보 수.
 *
 * 전부 null 전파다: 비교할 두 시점 중 하나라도 못 쟀으면 결과는 null(화면 '미측정'). 0 으로 채우지 않는다.
 * 과거 시점은 "목표 시각에 가장 가까운 앞선 회차"를 쓰되 허용 오차(수집 주기와 5분 중 큰 값) 안에 있어야 한다 — 주기를 가정하지 않는다.
 */
import { HOMEFEED_RANK_SOURCES, type HomefeedIssueSnapshot, type HomefeedRankSource, type HomefeedSignalStateEntry, type HomefeedSignals, type HomefeedSnapshot } from './types';
import type { HomefeedSettings } from './settings';
import { clusterSamples, saturationOf } from './clusters';
import { titleTokens } from './text';

const MINUTE = 60_000;

export function findIssue(snapshot: HomefeedSnapshot | null, issueKey: string): HomefeedIssueSnapshot | null {
  return snapshot?.issues.find((issue) => issue.issueKey === issueKey) ?? null;
}

/** 목표 시각에 가장 가까운 회차(beforeMs 보다 앞선 것만, 허용 오차 안). */
export function snapshotNear(history: readonly HomefeedSnapshot[], targetMs: number, toleranceMs: number, beforeMs: number): HomefeedSnapshot | null {
  let best: HomefeedSnapshot | null = null;
  let bestGap = Infinity;
  for (const snapshot of history) {
    const at = Date.parse(snapshot.capturedAt);
    if (!(at < beforeMs)) continue;
    const gap = Math.abs(at - targetMs);
    if (gap <= toleranceMs && gap < bestGap) {
      best = snapshot;
      bestGap = gap;
    }
  }
  return best;
}

function rankListOk(snapshot: HomefeedSnapshot): boolean {
  return snapshot.sources.some((run) => run.ok && (HOMEFEED_RANK_SOURCES as readonly string[]).includes(run.name));
}

function sourceNamesOf(issue: HomefeedIssueSnapshot): HomefeedRankSource[] {
  return HOMEFEED_RANK_SOURCES.filter((name) => typeof issue.ranks[name] === 'number');
}

function sourceCountOf(issue: HomefeedIssueSnapshot | null): number | null {
  if (!issue || Object.keys(issue.ranks).length === 0) return null;
  return sourceNamesOf(issue).length;
}

function rankOf(issue: HomefeedIssueSnapshot | null, source: HomefeedRankSource | null): number | null {
  if (!issue || !source) return null;
  const value = issue.ranks[source];
  return typeof value === 'number' ? value : null;
}

function diff(now: number | null, past: number | null): number | null {
  return now === null || past === null ? null : now - past;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function imageKey(url: string): string {
  return String(url).replace(/[?#].*$/, '').toLowerCase();
}

function cloneRatioOf(issue: HomefeedIssueSnapshot | null, threshold: number): number | null {
  if (!issue || issue.samples.length === 0) return null;
  return saturationOf(clusterSamples(issue.samples, titleTokens(issue.keyword), threshold), issue.samples.length).cloneRatio;
}

export function computeSignals(
  history: readonly HomefeedSnapshot[],
  latest: HomefeedSnapshot,
  issue: HomefeedIssueSnapshot,
  ledgerEntry: HomefeedSignalStateEntry | null,
  settings: HomefeedSettings,
): HomefeedSignals {
  const nowMs = Date.parse(latest.capturedAt);
  const tolerance = Math.max(settings.snapshotIntervalMinutes, 5) * MINUTE;
  const at = (minutesAgo: number) => findIssue(snapshotNear(history, nowMs - minutesAgo * MINUTE, tolerance, nowMs), issue.issueKey);
  const past10 = at(10);
  const past30 = at(30);
  const past60 = at(60);

  const sourceNames = sourceNamesOf(issue);
  const rankSource: HomefeedRankSource | null = typeof issue.ranks['signal.bz'] === 'number'
    ? 'signal.bz'
    : sourceNames.slice().sort((a, b) => (issue.ranks[a] as number) - (issue.ranks[b] as number))[0] ?? null;
  const rankNow = rankOf(issue, rankSource);

  const docNow = issue.blogDocCount;
  const docDelta30m = diff(docNow, past30?.blogDocCount ?? null);
  const docDelta60m = diff(docNow, past60?.blogDocCount ?? null);
  const docAcceleration = docDelta30m !== null && docDelta60m !== null ? docDelta30m - (docDelta60m - docDelta30m) : null;

  let persistenceStreak = 0;
  for (const snapshot of [...history].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))) {
    if (Date.parse(snapshot.capturedAt) > nowMs) continue;
    if (!rankListOk(snapshot)) continue;
    if (!findIssue(snapshot, issue.issueKey)) break;
    persistenceStreak += 1;
  }
  const window60 = history.filter((snapshot) => {
    const t = Date.parse(snapshot.capturedAt);
    return t <= nowMs && t >= nowMs - 60 * MINUTE && rankListOk(snapshot);
  });

  const saturation = saturationOf(clusterSamples(issue.samples, titleTokens(issue.keyword), settings.cloneThreshold), issue.samples.length);
  const firstSeenMs = ledgerEntry ? Date.parse(ledgerEntry.firstSeenAt) : NaN;

  return {
    ageMinutes: Number.isFinite(firstSeenMs) ? Math.max(0, Math.floor((nowMs - firstSeenMs) / MINUTE)) : null,
    firstSeenAt: ledgerEntry?.firstSeenAt ?? null,
    firstSeenCensored: ledgerEntry?.firstSeenCensored ?? true,
    sourceCountNow: sourceCountOf(issue),
    sourceNames,
    sourceDelta30m: diff(sourceCountOf(issue), sourceCountOf(past30)),
    sourceDelta60m: diff(sourceCountOf(issue), sourceCountOf(past60)),
    pressCountNow: new Set(issue.samples.map((sample) => sample.press).filter(Boolean)).size,
    rankNow,
    rankSource,
    rankDelta30m: diff(rankNow, rankOf(past30, rankSource)),
    rankDelta60m: diff(rankNow, rankOf(past60, rankSource)),
    newsTotalNow: issue.newsTotal,
    newsDelta30m: diff(issue.newsTotal, past30?.newsTotal ?? null),
    blogDocNow: docNow,
    docDelta10m: diff(docNow, past10?.blogDocCount ?? null),
    docDelta30m,
    docDelta60m,
    docVelocity30m: round(docDelta30m === null ? null : docDelta30m / 30),
    docAcceleration,
    persistenceStreak,
    presence60m: { seen: window60.filter((snapshot) => findIssue(snapshot, issue.issueKey)).length, total: window60.length },
    sampleN: saturation.sampleN,
    cloneN: saturation.cloneN,
    cloneRatio: saturation.cloneRatio,
    cloneRatioPrev30m: cloneRatioOf(past30, settings.cloneThreshold),
    visualCandidateCount: new Set(issue.samples.map((sample) => sample.image).filter((url): url is string => Boolean(url)).map(imageKey)).size,
  };
}
