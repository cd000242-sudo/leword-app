/**
 * 스토리 후보 조립 — 스냅샷 이력 한 벌 → 신호 → 6요소 → 게이트 → 이미지 · 썸네일 계획 → 창 · 상태.
 *
 * 전부 규칙이다. 목록을 그릴 때 AI · 이미지 API 를 부르지 않는다(명령서 비용 통제) — AI 는 사용자가 누른 요청에서만.
 * 시각의 기준은 벽시계가 아니라 최신 스냅샷 시각이다: 같은 이력이면 언제 계산해도 같은 답이 나온다.
 */
import { HOMEFEED_SCHEMA, type HomefeedIssueSnapshot, type HomefeedSignalState, type HomefeedSnapshot, type HomefeedStoriesFile, type HomefeedStory } from './types';
import type { HomefeedSettings } from './settings';
import { anglesOf, clusterSamples, revealLayersOf } from './clusters';
import { computeSignals, findIssue } from './signals';
import { anchorOf, detectTensions, firstCardOf, freshDeltaOf, funGapOf, noSearchOf, risksOf, tellabilityOf } from './story';
import { compareStories, decideStatus, decideWindow } from './status';
import { aiPromptPlans, decideVisualStrategy, realImageGuide, thumbnailPlanOf } from './visual';
import { shortHash, titleTokens } from './text';

const MINUTE = 60_000;

/** FRESH DELTA 비교 기준 — 30분 이상 앞선 회차 중 가장 최근, 없으면 가장 이른 앞선 회차. */
export function baselineFor(
  history: readonly HomefeedSnapshot[],
  latest: HomefeedSnapshot,
  issueKey: string,
): { capturedAt: string; issue: HomefeedIssueSnapshot } | null {
  const latestMs = Date.parse(latest.capturedAt);
  const earlier = history
    .filter((snapshot) => Date.parse(snapshot.capturedAt) < latestMs)
    .map((snapshot) => ({ capturedAt: snapshot.capturedAt, issue: findIssue(snapshot, issueKey) }))
    .filter((row): row is { capturedAt: string; issue: HomefeedIssueSnapshot } => row.issue !== null)
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  if (earlier.length === 0) return null;
  const old = earlier.filter((row) => Date.parse(row.capturedAt) <= latestMs - 30 * MINUTE);
  return old.length > 0 ? old[old.length - 1] : earlier[0];
}

export function buildStory(
  history: readonly HomefeedSnapshot[],
  latest: HomefeedSnapshot,
  issue: HomefeedIssueSnapshot,
  state: HomefeedSignalState,
  settings: HomefeedSettings,
  options: { hasGeneratedImage?: boolean } = {},
): HomefeedStory {
  const signals = computeSignals(history, latest, issue, state.entries[issue.issueKey] ?? null, settings);
  const anchorTokens = titleTokens(issue.keyword);
  const clusters = clusterSamples(issue.samples, anchorTokens, settings.cloneThreshold);
  const angles = anglesOf(issue.samples, clusters, anchorTokens);
  const payoffLayers = revealLayersOf(issue.samples, issue.keyword);
  const tensions = detectTensions(issue.samples);
  const { delta, reason: deltaReason } = freshDeltaOf(issue, baselineFor(history, latest, issue.issueKey));
  const anchor = anchorOf(issue.keyword, issue.category);
  const tellability = tellabilityOf(anchor, delta, tensions);
  const funGap = funGapOf(tensions, issue.samples, signals, tellability);
  const visual = decideVisualStrategy(issue.category, issue.samples, signals, payoffLayers);
  const noSearch = noSearchOf(anchor, tensions, funGap, payoffLayers, signals, settings);
  const firstCard = firstCardOf(anchor, delta, tensions, payoffLayers, issue.samples, visual);
  const realImages = realImageGuide(issue.samples, delta, angles.alternatives, issue.category);
  const aiPrompts = aiPromptPlans(anchor.text, issue.category, visual.strategy, payoffLayers, settings);
  const thumbnail = thumbnailPlanOf({
    category: issue.category,
    anchorText: anchor.text,
    strategy: visual.strategy,
    tensions,
    funGap,
    payoffLayers,
    delta,
    realImages,
    firstCard,
    hasGeneratedImage: options.hasGeneratedImage,
  }, settings);
  const risks = risksOf(issue.samples, signals, issue.category);
  const window = decideWindow({ signals, alternativeAngles: angles.alternatives, funGap }, settings);
  const status = decideStatus({
    signals, window, delta, deltaReason, alternativeAngles: angles.alternatives, funGap, payoffLayers, noSearch, tellability, firstCard, risks,
  }, settings);

  return {
    id: `${issue.issueKey}:${shortHash(delta?.text ?? 'none', 8)}`,
    issueKey: issue.issueKey,
    keyword: issue.keyword,
    category: issue.category,
    capturedAt: latest.capturedAt,
    evidenceHash: shortHash({ urls: issue.samples.map((sample) => sample.url), delta: delta?.text ?? null, tensions: tensions.map((tension) => tension.type).sort() }),
    signals,
    anchor,
    delta,
    deltaReason,
    tensions,
    dominantAngle: angles.dominant,
    alternativeAngles: angles.alternatives,
    angleConfidence: angles.confidence,
    funGap,
    payoffLayers,
    noSearch,
    tellability,
    firstCard,
    visual,
    realImages,
    aiPrompts,
    thumbnail,
    window,
    status,
    risks,
    boardWhy: issue.boardWhy,
    evidence: issue.samples.map((sample) => ({
      title: sample.title, url: sample.url, press: sample.press, publishedAt: sample.publishedAt, image: sample.image, origin: sample.origin,
    })),
  };
}

export function buildStories(input: {
  history: readonly HomefeedSnapshot[];
  state: HomefeedSignalState;
  settings: HomefeedSettings;
  computedAt: string;
  hasGeneratedImage?: (issueKey: string) => boolean;
}): HomefeedStoriesFile {
  const history = [...input.history].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const latest = history[history.length - 1] ?? null;
  if (!latest) {
    return { schemaVersion: HOMEFEED_SCHEMA.stories, computedAt: input.computedAt, snapshotAt: null, snapshotCount: 0, stories: [] };
  }
  const stories = latest.issues
    .map((issue) => buildStory(history, latest, issue, input.state, input.settings, { hasGeneratedImage: input.hasGeneratedImage?.(issue.issueKey) }))
    .sort(compareStories);
  return { schemaVersion: HOMEFEED_SCHEMA.stories, computedAt: input.computedAt, snapshotAt: latest.capturedAt, snapshotCount: history.length, stories };
}
