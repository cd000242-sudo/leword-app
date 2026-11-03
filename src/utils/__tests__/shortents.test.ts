import { describe, expect, it, vi } from 'vitest';
import { parseShortentsHtml, type ShortentsWindow } from '../shortents/parse';
import { appendWindow, computeRising, HISTORY_LIMIT } from '../shortents/rising';
import { measureTopicDocs, DOC_CACHE_MS, DOC_MAX_PER_ROUND } from '../shortents/docs';
import { buildShortentsPublicPayload } from '../shortents/public-file';
import { publishShortentsRising } from '../../main/shortents/publisher';
import { nextCollectDelayMs } from '../shortents/schedule';
import { runShortentsCycle, type ShortentsState } from '../shortents/cycle';

/* 시각은 전부 '지금' 기준 상대값 — 절대 날짜 픽스처는 TTL 이 지나면 코드 무변경으로 썩는다. */
const KST = 9 * 3600_000;
const slot = (offsetWindows: number, base = Date.UTC(2026, 0, 1, 5, 0, 0)): string => {
  const ms = base + offsetWindows * 30 * 60_000;
  const d = new Date(ms + KST);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+09:00`;
};

function itemJson(keyword: string, i: number, extra: Record<string, unknown> = {}) {
  return {
    topicId: `t${i}`, category: '경제', airsKeyword: keyword, channelName: 'KBS', title: `{제목} "${keyword}" 대표 문서`,
    url: `https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`,
    endUrl: 'http://n.news.naver.com/article/1', topicSummary: `${keyword} 요약`, serviceName: 'news', isNew: '0', ...extra,
  };
}
function htmlWith(keywords: string[], at = 0, itemExtra: Record<string, Record<string, unknown>> = {}) {
  const block = {
    id: 'abc', code: 'searchShortentsNow',
    contents: {
      tooltip: '설명 { 중괄호 } 와 \\"따옴표\\" 포함', items: keywords.map((k, i) => itemJson(k, i, itemExtra[k])),
      publishTime: slot(at + 1), periodStart: slot(at - 1), periodEnd: slot(at),
    },
    cgid: 'shortents_now',
  };
  return `<html><script>window.__DATA__={"a":[{"id":null,"code":"ad","contents":{}},${JSON.stringify(block)},{"id":"z","code":"other"}]}</script></html>`;
}
const win = (keywords: string[], at: number): ShortentsWindow => parseShortentsHtml(htmlWith(keywords, at))!;

describe('parseShortentsHtml', () => {
  it('블록을 읽어 순위·검색어·시각을 만든다', () => {
    const w = win(['경기도 신규택지 공급', '이강인 스페인 추모'], 0);
    expect(w.publishTime).toBe(slot(1));
    expect(w.periodStart).toBe(slot(-1));
    expect(w.periodEnd).toBe(slot(0));
    expect(w.items.map((x) => [x.rank, x.keyword])).toEqual([[1, '경기도 신규택지 공급'], [2, '이강인 스페인 추모']]);
    expect(w.items[0]).toMatchObject({ category: '경제', channel: 'KBS', isNew: false, summary: '경기도 신규택지 공급 요약' });
    expect(w.items[0].title).toContain('{제목}');
  });
  it('isNew "1" 은 true', () => {
    const w = parseShortentsHtml(htmlWith(['a', 'b'], 0, { b: { isNew: '1' } }))!;
    expect(w.items.map((x) => x.isNew)).toEqual([false, true]);
  });
  it('naver.com 계열 주소만 통과, 나머지는 빈 문자열', () => {
    const w = parseShortentsHtml(htmlWith(['a', 'b', 'c'], 0, {
      a: { endUrl: 'https://evil.example.com/x', url: 'javascript:alert(1)' },
      b: { endUrl: 'https://notnaver.com/x', url: 'https://m.search.naver.com.evil.io/x' },
      c: { endUrl: 'http://n.news.naver.com/a', url: 'https://m.search.naver.com/s' },
    }))!;
    expect(w.items[0]).toMatchObject({ articleUrl: '', searchUrl: '' });
    expect(w.items[1]).toMatchObject({ articleUrl: '', searchUrl: '' });
    expect(w.items[2]).toMatchObject({ articleUrl: 'http://n.news.naver.com/a', searchUrl: 'https://m.search.naver.com/s' });
  });
  it('긴 문자열은 상한에서 자른다', () => {
    const w = parseShortentsHtml(htmlWith(['a'.repeat(500)], 0))!;
    expect(w.items[0].keyword.length).toBeLessThanOrEqual(120);
    expect(w.items[0].title.length).toBeLessThanOrEqual(300);
  });
  it('블록이 없으면 null', () => {
    expect(parseShortentsHtml('<html>nothing</html>')).toBeNull();
    expect(parseShortentsHtml('')).toBeNull();
  });
  it('JSON 이 깨졌으면 null', () => {
    expect(parseShortentsHtml('x {"id":"a","code":"searchShortentsNow","contents":{"items":[{"airsKeyword":"a"')).toBeNull();
  });
  it('항목이 하나도 없으면 null', () => {
    expect(parseShortentsHtml(htmlWith([], 0))).toBeNull();
  });
  it('발행 시각이 없으면 null', () => {
    expect(parseShortentsHtml(htmlWith(['a'], 0).replace(/"publishTime":"[^"]*"/, '"publishTime":""'))).toBeNull();
  });
});

describe('appendWindow', () => {
  it('같은 publishTime 은 한 번만, 오래된 순으로 최근 48창만 남긴다', () => {
    let h: ShortentsWindow[] = [];
    for (let i = 0; i < 50; i++) h = appendWindow(h, win(['a'], i));
    expect(h.length).toBe(HISTORY_LIMIT);
    expect(h[h.length - 1].publishTime).toBe(slot(50));
    const again = appendWindow(h, win(['a'], 49));
    expect(again.length).toBe(HISTORY_LIMIT);
    expect(h.length).toBe(HISTORY_LIMIT); // 원본 불변
  });
});

describe('computeRising', () => {
  it('첫 창: 직전 없음, isNew 는 항목 표시만 따르고 순위 순', () => {
    const t = computeRising([win(['a', 'b'], 0)]);
    expect(t.map((x) => x.keyword)).toEqual(['a', 'b']);
    expect(t[0]).toMatchObject({ prevRank: null, rankDelta: null, isNew: false, windowsSeen: 1, streak: 1, status: 'steady' });
    expect(t[0].firstSeenAt).toBe(slot(1));
  });
  it('순위 상승·하락·새 등장', () => {
    const t = computeRising([win(['a', 'b', 'c'], 0), win(['b', 'x', 'a'], 1)]);
    const by = Object.fromEntries(t.map((x) => [x.keyword, x]));
    expect(by.b).toMatchObject({ rank: 1, prevRank: 2, rankDelta: 1, status: 'rising', isNew: false, streak: 2, windowsSeen: 2 });
    expect(by.a).toMatchObject({ rank: 3, prevRank: 1, rankDelta: -2, status: 'falling' });
    expect(by.x).toMatchObject({ rank: 2, prevRank: null, rankDelta: null, isNew: true, status: 'new', windowsSeen: 1, streak: 1 });
    expect(by.x.firstSeenAt).toBe(slot(2));
    expect(by.b.firstSeenAt).toBe(slot(1));
  });
  it('변동 없으면 steady', () => {
    const t = computeRising([win(['a', 'b'], 0), win(['a', 'b'], 1)]);
    expect(t.every((x) => x.status === 'steady' && x.rankDelta === 0)).toBe(true);
  });
  it('재등장: 직전 창에 없으면 isNew, 연속은 1로 끊기고 firstSeenAt 은 최초 창', () => {
    const t = computeRising([win(['a', 'b'], 0), win(['b', 'c'], 1), win(['a', 'b'], 2)]);
    const a = t.find((x) => x.keyword === 'a')!;
    expect(a).toMatchObject({ prevRank: null, isNew: true, status: 'new', windowsSeen: 2, streak: 1 });
    expect(a.firstSeenAt).toBe(slot(1));
    expect(t.find((x) => x.keyword === 'b')).toMatchObject({ streak: 3, windowsSeen: 3 });
  });
  it('공백 무시 비교로 같은 토픽', () => {
    const t = computeRising([win(['경기도 신규택지'], 0), win(['경기도신규택지'], 1)]);
    expect(t[0]).toMatchObject({ prevRank: 1, windowsSeen: 2, streak: 2 });
  });
  it('정렬: firstSeenAt 최신 → rankDelta 큰 순(null=0) → rank', () => {
    const prev = win(['a', 'b', 'c', 'd'], 0);
    const cur = win(['n1', 'd', 'c', 'n2', 'a', 'b'], 1);
    const order = computeRising([prev, cur]).map((x) => x.keyword);
    // 새 토픽(n1 rank1, n2 rank4)이 먼저 — 같은 firstSeenAt 이면 delta 0 동률이라 rank 순.
    // 이어서 delta: d(+3) c(+1) a(-3... 아래) — a:1→5(-4) b:2→6(-4)
    expect(order).toEqual(['n1', 'n2', 'd', 'c', 'a', 'b']);
  });
  it('입력 이력을 바꾸지 않는다', () => {
    const h = [win(['a'], 0), win(['a'], 1)];
    const snap = JSON.stringify(h);
    computeRising(h);
    expect(JSON.stringify(h)).toBe(snap);
  });
  it('이력이 비면 빈 배열', () => {
    expect(computeRising([])).toEqual([]);
  });
});

describe('measureTopicDocs', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const topics = () => computeRising([win(['a', 'b', 'c'], 0), win(['b', 'x', 'a'], 1)]);
  it('new·rising 만 재고 steady·falling 은 건너뛴다', async () => {
    const count = vi.fn(async (k: string) => (k === 'b' ? 100 : 5));
    const r = await measureTopicDocs(topics(), {}, now, count);
    expect(count.mock.calls.map((c) => c[0]).sort()).toEqual(['b', 'x']);
    expect(r.topics.find((t) => t.keyword === 'b')).toMatchObject({ docs: 100, docsMeasuredAt: new Date(now).toISOString() });
    expect(r.topics.find((t) => t.keyword === 'a')).toMatchObject({ docs: null, docsMeasuredAt: null });
  });
  it('6시간 안 캐시는 다시 재지 않고, 지나면 다시 잰다', async () => {
    const count = vi.fn(async () => 42);
    const first = await measureTopicDocs(topics(), {}, now, count);
    count.mockClear();
    const second = await measureTopicDocs(topics(), first.cache, now + DOC_CACHE_MS - 1, count);
    expect(count).not.toHaveBeenCalled();
    expect(second.topics.find((t) => t.keyword === 'x')!.docs).toBe(42);
    await measureTopicDocs(topics(), first.cache, now + DOC_CACHE_MS + 1, count);
    expect(count).toHaveBeenCalledTimes(2);
  });
  it('실패·0·음수는 null — 지어내지 않고 캐시도 하지 않는다', async () => {
    const count = vi.fn(async (k: string) => { if (k === 'b') throw new Error('x'); return 0; });
    const r = await measureTopicDocs(topics(), {}, now, count);
    expect(r.topics.filter((t) => t.status !== 'steady' && t.status !== 'falling').every((t) => t.docs === null)).toBe(true);
    expect(Object.keys(r.cache)).toEqual([]);
  });
  it(`회차당 최대 ${20}개`, async () => {
    const many = computeRising([win(['seed'], 0), win(Array.from({ length: 20 }, (_, i) => `k${i}`), 1)]);
    const count = vi.fn(async () => 7);
    await measureTopicDocs(many, {}, now, count, 5);
    expect(count).toHaveBeenCalledTimes(5);
    expect(DOC_MAX_PER_ROUND).toBe(20);
  });
});

describe('buildShortentsPublicPayload', () => {
  const built = '2026-06-01T00:00:00.000Z';
  it('계약 모양대로 만든다', async () => {
    const history = [win(['a', 'b'], 0), win(['b', 'x'], 1)];
    const measured = await measureTopicDocs(computeRising(history), {}, Date.parse(built), async () => 9);
    const p = buildShortentsPublicPayload(history, measured.topics, built)!;
    expect(p.schemaVersion).toBe(1);
    expect(p.source).toBe('naver-mobile-home-shortents-now');
    expect(p.builtAt).toBe(built);
    expect(p.latest).toEqual({ publishTime: slot(2), periodStart: slot(0), periodEnd: slot(1) });
    expect(p.windows).toBe(2);
    expect(Object.keys(p.topics[0]).sort()).toEqual([
      'articleUrl', 'category', 'channel', 'docs', 'docsMeasuredAt', 'firstSeenAt', 'isNew', 'keyword', 'prevRank',
      'rank', 'rankDelta', 'searchUrl', 'status', 'streak', 'summary', 'title', 'windowsSeen',
    ]);
    expect(p.topics.map((t) => t.keyword)).toEqual(['x', 'b']);
  });
  it('토픽이 없으면 null(빈 회차)', () => {
    expect(buildShortentsPublicPayload([], [], built)).toBeNull();
    expect(buildShortentsPublicPayload([win(['a'], 0)], [], built)).toBeNull();
  });
});

describe('publishShortentsRising', () => {
  const sha = 'c'.repeat(40);
  const built = '2026-06-01T00:00:00.000Z';
  const history = [win(['a', 'b'], 0), win(['b', 'x'], 1)];
  const build = (at = built) => buildShortentsPublicPayload(history, computeRising(history).map((t) => ({ ...t, docs: null, docsMeasuredAt: null })), at)!;
  const encoded = (value: unknown) => JSON.stringify({ sha, size: JSON.stringify(value).length, encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
  function harness(remote: unknown | 404, isOwner = true) {
    const gh = vi.fn(async (args: string[], _input?: string) => {
      if (args.includes('PUT')) return '{}';
      if (remote === 404) { const e: any = new Error('github_request_failed'); e.status = 404; throw e; }
      return encoded(remote);
    });
    return { gh, deps: { isOwner: async () => isOwner, gh } };
  }
  const written = (gh: ReturnType<typeof vi.fn>) => {
    const call = gh.mock.calls.find(([args]) => args.includes('PUT'))!;
    return { endpoint: call[0].find((a: string) => a.includes('contents')), body: JSON.parse(call[1]!) };
  };

  it('주인 PC 가 아니면 건너뛴다(gh 를 부르지도 않는다)', async () => {
    const h = harness(404, false);
    expect(await publishShortentsRising(build(), h.deps)).toEqual({ status: 'skipped', reason: 'not_owner_pc' });
    expect(h.gh).not.toHaveBeenCalled();
  });
  it('payload 가 없으면(빈 회차) 건너뛴다', async () => {
    const h = harness(404);
    expect(await publishShortentsRising(null, h.deps)).toMatchObject({ status: 'skipped', reason: 'empty_window' });
    expect(h.gh).not.toHaveBeenCalled();
  });
  it('원격이 없으면 새로 만든다', async () => {
    const h = harness(404);
    expect(await publishShortentsRising(build(), h.deps)).toMatchObject({ status: 'published' });
    const w = written(h.gh);
    expect(w.endpoint).toBe('repos/cd000242-sudo/naver/contents/spa/public/data/shortents-rising.json');
    expect(w.body.sha).toBeUndefined();
    expect(JSON.parse(Buffer.from(w.body.content, 'base64').toString('utf8')).schemaVersion).toBe(1);
  });
  it('내용이 같으면(builtAt 만 다름) 커밋하지 않는다', async () => {
    const h = harness(build('2026-05-31T00:00:00.000Z'));
    expect(await publishShortentsRising(build(), h.deps)).toMatchObject({ status: 'skipped', reason: 'already_published' });
    expect(h.gh.mock.calls.some(([a]) => a.includes('PUT'))).toBe(false);
  });
  it('원격이 더 최근 창이면 덮지 않는다', async () => {
    const newer = build();
    const h = harness({ ...newer, latest: { ...newer.latest, publishTime: slot(99) } });
    expect(await publishShortentsRising(build(), h.deps)).toMatchObject({ status: 'skipped', reason: 'newer_remote' });
  });
  it('원격이 낡았으면 sha 를 달아 갱신', async () => {
    const old = build();
    const h = harness({ ...old, latest: { ...old.latest, publishTime: slot(0) } });
    expect(await publishShortentsRising(build(), h.deps)).toMatchObject({ status: 'published' });
    expect(written(h.gh).body.sha).toBe(sha);
  });
  it('gh 가 실패하면 failed 로 끝나고 던지지 않는다', async () => {
    const gh = vi.fn(async () => { throw new Error('boom'); });
    expect(await publishShortentsRising(build(), { isOwner: async () => true, gh })).toMatchObject({ status: 'failed' });
  });
});

describe('nextCollectDelayMs', () => {
  // 발행 :00/:30 뒤 3분(:03, :33)
  const at = (h: number, m: number, s = 0) => Date.UTC(2026, 5, 1, h, m, s) - KST + KST; // UTC 기준 시:분
  it('다음 :03 / :33 까지 남은 시간', () => {
    expect(nextCollectDelayMs(Date.UTC(2026, 5, 1, 1, 0, 0))).toBe(3 * 60_000);
    expect(nextCollectDelayMs(Date.UTC(2026, 5, 1, 1, 10, 0))).toBe(23 * 60_000);
    expect(nextCollectDelayMs(Date.UTC(2026, 5, 1, 1, 40, 0))).toBe(23 * 60_000);
  });
  it('막 지난 직후면 다음 칸으로', () => {
    expect(nextCollectDelayMs(Date.UTC(2026, 5, 1, 1, 3, 0))).toBe(30 * 60_000);
    expect(at(0, 0)).toBeTypeOf('number');
  });
});

describe('runShortentsCycle', () => {
  const mk = (html: string, state?: Partial<ShortentsState>) => {
    let saved: ShortentsState = { windows: [], docCache: {}, publishedFor: null, ...state };
    const publish = vi.fn(async (_payload: unknown) => ({ status: 'published', reason: 'ok' }));
    const deps = { fetchHtml: async () => html, readState: () => saved, writeState: (s: ShortentsState) => { saved = s; },
      count: async () => 11, publish, now: () => Date.parse('2026-06-01T00:00:00Z') };
    return { deps, publish, saved: () => saved };
  };
  it('새 창을 기록하고 발행한 뒤 publishedFor 를 남긴다', async () => {
    const h = mk(htmlWith(['a', 'b'], 0));
    const r = await runShortentsCycle(h.deps);
    expect(r).toMatchObject({ status: 'collected', publication: { status: 'published' } });
    expect(h.saved().windows.length).toBe(1);
    expect(h.saved().publishedFor).toBe(slot(1));
    expect(h.publish.mock.calls[0][0]).toMatchObject({ windows: 1 });
  });
  it('이미 받아 발행까지 끝낸 창이면 건너뛴다', async () => {
    const h = mk(htmlWith(['a'], 0), { windows: [win(['a'], 0)], publishedFor: slot(1) });
    expect(await runShortentsCycle(h.deps)).toMatchObject({ status: 'skipped', reason: 'already_collected' });
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('받았지만 발행이 안 된 창은 기록을 다시 쌓지 않고 발행만 재시도', async () => {
    const h = mk(htmlWith(['a'], 0), { windows: [win(['a'], 0)], publishedFor: null });
    expect((await runShortentsCycle(h.deps)).status).toBe('collected');
    expect(h.saved().windows.length).toBe(1);
  });
  it('받기 실패·해석 실패는 failed 로 돌려주고 기록을 건드리지 않는다', async () => {
    const h = mk('<html></html>');
    expect(await runShortentsCycle(h.deps)).toMatchObject({ status: 'failed', reason: 'parse_failed' });
    const bad = { ...h.deps, fetchHtml: async () => { throw new Error('net'); } };
    expect(await runShortentsCycle(bad)).toMatchObject({ status: 'failed' });
    expect(h.saved().windows.length).toBe(0);
  });
  it('발행이 실패해도 기록은 남고 publishedFor 는 비워 둔다', async () => {
    const h = mk(htmlWith(['a'], 0));
    h.publish.mockResolvedValueOnce({ status: 'failed', reason: 'x' });
    await runShortentsCycle(h.deps);
    expect(h.saved().windows.length).toBe(1);
    expect(h.saved().publishedFor).toBeNull();
  });
});
