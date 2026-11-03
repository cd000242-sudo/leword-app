import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHomefeedStore, type HomefeedStore } from '../../main/homefeed/store';
import { collectHomefeedSnapshot, type HomefeedCollectorDeps } from '../../main/homefeed/collector';
import { recomputeHomefeedStories } from '../../main/homefeed/engine';
import { createHomefeedService, speedScoreboardOf } from '../../main/homefeed/service';
import { recordSnapshotInLedger } from '../homefeed/ledger';
import { buildHomefeedPublicPayload } from '../homefeed/publish';
import { HOMEFEED_SCHEMA, type HomefeedSignalState, type HomefeedSnapshot } from '../homefeed/types';
import { at, issue, snapshot, settings } from './homefeed-fixtures';

/**
 * 홈판 속도 실측 배선(2026-11-02) — 수집 한 회차가 뉴스 막대 · 앞섬/늦음을 항목에 담아 저장하고,
 * 계산본 · 공개본이 그것을 "추가만" 실어 나른다. 옛 데이터(필드 없음)에서도 깨지지 않는다.
 * 네트워크 없음: 원천은 전부 고정 입력으로 주입한다.
 */
let dir = '';
let store: HomefeedStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-speed-'));
  store = createHomefeedStore(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const KEYWORD = '이란유조선';
const hangul = (index: number) => String.fromCharCode(0xAC00 + index);
const news = (keyword: string, minutes: number[]) => minutes.map((minute, index) => ({
  title: `${keyword} 소식 ${hangul(index)}`,
  url: `https://news.example.com/${encodeURIComponent(keyword)}/${index}`,
  press: 'news.example.com',
  publishedAt: at(minute),
}));

function fakeDeps(clockMinutes: number, overrides: Partial<HomefeedCollectorDeps> = {}): HomefeedCollectorDeps {
  return {
    fetchSignalBz: async () => [{ rank: 1, keyword: KEYWORD }],
    fetchHotLanes: async () => ({}),
    hasNaverKeys: () => true,
    fetchNews: async () => ({ total: 0, items: [] }),
    fetchBlogDocCount: async () => 100,
    fetchIssueBoard: async () => null,
    resolveOgImage: async () => null,
    now: () => Date.parse(at(clockMinutes)),
    ...overrides,
  };
}

const cfg = () => settings({ ogImagesPerIssue: 0 });
const only = (snap: HomefeedSnapshot, keyword: string) => snap.issues.find((row) => row.keyword === keyword)!;

describe('수집 회차 — 뉴스 막대와 앞섬/늦음 저장', () => {
  it('뉴스 검색은 100건까지 한 번에 요청하지만, 기존 표본(samples)은 설정한 개수만 그대로 둔다', async () => {
    const requested: number[] = [];
    const items = news(KEYWORD, Array.from({ length: 30 }, (_, index) => -index));
    const { snapshot: snap, droppedSamples } = await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, {
      fetchNews: async (_keyword, display) => { requested.push(display); return { total: 30, items }; },
    }));
    expect(requested).toEqual([100]);
    const row = only(snap, KEYWORD);
    expect(row.samples).toHaveLength(10);
    expect(row.samples.map((sample) => sample.title)).toEqual(items.slice(0, 10).map((item) => item.title));
    expect(droppedSamples).toBe(0);
    // 막대는 100건 표본 전체에서 센다(30건 모두 12시간 안).
    expect(row.newsBuckets).toMatchObject({ counted: 30, undated: 0, outOfRange: 0, bucketMinutes: 30, endAt: at(0) });
    expect(row.newsBuckets!.counts).toHaveLength(24);
  });

  it('막대는 이슈와 어절이 겹치는 기사만 센다 — 다른 이슈 기사는 세지 않는다', async () => {
    const mixed = [
      ...news(KEYWORD, [-5, -40]),
      { title: '손흥민 새 역사 기념식에도 붉은악마 떠나', url: 'https://news.example.com/other', press: 'n', publishedAt: at(-3) },
    ];
    const { snapshot: snap } = await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, { fetchNews: async () => ({ total: 3, items: mixed }) }));
    expect(only(snap, KEYWORD).newsBuckets!.counted).toBe(2);
  });

  it('앱을 처음 켠 회차는 검열이라 미측정, 오차 한계(수집 주기)를 같이 담는다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, { fetchNews: async () => ({ total: 2, items: news(KEYWORD, [-30, -20]) }) }));
    expect(only(snap, KEYWORD).lead).toMatchObject({ status: 'unmeasured', reason: 'censored', minutes: null, resolutionMinutes: 10 });
  });

  it('새로 뜬 이슈에 뉴스가 뒤늦게 나오면 앞섬 — 처음엔 기사가 없다가 6분 뒤 첫 기사', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0));
    const second = fakeDeps(20, {
      fetchSignalBz: async () => [{ rank: 1, keyword: '다른이슈' }, { rank: 2, keyword: KEYWORD }],
      fetchNews: async () => ({ total: 0, items: [] }),
    });
    const { snapshot: snap2 } = await collectHomefeedSnapshot(store, cfg(), second);
    expect(only(snap2, '다른이슈').lead).toMatchObject({ status: 'unmeasured', reason: 'no_news_sample' });
    expect(only(snap2, '다른이슈').newsBuckets).toMatchObject({ counted: 0 });

    const third = fakeDeps(30, {
      fetchSignalBz: async () => [{ rank: 1, keyword: '다른이슈' }],
      fetchNews: async (keyword) => ({ total: 2, items: news(keyword, [26, 28]) }),
    });
    const { snapshot: snap3 } = await collectHomefeedSnapshot(store, cfg(), third);
    expect(only(snap3, '다른이슈').lead).toEqual({
      status: 'ahead', minutes: 6, reason: null, resolutionMinutes: 10, firstSeenAt: at(20), firstNewsAt: at(26),
    });
  });

  it('우리가 처음 보기 전에 이미 기사가 있었으면 늦음', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0));
    const second = fakeDeps(10, {
      fetchSignalBz: async () => [{ rank: 1, keyword: '다른이슈' }],
      fetchNews: async (keyword) => ({ total: 2, items: news(keyword, [-5, 3]) }),
    });
    const { snapshot: snap } = await collectHomefeedSnapshot(store, cfg(), second);
    expect(only(snap, '다른이슈').lead).toMatchObject({ status: 'behind', minutes: 15, firstSeenAt: at(10), firstNewsAt: at(-5) });
  });

  it('뉴스 표본이 상한에 닿으면(검색 total > 100) 미측정 — 더 이른 기사가 표본 밖에 있을 수 있다', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0));
    const second = fakeDeps(10, {
      fetchSignalBz: async () => [{ rank: 1, keyword: '다른이슈' }],
      fetchNews: async (keyword) => ({ total: 5000, items: news(keyword, [3, 5]) }),
    });
    const { snapshot: snap } = await collectHomefeedSnapshot(store, cfg(), second);
    expect(only(snap, '다른이슈').lead).toMatchObject({ status: 'unmeasured', reason: 'sample_capped', minutes: null });
    // 막대는 받은 표본에서 센 실제 값이다(상한이어도 센 값은 숨기지 않는다).
    expect(only(snap, '다른이슈').newsBuckets).toMatchObject({ counted: 2 });
  });

  it('뉴스를 못 받은 회차는 막대를 null 로 두고 미측정이다 — 0 으로 채우지 않는다', async () => {
    const failed = await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, { fetchNews: async () => { throw new Error('뉴스 검색 429'); } }));
    expect(only(failed.snapshot, KEYWORD).newsBuckets).toBeNull();
    expect(only(failed.snapshot, KEYWORD).lead).toMatchObject({ status: 'unmeasured' });
    const skipped = await collectHomefeedSnapshot(store, cfg(), fakeDeps(10, { hasNaverKeys: () => false }));
    expect(only(skipped.snapshot, KEYWORD).newsBuckets).toBeNull();
  });

  it('저장된 스냅샷 · 장부에 새 필드가 실리고, 스키마 버전 문자열은 그대로라 옛 파일이 버려지지 않는다', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0));
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(10, { fetchNews: async (keyword) => ({ total: 1, items: news(keyword, [4]) }) }));
    const stored = store.listSnapshots();
    expect(stored).toHaveLength(2);
    expect(stored[1].schemaVersion).toBe(HOMEFEED_SCHEMA.snapshot);
    expect(stored[1].issues[0].newsBuckets!.counted).toBe(1);
    expect(stored[1].issues[0].lead).toBeTruthy();
    const entry = store.readSignalState().entries[KEYWORD];
    expect(entry.newsProbe).toEqual({ earliestAt: at(4), completeSeen: true, cappedSeen: false });
    expect(store.readSignalState().schemaVersion).toBe(HOMEFEED_SCHEMA.signalState);
    // 임시 파일(tmp→rename 원자적 저장)이 남지 않는다.
    const leftovers: string[] = [];
    const walk = (folder: string) => fs.readdirSync(folder, { withFileTypes: true }).forEach((item) => (item.isDirectory() ? walk(path.join(folder, item.name)) : item.name.endsWith('.tmp') && leftovers.push(item.name)));
    walk(dir);
    expect(leftovers).toEqual([]);
  });
});

describe('장부 — 뉴스 표본 기록 합치기', () => {
  const empty: HomefeedSignalState = { schemaVersion: HOMEFEED_SCHEMA.signalState, updatedAt: null, entries: {} };
  const gap = 25 * 60_000;

  it('관측을 넘기지 않으면 옛 동작 그대로다 — newsProbe 키가 생기지 않는다', () => {
    const state = recordSnapshotInLedger(empty, snapshot(at(0), [issue('이란 유조선')]), null, gap, 7);
    expect(state.entries['이란유조선']).not.toHaveProperty('newsProbe');
  });

  it('관측을 회차마다 합치고, 입력 장부는 바꾸지 않는다', () => {
    const snap1 = snapshot(at(0), [issue('이란 유조선')]);
    const first = recordSnapshotInLedger(empty, snap1, null, gap, 7, { 이란유조선: { earliestAt: at(25), capped: false } });
    const frozen = JSON.stringify(first);
    const second = recordSnapshotInLedger(first, snapshot(at(10), [issue('이란 유조선')]), snap1.capturedAt, gap, 7, { 이란유조선: { earliestAt: at(15), capped: false } });
    expect(JSON.stringify(first)).toBe(frozen);
    expect(second.entries['이란유조선'].newsProbe).toEqual({ earliestAt: at(15), completeSeen: true, cappedSeen: false });
    expect(second.entries['이란유조선']).toMatchObject({ firstSeenAt: at(0), appearances: 2 });
  });
});

describe('계산본 · 공개본 — 추가만, 옛 데이터 호환', () => {
  it('계산본이 최신 스냅샷의 막대 · 판정을 싣고, 필드가 없는 옛 스냅샷이면 null 이다', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, { fetchNews: async (keyword) => ({ total: 1, items: news(keyword, [-4]) }) }));
    const file = recomputeHomefeedStories(store, Date.parse(at(1)));
    expect(file.stories[0].newsBuckets).toMatchObject({ counted: 1 });
    expect(file.stories[0].lead).toMatchObject({ status: 'unmeasured', reason: 'censored' });

    const old = createHomefeedStore(fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-speed-old-')));
    try {
      old.appendSnapshot(snapshot(at(0), [issue('옛 이슈')]));
      const oldFile = recomputeHomefeedStories(old, Date.parse(at(1)));
      expect(oldFile.stories[0].newsBuckets).toBeNull();
      expect(oldFile.stories[0].lead).toBeNull();
    } finally {
      fs.rmSync(old.dir, { recursive: true, force: true });
    }
  });

  it('공개 요약은 newsBuckets · lead 를 그대로 싣고, 성적표는 검사를 통과한 것만 싣는다', () => {
    const lead = { status: 'ahead', minutes: 6, reason: null, resolutionMinutes: 10, firstSeenAt: at(20), firstNewsAt: at(26) };
    const buckets = { endAt: at(30), bucketMinutes: 30, counts: [0, 2], counted: 2, undated: 0, outOfRange: 0 };
    const board = { windowDays: 7, measuredDays: 2, ready: false, total: 3, ahead: 1, behind: 1, unmeasured: 1, unmeasuredReasons: { censored: 1 }, resolutionMinutes: 10, computedAt: at(30) };
    const bridge = { stories: [{ id: 'a', issueKey: 'a', keyword: 'a', lead, newsBuckets: buckets, 개인: 'x' }], speedScoreboard: board };
    const payload = buildHomefeedPublicPayload(bridge, null, { nowMs: Date.parse(at(31)) })!;
    expect(payload.stories[0]).toMatchObject({ lead, newsBuckets: buckets });
    expect(payload.stories[0]).not.toHaveProperty('개인');
    expect(payload.speedScoreboard).toEqual(board);
    expect(payload.schemaVersion).toBe('homefeed-public-v1');
  });

  it('성적표가 없거나 모양이 틀리면 null 이고, 구버전 앱(필드 없음)의 요약도 그대로 나간다', () => {
    const bridge = { stories: [{ id: 'a', issueKey: 'a', keyword: 'a' }] };
    expect(buildHomefeedPublicPayload(bridge, null, { nowMs: Date.parse(at(31)) })!.speedScoreboard).toBeNull();
    expect(buildHomefeedPublicPayload({ ...bridge, speedScoreboard: { ahead: 'many' } }, null, { nowMs: Date.parse(at(31)) })!.speedScoreboard).toBeNull();
    const payload = buildHomefeedPublicPayload(bridge, null, { nowMs: Date.parse(at(31)) })!;
    expect(payload.stories[0]).not.toHaveProperty('lead');
    expect(payload.stories[0]).not.toHaveProperty('newsBuckets');
  });

  it('브리지 목록(stories)도 막대 · 판정 · 성적표를 싣는다', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0, { fetchNews: async (keyword) => ({ total: 1, items: news(keyword, [-4]) }) }));
    recomputeHomefeedStories(store, Date.parse(at(1)));
    const service = createHomefeedService({
      store,
      runtime: () => ({ running: false, lastRunAt: null, lastError: null, lastDurationMs: null, nextRunAt: null }),
      runCycle: async () => ({ ok: true }),
      applySchedule: () => {},
      runAgent: async () => ({ reply: '', provider: 'codex' }),
      generateImage: async () => { throw new Error('호출하지 않는다'); },
      now: () => Date.parse(at(2)),
      newId: () => 'id000001',
    });
    const result = await service.stories() as { stories: Array<{ lead: unknown; newsBuckets: { counted: number } }>; speedScoreboard: { total: number; windowDays: number } };
    expect(result.stories[0].newsBuckets.counted).toBe(1);
    expect(result.stories[0].lead).toMatchObject({ status: 'unmeasured' });
    expect(result.speedScoreboard).toMatchObject({ windowDays: 7, total: 1, unmeasured: 1, ready: false });
  });

  it('speedScoreboardOf 는 저장된 장부와 설정의 수집 주기로 성적표를 만든다', async () => {
    await collectHomefeedSnapshot(store, cfg(), fakeDeps(0));
    expect(speedScoreboardOf(store, Date.parse(at(5)))).toMatchObject({ total: 1, resolutionMinutes: 10, computedAt: at(5) });
  });
});
