import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHomefeedStore, type HomefeedStore } from '../../main/homefeed/store';
import { collectHomefeedSnapshot, type HomefeedCollectorDeps } from '../../main/homefeed/collector';
import { at, settings } from './homefeed-fixtures';

/**
 * 홈판 신호 — 소재 공급과 줄세우기(2026-09-17).
 *
 * 사장님 지적: "홈판에는 스포츠 · 연예 이슈 · 스타가 많이 뜨는데, 강력한 후킹을 만들 수 있는 키워드를 잡아야 한다."
 *
 * 그날 실측한 두 가지 문제를 잠근다.
 *   1) 공급이 한 곳뿐이었다 — Signal.bz 가 살아 있으면 네이트 · 구글 · 다음은 순위 대조용으로만 쓰였다.
 *      그 세 곳에만 있던 스포츠 · 연예 소재는 후보에 아예 못 들어갔다.
 *   2) 자를 때 순위만 봤다 — 걸림 말이 하나도 없는 이슈가 앞자리를 차지하고,
 *      걸림 말이 있는 이슈가 상한 밖으로 밀렸다.
 *
 * 줄세우기는 수집 시점에 쓸 수 있는 것만 쓴다 — 그때는 뉴스 표본이 아직 없으므로 검색어 자체의 걸림 말만 센다.
 */
let dir = '';
let store: HomefeedStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homefeed-supply-'));
  store = createHomefeedStore(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** 뉴스 · 문서수 · 보드 · og 는 이 시험의 관심사가 아니라 전부 꺼 둔다. */
function supplyDeps(overrides: Partial<HomefeedCollectorDeps> = {}): HomefeedCollectorDeps {
  return {
    fetchSignalBz: async () => [
      { rank: 1, keyword: '조현 외교부 장관 출국' },
      { rank: 2, keyword: '추석 맞아 나눔 실천' },
    ],
    fetchHotLanes: async () => ({
      nate: [{ rank: 1, keyword: '손흥민 선발 제외 침묵' }],
      daum: [{ rank: 1, keyword: '서인영 행사비 폭발' }, { rank: 2, keyword: '조현 외교부 장관 출국' }],
      google: [{ rank: 1, keyword: '안세영 압승 쾌승' }],
    }),
    hasNaverKeys: () => false,
    fetchNews: async () => ({ total: null, items: [] }),
    fetchBlogDocCount: async () => null,
    fetchIssueBoard: async () => null,
    resolveOgImage: async () => null,
    now: () => Date.parse(at(0)),
    ...overrides,
  };
}

describe('소재 공급은 네 목록을 합친다', () => {
  it('Signal.bz 가 살아 있어도 다른 목록에만 있는 소재를 버리지 않는다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 12, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), supplyDeps());
    const keywords = snap.issues.map((row) => row.keyword);
    expect(keywords).toContain('손흥민 선발 제외 침묵');
    expect(keywords).toContain('서인영 행사비 폭발');
    expect(keywords).toContain('안세영 압승 쾌승');
    expect(keywords).toContain('조현 외교부 장관 출국');
  });

  it('여러 목록에 같이 있는 소재는 한 번만 담고, 순위는 목록마다 그대로 적는다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 12, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), supplyDeps());
    const same = snap.issues.filter((row) => row.keyword === '조현 외교부 장관 출국');
    expect(same).toHaveLength(1);
    expect(same[0].ranks).toMatchObject({ 'signal.bz': 1, daum: 2 });
  });

  it('상한을 넘으면 자르되, 자르기 전에 네 목록을 다 본다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 3, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), supplyDeps());
    expect(snap.issues).toHaveLength(3);
    // 걸림 말이 있는 소재가 상한 안에 든다 — 순위만 봤다면 1 · 2위인 정치 소재 둘이 앞자리를 먹었다.
    expect(snap.issues.map((row) => row.keyword)).toContain('손흥민 선발 제외 침묵');
  });
});

describe('걸림 말이 있는 소재를 앞에 세운다', () => {
  it('걸림 말이 있는 소재가 없는 소재보다 앞에 온다', async () => {
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 12, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), supplyDeps());
    const keywords = snap.issues.map((row) => row.keyword);
    const 걸림있음 = keywords.indexOf('손흥민 선발 제외 침묵');
    const 걸림없음 = keywords.indexOf('추석 맞아 나눔 실천');
    expect(걸림있음).toBeGreaterThanOrEqual(0);
    expect(걸림없음).toBeGreaterThanOrEqual(0);
    expect(걸림있음).toBeLessThan(걸림없음);
  });

  it('걸림 말 수가 같으면 순위가 앞선 쪽이 먼저다 — 뒤집기는 걸림 말이 있을 때만', async () => {
    const deps = supplyDeps({
      fetchSignalBz: async () => [
        { rank: 1, keyword: '안세영 압승' },
        { rank: 2, keyword: '손흥민 영입' },
      ],
      fetchHotLanes: async () => ({}),
    });
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 12, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), deps);
    expect(snap.issues.map((row) => row.keyword)).toEqual(['안세영 압승', '손흥민 영입']);
  });

  it('걸림 말이 하나도 없으면 원래 순위 그대로 둔다', async () => {
    const deps = supplyDeps({
      fetchSignalBz: async () => [
        { rank: 1, keyword: '조현 외교부 장관 출국' },
        { rank: 2, keyword: '추석 맞아 나눔 실천' },
      ],
      fetchHotLanes: async () => ({}),
    });
    const { snapshot: snap } = await collectHomefeedSnapshot(store, settings({ issueLimit: 12, sources: { naverNews: false, naverBlog: false, siteBoard: false, ogImage: false } }), deps);
    expect(snap.issues.map((row) => row.keyword)).toEqual(['조현 외교부 장관 출국', '추석 맞아 나눔 실천']);
  });
});
