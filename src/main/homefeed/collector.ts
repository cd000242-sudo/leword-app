/**
 * 홈판 신호 수집 한 회차 — 스냅샷(A) · 원천 상태(B) · 처음 본 시각 장부(C)를 쌓는다.
 *
 * 워커 크론은 돌지 않고(실측) KV 는 최신 한 벌만 덮으며, 깃허브 예약은 몇 시간씩 밀린다. 10분 이력을 믿고 쌓을 곳은 이 PC 앱뿐이다.
 * 새 크롤러를 만들지 않는다 — 이미 있는 원천(Signal.bz · 인기 목록 · 네이버 뉴스 검색 · 블로그 문서수 · 사이트 이슈 보드 · og:image)을 그대로 부른다.
 *
 * 원천 하나가 죽어도 회차는 산다: 그 원천만 오류로 적고 값은 null(추정 금지). 네이버 키가 없으면 뉴스 · 문서수는 '건너뜀'.
 * 원천은 deps 로 주입한다 — 테스트는 네트워크 없이 조립만 본다.
 */
import {
  HOMEFEED_COLLECTOR_VERSION,
  HOMEFEED_RANK_SOURCES,
  HOMEFEED_SCHEMA,
  type HomefeedIssueSnapshot,
  type HomefeedRankSource,
  type HomefeedSample,
  type HomefeedSnapshot,
  type HomefeedSourceName,
  type HomefeedSourceRun,
  type HomefeedSourcesLedger,
} from '../../utils/homefeed/types';
import type { HomefeedSettings } from '../../utils/homefeed/settings';
import { classifyHomefeedCategory } from '../../utils/homefeed/category';
import { recordSnapshotInLedger, resolveIssueKey } from '../../utils/homefeed/ledger';
import { compactKey, isRelevantSample, sameIssueKeyword } from '../../utils/homefeed/text';
import type { HomefeedStore } from './store';

export interface RankedKeyword {
  rank: number;
  keyword: string;
}

export interface HomefeedNewsResult {
  total: number | null;
  items: Array<{ title: string; url: string; press: string | null; publishedAt: string | null }>;
}

export interface HomefeedBoardIssue {
  issue: string;
  why: string | null;
  headlines: Array<{ title: string; press: string | null; publishedAt: string | null; link: string }>;
}

export interface HomefeedCollectorDeps {
  fetchSignalBz(limit: number): Promise<RankedKeyword[]>;
  fetchHotLanes(): Promise<Partial<Record<'nate' | 'google' | 'daum', RankedKeyword[]>>>;
  hasNaverKeys(): boolean;
  fetchNews(keyword: string, display: number): Promise<HomefeedNewsResult>;
  fetchBlogDocCount(keyword: string): Promise<number | null>;
  fetchIssueBoard(): Promise<{ publishedAt: string | null; issues: HomefeedBoardIssue[] } | null>;
  resolveOgImage(url: string): Promise<string | null>;
  flushOgCache?(): void;
  now(): number;
  log?(message: string): void;
}

export interface HomefeedCollectionResult {
  snapshot: HomefeedSnapshot;
  newIssueKeys: string[];
  prunedSnapshots: number;
  ogFetched: number;
  /** 검색어와 어절이 겹치지 않아 버린 기사 수(뉴스 검색이 느슨하게 걸어 준 다른 이슈 기사). */
  droppedSamples: number;
}

const BOARD_MAX_AGE_MS = 24 * 3_600_000;

function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').slice(0, 160);
}

interface Tally { attempted: number; ok: number; firstError: string | null }
const tally = (): Tally => ({ attempted: 0, ok: 0, firstError: null });

function tallyRun(name: HomefeedSourceName, t: Tally, skipped: boolean): HomefeedSourceRun {
  if (skipped) return { name, ok: false, count: 0, error: null, skipped: true };
  return { name, ok: t.attempted > 0 && t.ok > 0, count: t.ok, error: t.ok === t.attempted ? null : t.firstError };
}

function rankIn(list: readonly RankedKeyword[], keyword: string): number | null {
  const hit = list.find((item) => sameIssueKeyword(item.keyword, keyword));
  return hit ? hit.rank : null;
}

function mergeSamples(news: HomefeedSample[], board: HomefeedSample[], max: number): HomefeedSample[] {
  const seen = new Set<string>();
  const out: HomefeedSample[] = [];
  for (const sample of [...news, ...board]) {
    const key = sample.url || compactKey(sample.title);
    const titleKey = compactKey(sample.title);
    if (!key || seen.has(key) || seen.has(titleKey)) continue;
    seen.add(key);
    seen.add(titleKey);
    out.push(sample);
    if (out.length >= max) break;
  }
  return out;
}

export function nextSourcesLedger(ledger: HomefeedSourcesLedger, runs: readonly HomefeedSourceRun[], capturedAt: string): HomefeedSourcesLedger {
  const sources = { ...ledger.sources };
  for (const run of runs) {
    const prev = sources[run.name];
    sources[run.name] = {
      name: run.name,
      lastSuccessAt: run.ok ? capturedAt : prev?.lastSuccessAt ?? null,
      lastErrorAt: !run.ok && !run.skipped ? capturedAt : prev?.lastErrorAt ?? null,
      lastError: !run.ok && !run.skipped ? run.error : prev?.lastError ?? null,
      consecutiveFailures: run.ok || run.skipped ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
      lastCount: run.count,
      skipped: Boolean(run.skipped),
    };
  }
  return { schemaVersion: HOMEFEED_SCHEMA.sources, updatedAt: capturedAt, sources };
}

export async function collectHomefeedSnapshot(
  store: HomefeedStore,
  settings: HomefeedSettings,
  deps: HomefeedCollectorDeps,
  options: { signal?: AbortSignal } = {},
): Promise<HomefeedCollectionResult> {
  const log = deps.log ?? (() => {});
  const capturedAt = new Date(deps.now()).toISOString();
  const nowMs = Date.parse(capturedAt);
  const runs: HomefeedSourceRun[] = [];
  const lists: Partial<Record<HomefeedRankSource, RankedKeyword[]>> = {};

  if (settings.sources.signalBz) {
    try {
      const list = await deps.fetchSignalBz(Math.max(settings.issueLimit, 10));
      if (list.length === 0) throw new Error('Signal.bz 목록이 비었습니다');
      lists['signal.bz'] = list;
      runs.push({ name: 'signal.bz', ok: true, count: list.length, error: null });
    } catch (error) {
      runs.push({ name: 'signal.bz', ok: false, count: 0, error: errorText(error) });
    }
  } else {
    runs.push({ name: 'signal.bz', ok: false, count: 0, error: null, skipped: true });
  }

  if (settings.sources.hotLanes) {
    let hot: Awaited<ReturnType<HomefeedCollectorDeps['fetchHotLanes']>> | null = null;
    let hotError: string | null = null;
    try { hot = await deps.fetchHotLanes(); } catch (error) { hotError = errorText(error); }
    for (const lane of ['nate', 'google', 'daum'] as const) {
      const list = hot?.[lane];
      if (list && list.length > 0) {
        lists[lane] = list;
        runs.push({ name: lane, ok: true, count: list.length, error: null });
      } else {
        runs.push({ name: lane, ok: false, count: 0, error: hotError ?? '목록이 비었습니다' });
      }
    }
  } else {
    for (const lane of ['nate', 'google', 'daum'] as const) runs.push({ name: lane, ok: false, count: 0, error: null, skipped: true });
  }

  // 이슈 목록은 네이버 실시간(Signal.bz)이 먼저다. 그게 죽었을 때만 다른 목록으로 회차를 잇는다.
  const issueSource = HOMEFEED_RANK_SOURCES.find((name) => (lists[name]?.length ?? 0) > 0) ?? null;
  const keywords = issueSource ? (lists[issueSource] as RankedKeyword[]).slice(0, settings.issueLimit) : [];

  let board: { publishedAt: string | null; issues: HomefeedBoardIssue[] } | null = null;
  if (settings.sources.siteBoard) {
    try {
      const received = await deps.fetchIssueBoard();
      const age = received?.publishedAt ? nowMs - Date.parse(received.publishedAt) : Infinity;
      board = received && age <= BOARD_MAX_AGE_MS ? received : null;
      runs.push({ name: 'site-issue-board', ok: Boolean(received), count: board?.issues.length ?? 0, error: received ? (board ? null : '발행본이 24시간보다 오래됐습니다') : '보드를 받지 못했습니다' });
    } catch (error) {
      runs.push({ name: 'site-issue-board', ok: false, count: 0, error: errorText(error) });
    }
  } else {
    runs.push({ name: 'site-issue-board', ok: false, count: 0, error: null, skipped: true });
  }

  const naverReady = deps.hasNaverKeys();
  const newsSkipped = !settings.sources.naverNews || !naverReady;
  const blogSkipped = !settings.sources.naverBlog || !naverReady;
  const ogSkipped = !settings.sources.ogImage || settings.ogImagesPerIssue === 0;
  const news = tally();
  const blog = tally();
  const og = tally();

  const state = store.readSignalState();
  const taken = new Set<string>();
  const issues: HomefeedIssueSnapshot[] = [];
  let droppedSamples = 0;

  for (const item of keywords) {
    if (options.signal?.aborted) break;
    const issueKey = resolveIssueKey(item.keyword, state, nowMs, taken);
    if (!issueKey) continue;
    taken.add(issueKey);

    const ranks: HomefeedIssueSnapshot['ranks'] = {};
    for (const name of HOMEFEED_RANK_SOURCES) {
      const list = lists[name];
      if (list) ranks[name] = name === issueSource ? item.rank : rankIn(list, item.keyword);
    }

    let newsTotal: number | null = null;
    let newsSamples: HomefeedSample[] = [];
    if (!newsSkipped) {
      news.attempted += 1;
      try {
        const result = await deps.fetchNews(item.keyword, settings.newsSampleSize);
        newsTotal = result.total;
        // 검색어와 어절이 겹치지 않는 기사는 버린다 — 다른 이슈 기사가 각도 · 재미 근거로 새는 걸 막는다.
        const kept = result.items.filter((row) => isRelevantSample(item.keyword, row.title));
        droppedSamples += result.items.length - kept.length;
        newsSamples = kept.map((row) => ({ ...row, image: null, origin: 'naver-news' as const }));
        news.ok += 1;
      } catch (error) {
        news.firstError = news.firstError ?? errorText(error);
      }
    }

    let blogDocCount: number | null = null;
    if (!blogSkipped) {
      blog.attempted += 1;
      try {
        blogDocCount = await deps.fetchBlogDocCount(item.keyword);
        if (blogDocCount === null) throw new Error('문서수를 받지 못했습니다');
        blog.ok += 1;
      } catch (error) {
        blog.firstError = blog.firstError ?? errorText(error);
      }
    }

    const boardIssue = board?.issues.find((row) => sameIssueKeyword(row.issue, item.keyword)) ?? null;
    const boardSamples: HomefeedSample[] = (boardIssue?.headlines ?? [])
      .filter((row) => row.title && row.link && isRelevantSample(item.keyword, row.title))
      .map((row) => ({ title: row.title, url: row.link, press: row.press, publishedAt: row.publishedAt, image: null, origin: 'site-issue-board' as const }));
    const samples = mergeSamples(newsSamples, boardSamples, settings.newsSampleSize + 4);

    if (!ogSkipped) {
      for (const sample of samples.slice(0, settings.ogImagesPerIssue)) {
        if (options.signal?.aborted) break;
        og.attempted += 1;
        const image = await deps.resolveOgImage(sample.url).catch(() => null);
        if (image) { sample.image = image; og.ok += 1; } else { og.firstError = og.firstError ?? '대표이미지 없음'; }
      }
    }

    issues.push({
      issueKey,
      keyword: item.keyword,
      category: classifyHomefeedCategory(item.keyword, samples.map((sample) => sample.title)),
      ranks,
      newsTotal,
      blogDocCount,
      samples,
      boardWhy: boardIssue?.why ?? null,
    });
  }

  runs.push(tallyRun('naver-news', news, newsSkipped));
  runs.push(tallyRun('naver-blog', blog, blogSkipped));
  runs.push({ ...tallyRun('og-image', og, ogSkipped), ...(og.attempted > 0 ? { ok: true } : {}) });

  const snapshot: HomefeedSnapshot = {
    schemaVersion: HOMEFEED_SCHEMA.snapshot,
    capturedAt,
    collectorVersion: HOMEFEED_COLLECTOR_VERSION,
    intervalMinutes: settings.snapshotIntervalMinutes,
    sources: runs,
    issues,
  };

  const previous = store.listSnapshots(nowMs - 6 * 3_600_000).filter((row) => Date.parse(row.capturedAt) < nowMs).pop() ?? null;
  const maxGapMs = (settings.snapshotIntervalMinutes * 2 + 5) * 60_000;
  const nextState = recordSnapshotInLedger(state, snapshot, previous?.capturedAt ?? null, maxGapMs, settings.retentionDays);
  const newIssueKeys = issues.map((issue) => issue.issueKey).filter((key) => !state.entries[key]);

  store.appendSnapshot(snapshot);
  store.writeSignalState(nextState);
  store.writeSources(nextSourcesLedger(store.readSources(), runs, capturedAt));
  try { deps.flushOgCache?.(); } catch { /* 캐시 저장 실패는 회차를 죽이지 않는다 */ }
  const prunedSnapshots = store.pruneSnapshots(settings.retentionDays, nowMs);

  log(`[HOMEFEED] 스냅샷 ${capturedAt} — 이슈 ${issues.length} · 새 이슈 ${newIssueKeys.length} · 버린 기사 ${droppedSamples} · 원천 ${runs.filter((run) => run.ok).length}/${runs.filter((run) => !run.skipped).length}`);
  return { snapshot, newIssueKeys, prunedSnapshots, ogFetched: og.attempted, droppedSamples };
}
