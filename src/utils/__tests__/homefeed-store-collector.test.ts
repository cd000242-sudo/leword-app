import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHomefeedStore, type HomefeedStore } from '../../main/homefeed/store';
import { collectHomefeedSnapshot, type HomefeedCollectorDeps } from '../../main/homefeed/collector';
import { createOgImageResolver, fetchOgImage } from '../../main/homefeed/og-image';
import { recomputeHomefeedStories } from '../../main/homefeed/engine';
import { HOMEFEED_SCHEMA } from '../homefeed/types';
import { at, issue, settings, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호 — 저장소(JSON · 스키마 버전 · 원자적 쓰기)와 수집 한 회차(원천 주입)(2026-09-16).
 * 원천 하나가 죽어도 회차는 산다 — 그 원천만 오류로 적고 값은 null. 네이버 키가 없으면 뉴스 · 문서수는 '건너뜀'.
 */
let dir = '';
let store: HomefeedStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-test-'));
  store = createHomefeedStore(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('저장소', () => {
  it('스냅샷을 시간순으로 읽고, 가장 최근 시각은 파일 이름으로만 찾는다', () => {
    store.appendSnapshot(snapshot(at(20), [issue('b')]));
    store.appendSnapshot(snapshot(at(0), [issue('a')]));
    store.appendSnapshot(snapshot(at(60 * 26), [issue('c')]));
    expect(store.listSnapshots().map((row) => row.capturedAt)).toEqual([at(0), at(20), at(60 * 26)]);
    expect(store.listSnapshots(Date.parse(at(10))).map((row) => row.capturedAt)).toEqual([at(20), at(60 * 26)]);
    expect(store.latestSnapshotAt()).toBe(at(60 * 26));
    expect(store.countSnapshots()).toBe(3);
  });

  it('스키마 버전이 다른 파일은 읽지 않는다', () => {
    const file = store.appendSnapshot(snapshot(at(0), [issue('a')]));
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 'homefeed-snapshot-v0', capturedAt: at(0), issues: [] }));
    fs.writeFileSync(path.join(dir, 'stories.json'), JSON.stringify({ schemaVersion: 'old', stories: [{ id: 'x' }] }));
    expect(store.listSnapshots()).toEqual([]);
    expect(store.readStories()).toMatchObject({ schemaVersion: HOMEFEED_SCHEMA.stories, stories: [] });
  });

  it('보존 기간이 지난 스냅샷을 지우고 빈 날짜 폴더도 치운다', () => {
    store.appendSnapshot(snapshot(at(0), [issue('a')]));
    store.appendSnapshot(snapshot(at(60 * 24 * 3), [issue('b')]));
    expect(store.pruneSnapshots(2, Date.parse(at(60 * 24 * 3)))).toBe(1);
    expect(store.listSnapshots().map((row) => row.capturedAt)).toEqual([at(60 * 24 * 3)]);
    expect(fs.readdirSync(path.join(dir, 'snapshots'))).toHaveLength(1);
  });

  it('설정은 저장할 때도 범위를 지키고, 생성 이미지는 id 형식이 맞을 때만 읽는다', () => {
    store.writeSettings({ ...settings(), snapshotIntervalMinutes: 2, enabled: true });
    expect(store.readSettings()).toMatchObject({ snapshotIntervalMinutes: 5, enabled: true });
    const record = {
      id: 'img-abc123', storyId: 's', promptId: 'ai-hero', createdAt: at(0), provider: 'codex-builtin' as const, aspectRatio: '16:9' as const,
      promptKo: 'p', promptEn: 'p', mime: 'image/png', bytes: 3, width: null, height: null, aiGenerated: true as const, label: 'AI',
    };
    store.saveImage(record, Buffer.from([1, 2, 3]));
    expect(store.readImage('img-abc123')?.data).toEqual(Buffer.from([1, 2, 3]));
    expect(store.readImage('../../etc/passwd')).toBeNull();
    expect(() => store.saveImage({ ...record, id: '../x' }, Buffer.from([1]))).toThrow();
  });

  it('다른 이슈의 자산 파일은 섞이지 않는다', () => {
    store.writeAssets({ ...store.readAssets('이슈A'), drafts: [{ id: 'd', createdAt: at(0), provider: 'codex', titleId: null, text: '원고', problems: [], retried: false, evidenceHash: 'h' }] });
    expect(store.readAssets('이슈A').drafts).toHaveLength(1);
    expect(store.readAssets('이슈B').drafts).toHaveLength(0);
  });
});

function fakeDeps(overrides: Partial<HomefeedCollectorDeps> = {}, clock = Date.parse(at(0))): HomefeedCollectorDeps {
  return {
    fetchSignalBz: async () => [{ rank: 1, keyword: '서울 시내버스 타결' }, { rank: 2, keyword: '유승호 결혼식' }, { rank: 3, keyword: '토지거래허가제' }],
    fetchHotLanes: async () => ({ nate: [{ rank: 4, keyword: '유승호 결혼식 동행' }, { rank: 1, keyword: '서울 시내버스' }] }),
    hasNaverKeys: () => true,
    fetchNews: async (keyword) => {
      if (keyword === '토지거래허가제') throw new Error('뉴스 검색 429');
      return {
        total: 50,
        items: [
          { title: `${keyword} 기사`, url: `https://n.example.com/${encodeURIComponent(keyword)}`, press: 'n.example.com', publishedAt: at(0) },
          // 뉴스 검색이 문장형 검색어에 느슨하게 걸어 주는 다른 이슈 기사 — 표본에 들어가면 안 된다.
          { title: '손흥민 새 역사 기념식에도 붉은악마 떠나', url: 'https://n.example.com/other', press: 'n.example.com', publishedAt: at(0) },
        ],
      };
    },
    fetchBlogDocCount: async (keyword) => (keyword === '유승호 결혼식' ? null : 1234),
    fetchIssueBoard: async () => ({
      publishedAt: at(-120),
      issues: [{ issue: '유승호 결혼식 동행 못 간다', why: '헤드라인 검증 통과한 이유', headlines: [{ title: '유승호 결혼식 불참 이유', press: 'b.example.com', publishedAt: at(-150), link: 'https://b.example.com/1' }] }],
    }),
    resolveOgImage: async (url) => (url.includes('n.example.com') ? `${url}.jpg` : null),
    now: () => clock,
    ...overrides,
  };
}

describe('수집 한 회차', () => {
  it('원천마다 결과를 적고, 실패한 원천만 오류로 남기며 값은 null 로 둔다', async () => {
    const { snapshot: snap, newIssueKeys, droppedSamples } = await collectHomefeedSnapshot(store, settings({ ogImagesPerIssue: 2 }), fakeDeps());
    // 검색어와 어절이 겹치지 않는 기사는 버린다(뉴스가 성공한 이슈 2건 × 1개).
    expect(droppedSamples).toBe(2);
    expect(snap.issues.every((row) => row.samples.every((sample) => !sample.title.includes('손흥민')))).toBe(true);
    expect(snap.issues.map((row) => row.keyword)).toEqual(['서울 시내버스 타결', '유승호 결혼식', '토지거래허가제']);
    expect(newIssueKeys).toHaveLength(3);
    const byName = Object.fromEntries(snap.sources.map((run) => [run.name, run]));
    expect(byName['signal.bz']).toMatchObject({ ok: true, count: 3 });
    expect(byName.google).toMatchObject({ ok: false, error: '목록이 비었습니다' });
    expect(byName['naver-news']).toMatchObject({ ok: true, count: 2, error: '뉴스 검색 429' });
    expect(byName['naver-blog']).toMatchObject({ ok: true, count: 2, error: '문서수를 받지 못했습니다' });

    const [bus, wedding, land] = snap.issues;
    expect(bus.ranks).toEqual({ 'signal.bz': 1, nate: 1 });
    expect(wedding).toMatchObject({ blogDocCount: null, boardWhy: '헤드라인 검증 통과한 이유' });
    expect(wedding.samples.map((row) => row.origin)).toEqual(['naver-news', 'site-issue-board']);
    expect(wedding.samples[0].image).toBe('https://n.example.com/%EC%9C%A0%EC%8A%B9%ED%98%B8%20%EA%B2%B0%ED%98%BC%EC%8B%9D.jpg');
    expect(land).toMatchObject({ newsTotal: null, blogDocCount: 1234, samples: [] });
  });

  it('처음 회차는 나이를 검열로, 10분 뒤 새로 나타난 이슈는 검열 없이 적는다', async () => {
    await collectHomefeedSnapshot(store, settings(), fakeDeps());
    expect(store.readSignalState().entries['서울시내버스타결'].firstSeenCensored).toBe(true);
    const later = fakeDeps({ fetchSignalBz: async () => [{ rank: 1, keyword: '서울 시내버스 타결' }, { rank: 2, keyword: '새로 뜬 이슈' }] }, Date.parse(at(10)));
    await collectHomefeedSnapshot(store, settings(), later);
    const state = store.readSignalState();
    expect(state.entries['새로뜬이슈']).toMatchObject({ firstSeenAt: at(10), firstSeenCensored: false });
    expect(state.entries['서울시내버스타결']).toMatchObject({ firstSeenAt: at(0), appearances: 2 });
    expect(store.readSources().sources.google).toMatchObject({ consecutiveFailures: 2 });
  });

  it('네이버 키가 없으면 뉴스 · 문서수는 건너뜀 — 안 잰 값은 null', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings(), fakeDeps({ hasNaverKeys: () => false }));
    const byName = Object.fromEntries(snap.sources.map((run) => [run.name, run]));
    expect(byName['naver-news']).toMatchObject({ skipped: true, ok: false });
    expect(snap.issues.every((row) => row.newsTotal === null && row.blogDocCount === null)).toBe(true);
  });

  it('Signal.bz 가 죽으면 다른 실시간 목록으로 회차를 잇는다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings(), fakeDeps({ fetchSignalBz: async () => [] }));
    expect(snap.sources.find((run) => run.name === 'signal.bz')).toMatchObject({ ok: false, error: 'Signal.bz 목록이 비었습니다' });
    expect(snap.issues.map((row) => [row.keyword, row.ranks])).toEqual([['유승호 결혼식 동행', { nate: 4 }], ['서울 시내버스', { nate: 1 }]]);
  });

  it('수집 뒤 스토리를 다시 계산해 저장한다(목록 계산에 AI 없음)', async () => {
    await collectHomefeedSnapshot(store, settings(), fakeDeps());
    const file = recomputeHomefeedStories(store, Date.parse(at(1)));
    expect(file.stories).toHaveLength(3);
    expect(store.readStories().snapshotAt).toBe(at(0));
  });
});

describe('og:image', () => {
  const html = (body: string) => async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

  it('head 의 og:image 를 꺼내고 // 주소를 https 로 채운다', async () => {
    expect(await fetchOgImage('https://a.com/1', html('<meta property="og:image" content="//img.a.com/1.jpg?a=1&amp;b=2">') as unknown as typeof fetch)).toBe('https://img.a.com/1.jpg?a=1&b=2');
    expect(await fetchOgImage('https://a.com/1', html('<meta content="https://img/x.png" property="og:image">') as unknown as typeof fetch)).toBe('https://img/x.png');
    expect(await fetchOgImage('javascript:alert(1)', html('') as unknown as typeof fetch)).toBeNull();
  });

  it('주소마다 한 번만 받고 캐시를 파일에 남긴다', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return new Response('<meta property="og:image" content="https://img/x.png">'); }) as unknown as typeof fetch;
    const resolver = createOgImageResolver(store, { fetchImpl, delayMs: 0, sleep: async () => {}, now: () => Date.parse(at(0)) });
    await resolver.resolve('https://a.com/1');
    await resolver.resolve('https://a.com/1');
    resolver.flush();
    expect(calls).toBe(1);
    expect(store.readOgCache().entries['https://a.com/1']).toEqual({ image: 'https://img/x.png', at: at(0) });
  });
});
