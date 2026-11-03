import { describe, expect, it, vi } from 'vitest';
import type { ShortentsWindow } from '../shortents/parse';
import { measureCandidate, selectUpcoming, topicMatches, type NewsSample } from '../shortents/upcoming';
import { markHits, pruneLedger, recordFlags, summarizeHits, type LedgerEntry } from '../shortents/upcoming-ledger';
import { buildUpcomingPublicPayload } from '../shortents/upcoming-public';
import { runUpcomingCycle } from '../shortents/upcoming-cycle';
import { publishShortentsUpcoming } from '../../main/shortents/upcoming-publisher';

/* 시각은 전부 '지금' 기준 상대값 — 절대 날짜 픽스처는 TTL 이 지나면 코드 무변경으로 썩는다. */
const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const news = (rows: Array<[minAgo: number, press: string, title?: string]>): NewsSample[] =>
  rows.map(([m, press, title], i) => ({ title: title ?? `김철수 기사 ${i}`, press, publishedAt: ago(m), link: `https://n.news.naver.com/a/${i}` }));

function windowOf(keywords: string[], publishMinAgo = 0): ShortentsWindow {
  const at = ago(publishMinAgo);
  return {
    publishTime: at, periodStart: at, periodEnd: at,
    items: keywords.map((keyword, i) => ({
      rank: i + 1, keyword, category: '엔터', isNew: false, summary: '', title: '', channel: '', articleUrl: '', searchUrl: '',
    })),
  };
}

describe('topicMatches — 후보와 숏텐츠 검색어 같은 소재 판정', () => {
  it('공백을 무시하고 한쪽이 다른 쪽을 포함하면 같은 소재다', () => {
    expect(topicMatches('김철수', '김철수 결혼 발표')).toBe(true);
    expect(topicMatches('김 철수 결혼', '김철수결혼')).toBe(true);
  });
  it('겹치지 않으면 다른 소재, 한 글자 검색어는 무엇과도 묶지 않는다', () => {
    expect(topicMatches('이영희', '김철수 결혼 발표')).toBe(false);
    expect(topicMatches('김', '김철수 결혼 발표')).toBe(false);
  });
  it('세 글자 이상 같은 낱말이 있거나 두 글자 낱말이 둘 이상 겹치면 같은 소재다(실측 2026-10-30 누락 사례)', () => {
    expect(topicMatches('스페인 고속열차 추돌', '스페인 고속열차 사고')).toBe(true);
    expect(topicMatches('최불암 선생님 영원한 아버지', '배우 최불암 별세')).toBe(true);
    expect(topicMatches('임형주, 최불암 추모 병문안', '배우 최불암 별세')).toBe(true);
    expect(topicMatches('서울 아파트', '서울 아파트 매매 약세')).toBe(true);
  });
  it('두 글자 낱말 하나만 겹치면 다른 소재다', () => {
    expect(topicMatches('인텔 주가', '엔비디아 주가 급등')).toBe(false);
  });
});

describe('measureCandidate — 뉴스 표본에서 센 사실만', () => {
  it('90분 안 기사 수 · 20분 안 기사 수 · 언론사 수 · 첫 기사 시각 · 단독 여부', () => {
    const c = measureCandidate('김철수', ['signal.bz'], news([
      [5, 'a.com', '[단독] 김철수 결혼'], [15, 'b.com'], [40, 'a.com'], [80, 'c.com'], [200, 'd.com'],
    ]), NOW);
    expect(c.articles90).toBe(4);
    expect(c.recent20).toBe(2);
    expect(c.press).toBe(3);
    expect(c.firstArticleAt).toBe(ago(80));
    expect(c.exclusive).toBe(true);
    expect(c.capped).toBe(false);
    expect(c.samples).toHaveLength(3);
    expect(c.samples[0].title).toBe('[단독] 김철수 결혼');
  });
  it('받은 기사가 전부 90분 안이면 더 있을 수 있음(capped)을 표시한다', () => {
    const c = measureCandidate('김철수', [], news([[1, 'a'], [2, 'b']]), NOW, 2);
    expect(c.capped).toBe(true);
  });
  it('시각을 모르는 기사는 세지 않는다', () => {
    const c = measureCandidate('x', [], [{ title: 't', press: 'a', publishedAt: null, link: '' }], NOW);
    expect(c.articles90).toBe(0);
    expect(c.firstArticleAt).toBeNull();
  });
  it('제목에 검색어 낱말이 없는 기사는 세지 않는다(본문에만 스친 넓은 말 부풀림 방지)', () => {
    const c = measureCandidate('배구', [], news([[5, 'a', '여자배구 지명 한파'], [6, 'b', '진주 선명여고 4명 프로행'], [7, 'c', '배구 개막']]), NOW);
    expect(c.articles90).toBe(2);
    expect(c.press).toBe(2);
  });
});

describe('selectUpcoming — 아직 숏텐츠에 없고 여러 언론사가 쓰기 시작한 것', () => {
  const base = { sources: [], firstArticleAt: null, exclusive: false, capped: false, samples: [] };
  const cands = [
    { ...base, keyword: '약한', articles90: 2, recent20: 2, press: 2 },
    { ...base, keyword: '김철수', articles90: 9, recent20: 3, press: 5 },
    { ...base, keyword: '이영희', articles90: 6, recent20: 5, press: 5 },
    { ...base, keyword: '단독언론', articles90: 8, recent20: 4, press: 1 },
    { ...base, keyword: '박민수', articles90: 20, recent20: 9, press: 9 },
  ];
  it('기사 3건·언론사 2곳 미만은 빼고, 지금 숏텐츠에 있는 소재도 뺀다', () => {
    const out = selectUpcoming(cands, windowOf(['박민수 은퇴 선언']));
    expect(out.map((c) => c.keyword)).toEqual(['이영희', '김철수']);
  });
  it('순서 = 언론사 수 → 20분 안 기사 수 → 90분 안 기사 수', () => {
    expect(selectUpcoming(cands, null).map((c) => c.keyword)).toEqual(['박민수', '이영희', '김철수']);
  });
  it('같은 소재 후보는 센 숫자가 큰 하나만 남긴다', () => {
    const dup = [
      { ...base, keyword: '진성준 비자 거부 미국 이익', articles90: 6, recent20: 2, press: 5 },
      { ...base, keyword: '진성준 비자 거부', articles90: 9, recent20: 3, press: 8 },
    ];
    expect(selectUpcoming(dup, null).map((c) => c.keyword)).toEqual(['진성준 비자 거부']);
  });
  it('입력 배열을 바꾸지 않는다', () => {
    const copy = JSON.stringify(cands);
    selectUpcoming(cands, null);
    expect(JSON.stringify(cands)).toBe(copy);
  });
});

describe('적중 장부', () => {
  it('새 후보만 기록하고 이미 열린(미적중) 후보는 다시 쌓지 않는다', () => {
    const l1 = recordFlags([], ['김철수', '이영희'], ago(30));
    const l2 = recordFlags(l1, ['김철수', '박민수'], ago(20));
    expect(l2.map((e) => e.keyword)).toEqual(['김철수', '이영희', '박민수']);
    expect(l2[0].flaggedAt).toBe(ago(30));
  });
  it('후보로 올린 뒤 숏텐츠에 뜨면 몇 분 먼저였는지 기록한다', () => {
    const ledger = recordFlags([], ['김철수', '이영희'], ago(40));
    const hit = markHits(ledger, windowOf(['김철수 결혼 발표'], 0));
    expect(hit[0]).toMatchObject({ hitKeyword: '김철수 결혼 발표', leadMin: 40 });
    expect(hit[1].hitAt).toBeNull();
  });
  it('후보로 올리기 전에 이미 뜬 창으로는 적중 처리하지 않는다', () => {
    const ledger = recordFlags([], ['김철수'], ago(10));
    expect(markHits(ledger, windowOf(['김철수 결혼'], 30))[0].hitAt).toBeNull();
  });
  it('7일 지난 기록은 버리고, 요약은 센 숫자(올린 수 · 적중 수 · 평균 선행 분)만', () => {
    const old: LedgerEntry = { keyword: '옛날', flaggedAt: ago(8 * 24 * 60), hitAt: null, hitKeyword: null, leadMin: null };
    const ledger = markHits(recordFlags([old], ['김철수', '이영희', '박민수'], ago(60)), windowOf(['김철수', '이영희 열애'], 0));
    const pruned = pruneLedger(ledger, NOW);
    expect(pruned.map((e) => e.keyword)).toEqual(['김철수', '이영희', '박민수']);
    expect(summarizeHits(pruned, NOW)).toMatchObject({ days: 7, flagged: 3, matched: 2, avgLeadMin: 60 });
  });
  it('적중이 없으면 평균은 null', () => {
    expect(summarizeHits(recordFlags([], ['a'], ago(5)), NOW).avgLeadMin).toBeNull();
  });
});

describe('buildUpcomingPublicPayload — 사이트 계약', () => {
  it('잰 후보가 하나도 없으면 null(빈 회차로 원격을 덮지 않는다)', () => {
    expect(buildUpcomingPublicPayload([], 0, summarizeHits([], NOW), ago(0))).toBeNull();
  });
  it('재 봤는데 통과가 0이면 빈 목록으로 발행한다(진짜 0건)', () => {
    const p = buildUpcomingPublicPayload([], 12, summarizeHits([], NOW), ago(0));
    expect(p).toMatchObject({ schemaVersion: 1, measured: 12, candidates: [] });
  });
});

describe('runUpcomingCycle — 주입받는 한 회차', () => {
  const state = () => ({ ledger: [] as LedgerEntry[] });
  it('후보 수집 → 뉴스 실측 → 선별 → 장부 → 발행, 실패한 후보는 건너뛴다', async () => {
    let saved: { ledger: LedgerEntry[] } | null = null;
    let published: any = null;
    const result = await runUpcomingCycle({
      fetchCandidates: async () => [{ keyword: '김철수', sources: ['signal.bz'] }, { keyword: '고장', sources: ['nate'] }, { keyword: '조용', sources: ['daum'] }],
      fetchNews: async (k) => {
        if (k === '고장') throw new Error('boom');
        if (k === '조용') return news([[300, 'a.com']]);
        return news([[5, 'a.com'], [10, 'b.com'], [30, 'c.com']]);
      },
      latestWindow: () => windowOf(['다른 소재']),
      readState: state,
      writeState: (s) => { saved = s; },
      publish: async (p) => { published = p; return { status: 'published', reason: 'ok' }; },
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: 'collected', measured: 2, candidates: 1 });
    expect(published.candidates.map((c: any) => c.keyword)).toEqual(['김철수']);
    expect(saved!.ledger.map((e) => e.keyword)).toEqual(['김철수']);
  });
  it('후보 목록을 못 받으면 실패로 돌려주고 던지지 않는다', async () => {
    const result = await runUpcomingCycle({
      fetchCandidates: async () => { throw new Error('down'); },
      fetchNews: async () => [], latestWindow: () => null, readState: state, writeState: () => {},
      publish: async () => ({ status: 'skipped', reason: 'x' }), now: () => NOW,
    });
    expect(result.status).toBe('failed');
  });
});

describe('publishShortentsUpcoming', () => {
  const sha = 'c'.repeat(40);
  const build = (at: string) => buildUpcomingPublicPayload([], 5, summarizeHits([], NOW), at)!;
  const encoded = (value: unknown) => JSON.stringify({ sha, size: JSON.stringify(value).length, encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
  function harness(remote: unknown | 404, isOwner = true) {
    const gh = vi.fn(async (args: string[], _input?: string) => {
      if (args.includes('PUT')) return '{}';
      if (remote === 404) { const e: any = new Error('github_request_failed'); e.status = 404; throw e; }
      return encoded(remote);
    });
    return { gh, deps: { isOwner: async () => isOwner, gh } };
  }
  const puts = (gh: ReturnType<typeof vi.fn>) => gh.mock.calls.filter(([args]) => args.includes('PUT'));

  it('주인 PC 가 아니면 gh 를 부르지도 않는다', async () => {
    const h = harness(404, false);
    expect(await publishShortentsUpcoming(build(ago(0)), h.deps)).toEqual({ status: 'skipped', reason: 'not_owner_pc' });
    expect(h.gh).not.toHaveBeenCalled();
  });
  it('측정 실패 회차(null)로는 덮지 않는다', async () => {
    const h = harness(404);
    expect(await publishShortentsUpcoming(null, h.deps)).toEqual({ status: 'skipped', reason: 'nothing_measured' });
    expect(h.gh).not.toHaveBeenCalled();
  });
  it('원격이 더 최근이면 덮지 않고, 내용이 같으면(builtAt 만 다르면) 커밋하지 않는다', async () => {
    const newer = harness(build(ago(-5)));
    expect(await publishShortentsUpcoming(build(ago(0)), newer.deps)).toMatchObject({ reason: 'newer_remote' });
    const same = harness(build(ago(10)));
    expect(await publishShortentsUpcoming(build(ago(0)), same.deps)).toMatchObject({ reason: 'already_published' });
    expect(puts(newer.gh).length + puts(same.gh).length).toBe(0);
  });
  it('새 파일이면 정해진 경로에 올린다', async () => {
    const h = harness(404);
    expect(await publishShortentsUpcoming(build(ago(0)), h.deps)).toEqual({ status: 'published', reason: 'upcoming_published' });
    const [[args, input]] = puts(h.gh);
    expect(args.find((a: string) => a.includes('contents'))).toBe('repos/cd000242-sudo/naver/contents/spa/public/data/shortents-upcoming.json');
    expect(JSON.parse(Buffer.from(JSON.parse(input!).content, 'base64').toString('utf8'))).toMatchObject({ schemaVersion: 1, measured: 5 });
  });
});
