import { describe, expect, it } from 'vitest';
import {
  autopsyFacts,
  emptyHistory,
  historyProbes,
  mergeHistory,
  normalizePostUrl,
  parsePostPageTime,
  seedFromRecords,
  timeTargets,
  type AutopsyHistory,
} from '../advisor/autopsy-history';

// 2026-10-01 10:00 KST
const now = new Date('2026-10-01T01:00:00.000Z');
const ctx = { channelId: 'leader_145', now };
const ok = (body: unknown) => ({ status: 200, body: JSON.stringify(body) });
const cvBody = (rows: { id: string; v: number; at?: number }[]) => ({ data: rows.map((r) => ({ contentId: `http://blog.naver.com/leader_145/${r.id}`, metricValue: r.v, createdAt: r.at ?? null })) });

describe('0명 글 부검 재료 — 날짜별 기록', () => {
  it('지난 14일 중 없는 날만 조회 순위 · 홈판 상위를 부른다', () => {
    const probes = historyProbes(ctx, emptyHistory());
    expect(probes).toHaveLength(28);
    expect(probes[0]).toEqual({ key: 'cv:2026-09-30', path: expect.stringContaining('/integrated-analysis/cv-ranks?') });
    expect(probes[0].path).toContain('date=2026-09-30');
    expect(probes[0].path).toContain('limit=50');
    expect(probes.find((p) => p.key === 'hf:2026-09-17')?.path).toContain('/trend/main-inflow-content-ranks?');
    const have: AutopsyHistory = { ...emptyHistory(), days: { '2026-09-30': { cv: { rows: [], complete: true }, homefeed: [] } } };
    expect(historyProbes(ctx, have).map((p) => p.key)).not.toContain('cv:2026-09-30');
  });

  it('받은 날만 합치고(실패한 날은 다음에 다시), 50줄 미만이면 그날 목록이 완전하다고 적는다', () => {
    const merged = mergeHistory(emptyHistory(), {
      'cv:2026-09-30': ok(cvBody([{ id: '1', v: 7, at: Date.parse('2026-09-30T00:49:00Z') }])),
      'cv:2026-09-29': { status: 500, body: '' },
      'hf:2026-09-30': ok({ data: [{ title: '홈판 1위', url: 'http://blog.naver.com/a/11' }] }),
    }, now);
    expect(merged.days['2026-09-30'].cv).toEqual({ rows: [{ contentId: 'https://blog.naver.com/leader_145/1', views: 7, createdAt: '2026-09-30T00:49:00.000Z' }], complete: true });
    expect(merged.days['2026-09-30'].homefeed).toEqual([{ rank: 1, title: '홈판 1위', url: 'https://blog.naver.com/a/11' }]);
    expect(merged.days['2026-09-29']).toBeUndefined();
    const full = mergeHistory(emptyHistory(), { 'cv:2026-09-30': ok(cvBody(Array.from({ length: 50 }, (_, i) => ({ id: String(i), v: 1 })))) }, now);
    expect(full.days['2026-09-30'].cv?.complete).toBe(false);
  });

  it('30일 지난 날은 버리고, 입력 기록은 건드리지 않는다', () => {
    const old: AutopsyHistory = { ...emptyHistory(), days: { '2026-08-30': { homefeed: [] }, '2026-09-02': { homefeed: [] } } };
    const merged = mergeHistory(old, {}, now);
    expect(Object.keys(merged.days)).toEqual(['2026-09-02']);
    expect(Object.keys(old.days)).toHaveLength(2);
  });
});

describe('하루 기록으로 미리 채우기', () => {
  it('하루 기록의 조회 순위 · 7일 홈판 상위를 그날 기록으로 옮겨, 그날은 다시 부르지 않는다', () => {
    const record = {
      day: '2026-09-30',
      posts: [{ contentId: 'http://blog.naver.com/leader_145/7', title: 't', views: 3, publishedAt: '2026-09-29T16:38:00.471Z', homefeed: null, searchCount: null }],
      homefeedWeek: [{ day: '2026-09-30', rank: 1, title: '홈판 a', url: 'http://blog.naver.com/a/1' }, { day: '2026-09-24', rank: 2, title: '홈판 b', url: 'http://blog.naver.com/b/2' }],
    } as any;
    const seeded = seedFromRecords(emptyHistory(), [record]);
    expect(seeded.days['2026-09-30'].cv).toEqual({ rows: [{ contentId: 'https://blog.naver.com/leader_145/7', views: 3, createdAt: '2026-09-29T16:38:00.471Z' }], complete: true });
    expect(seeded.days['2026-09-30'].homefeed).toEqual([{ rank: 1, title: '홈판 a', url: 'https://blog.naver.com/a/1' }]);
    expect(seeded.days['2026-09-24'].homefeed?.[0].url).toBe('https://blog.naver.com/b/2');
    expect(historyProbes(ctx, seeded).map((p) => p.key)).not.toEqual(expect.arrayContaining(['cv:2026-09-30', 'hf:2026-09-30', 'hf:2026-09-24']));
  });

  it('이미 있는 날은 덮지 않는다', () => {
    const have: AutopsyHistory = { ...emptyHistory(), days: { '2026-09-30': { cv: { rows: [], complete: true } } } };
    const seeded = seedFromRecords(have, [{ day: '2026-09-30', posts: [{ contentId: 'x', views: 1 }], homefeedWeek: [] } as any]);
    expect(seeded.days['2026-09-30'].cv?.rows).toEqual([]);
  });
});

describe('글 주소 · 발행 시각', () => {
  it('블로그 글 주소를 한 모양으로 — 블로그 글이 아니면 null', () => {
    expect(normalizePostUrl('http://blog.naver.com/leader_145/224427908740')).toBe('https://blog.naver.com/leader_145/224427908740');
    expect(normalizePostUrl('https://m.blog.naver.com/leader_145/224427908740?x=1')).toBe('https://blog.naver.com/leader_145/224427908740');
    expect(normalizePostUrl('https://cafe.naver.com/x/1')).toBeNull();
  });

  it('글 화면 시각 — 절대 시각은 KST 분까지 정확, "N시간 전"은 어림', () => {
    const html = (text: string) => `<span class="se_publishDate pcol2">${text}</span>`;
    expect(parsePostPageTime(html('2026. 9. 30. 9:49'), now.getTime())).toEqual({ at: '2026-09-30T00:49:00.000Z', approx: false });
    expect(parsePostPageTime(html('2026. 9. 30. 21:05'), now.getTime())).toEqual({ at: '2026-09-30T12:05:00.000Z', approx: false });
    expect(parsePostPageTime(html('3시간 전'), now.getTime())).toEqual({ at: '2026-09-30T22:00:00.000Z', approx: true });
    expect(parsePostPageTime(html('25분 전'), now.getTime())).toEqual({ at: '2026-10-01T00:35:00.000Z', approx: false });
    expect(parsePostPageTime('<div>없음</div>', now.getTime())).toBeNull();
  });

  it('시각을 아직 모르는 주소만 — 내 글 먼저, 그다음 최근 날짜 홈판 글', () => {
    const history: AutopsyHistory = {
      ...emptyHistory(),
      postTimes: { 'https://blog.naver.com/a/11': '2026-09-30T00:00:00.000Z' },
      days: { '2026-09-29': { homefeed: [{ rank: 1, title: 'x', url: 'https://blog.naver.com/b/22' }] }, '2026-09-30': { homefeed: [{ rank: 1, title: 'y', url: 'https://blog.naver.com/a/11' }, { rank: 2, title: 'z', url: 'https://blog.naver.com/c/33' }] } },
      myPosts: [{ logNo: '9', title: '내 글', url: 'https://blog.naver.com/leader_145/9', publishedOn: '2026-09-30', searchable: true, blocked: false }],
    };
    expect(timeTargets(history, 10)).toEqual(['https://blog.naver.com/leader_145/9', 'https://blog.naver.com/c/33', 'https://blog.naver.com/b/22']);
    expect(timeTargets(history, 2)).toHaveLength(2);
  });
});

describe('부검 사실 묶음', () => {
  const myPost = (logNo: string, publishedOn: string, extra = {}) => ({ logNo, title: `내 글 ${logNo}`, url: `https://blog.naver.com/leader_145/${logNo}`, publishedOn, searchable: true, blocked: false, ...extra });
  const base: AutopsyHistory = {
    ...emptyHistory(),
    postTimes: { 'https://blog.naver.com/leader_145/1': '2026-09-29T12:00:00.000Z' },
    days: {
      '2026-09-29': { cv: { rows: [{ contentId: 'https://blog.naver.com/leader_145/2', views: 4, createdAt: null }], complete: true }, homefeed: [{ rank: 3, title: '홈판 글', url: 'https://blog.naver.com/b/22' }] },
      '2026-09-30': { cv: { rows: [], complete: true } },
    },
    myPosts: [myPost('1', '2026-09-29'), myPost('2', '2026-09-29'), myPost('3', '2026-09-30', { searchable: false }), myPost('4', '2026-10-01')],
  };

  it('목록이 완전한 날 빠진 글은 조회 0(확정), 오늘 글은 아직 셀 수 없어 뺀다', () => {
    const facts = autopsyFacts(base, now);
    expect(facts.posts.map((p) => [p.url.slice(-1), p.views, p.viewDays])).toEqual([['3', 0, 1], ['1', 0, 2], ['2', 4, 2]]);
    expect(facts.posts.find((p) => p.url.endsWith('/1'))?.publishedAt).toBe('2026-09-29T12:00:00.000Z');
    expect(facts.posts.every((p) => p.viewsComplete)).toBe(true);
    expect(facts.posts.find((p) => p.url.endsWith('/3'))?.searchable).toBe(false);
    expect(facts.homefeed).toEqual([{ day: '2026-09-29', rank: 3, title: '홈판 글', url: 'https://blog.naver.com/b/22', publishedAt: null }]);
    expect(facts.from).toBe('2026-09-17');
    expect(facts.to).toBe('2026-09-30');
  });

  it('목록이 50줄로 잘린 날이 끼면 조회를 모른다(null) — 0 으로 때우지 않는다', () => {
    const cut: AutopsyHistory = { ...base, days: { ...base.days, '2026-09-30': { cv: { rows: [], complete: false } } } };
    expect(autopsyFacts(cut, now).posts.find((p) => p.url.endsWith('/3'))?.views).toBeNull();
  });

  it('발행일 기록이 없으면(앱이 그날 안 돎) 조회는 세되 완전하지 않다고 적는다', () => {
    const gap: AutopsyHistory = { ...base, days: { '2026-09-30': base.days['2026-09-30'] } };
    const p1 = autopsyFacts(gap, now).posts.find((p) => p.url.endsWith('/1'))!;
    expect([p1.views, p1.viewDays, p1.viewsComplete]).toEqual([0, 1, false]);
  });
});
