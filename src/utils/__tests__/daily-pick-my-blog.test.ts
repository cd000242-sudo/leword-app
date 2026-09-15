import { describe, expect, it } from 'vitest';
import { type WonRow } from '../blog-class/envelope';
import { buildProfile } from '../blog-class/my-blog-lane';
import { findFromMyBlog, gateWithStats, MY_BLOG_FIRST, type Candidate, type MyBlogDeps, type PickSource } from '../../main/handlers/daily-pick';

/**
 * 오늘 쓸 한 편이 내 블로그에서 찾는다(2026-09-15).
 *
 * 사장님 "내 블로그 주소랑 지금 현재 내 블로그가 얼마나 최적화되어있는지를 알아야지
 * 오늘 것 고르기에서 너가 키워드를 찾아줄 수 있지 않니".
 * 9-14 회차(사장님 PC 기록): 모은 459 → 거른 뒤 450 → 세운 것 'kaist 서울캠퍼스'·'kaist 입학처'.
 * 블로그 주제는 인테리어·DIY, 순위를 잰 말 62개 중 1~10위 2 · 11~30위 12.
 */
const r = (keyword: string, blogRank: number | null, searchVolume: number | null): WonRow => ({
  keyword, blogRank, searchVolume, documentCount: null, facing: null, topic: '인테리어·DIY',
});
const measured: WonRow[] = [
  r('베란다 청소 방법', 7, 90), r('타일 바닥 청소', 10, 300), r('거실 청소', 14, 60),
  r('나연 혀클리너', 16, 3610), r('제습기 연속배수', 19, 560), r('현관 청소', 29, 420),
  r('옥수수 삶는법', null, 99710),
];
const profile = buildProfile({ wonRows: measured, snapshot: { declaredTopic: '인테리어·DIY' } })!;
const c = (keyword: string, source: PickSource, over: Partial<Candidate> = {}): Candidate => ({
  keyword, source, topic: '', searchVolume: 900, documentCount: null, facing: null, vacancy: null,
  titles: [], related: [], why: '', facts: [], ...over,
});

describe('여섯 판 후보는 내 블로그와 겹치는 것만', () => {
  it('9-14 회차가 세운 kaist 입학처는 인테리어·DIY 블로그에서 빠진다', () => {
    const stats = gateWithStats(
      [c('kaist 입학처', '실시간 틈새'), c('kaist 서울캠퍼스', '실시간 틈새'), c('욕실 청소 세제', '실시간 틈새')],
      profile, new Set(),
    );
    expect(stats.gated.map((g) => g.candidate.keyword)).toEqual(['욕실 청소 세제']);
    expect(stats.offTopic).toBe(2);
  });

  it('대표 주제가 같으면 낱말이 안 겹쳐도 남긴다 — 사장님이 고른 주제가 근거다', () => {
    const stats = gateWithStats([c('로만쉐이드 설치', '추천키워드', { topic: '인테리어·DIY' })], profile, new Set());
    expect(stats.gated).toHaveLength(1);
    expect(stats.gated[0].myTopic).toBe(true);
  });

  it('검색량이 붙어 본 범위 밖이면 뺀다 — 에이스침대(100,500)는 범위(100~3,610) 밖', () => {
    const stats = gateWithStats([c('에이스침대', '추천키워드', { topic: '인테리어·DIY', searchVolume: 100500 })], profile, new Set());
    expect(stats.gated).toHaveLength(0);
    expect(stats.outOfBand).toBe(1);
  });

  it('내가 이미 순위를 잰 말(= 이미 쓴 글의 말)은 오늘 쓸 것에서 뺀다', () => {
    const stats = gateWithStats([c('타일 바닥 청소', '선점 보드', { topic: '인테리어·DIY' })], profile, new Set());
    expect(stats.gated).toHaveLength(0);
    expect(stats.alreadyMine).toBe(1);
  });

  it('내 블로그 판이 자리 잴 앞칸을 먼저 쓴다 — 너에게 맞춰 찾은 말이 먼저다', () => {
    const mine = Array.from({ length: 12 }, (_, i) => c(`욕실청소${i}`, '내 블로그'));
    const board = Array.from({ length: 6 }, (_, i) => c(`현관 청소 ${i}번`, '선점 보드', { titles: [{ label: '검색', text: 'x' }] }));
    const head = gateWithStats([...board, ...mine], profile, new Set()).gated.slice(0, 14);
    expect(head.slice(0, MY_BLOG_FIRST).every((g) => g.candidate.source === '내 블로그')).toBe(true);
    expect(head.slice(MY_BLOG_FIRST).every((g) => g.candidate.source === '선점 보드')).toBe(true);
  });

  it('블로그를 안 쟀으면 예전과 같다 — 거르지 않고 판마다 나눠 쓴다', () => {
    const stats = gateWithStats([c('kaist 입학처', '실시간 틈새'), c('아무 말', '오늘의 글감')], null, new Set());
    expect(stats.gated).toHaveLength(2);
    expect(stats.offTopic).toBe(0);
    expect(stats.gated[0].fitReason).toBe('아직 내 블로그를 안 재서 견줄 게 없어요');
  });
});

type FakeDeps = MyBlogDeps & { calls: string[] };

const fakeDeps = (overrides: Partial<MyBlogDeps> = {}): FakeDeps => {
  const calls: string[] = [];
  const base: FakeDeps = {
    calls,
    suggest: async (seed) => {
      calls.push(`suggest:${seed}`);
      if (seed === '베란다 청소 방법') return [{ keyword: '베란다청소방법', searchVolume: 90 }];
      if (seed === '베란다 청소') return [{ keyword: '베란다청소업체', searchVolume: 1200 }, { keyword: '베란다곰팡이', searchVolume: 2400 }];
      if (seed === '타일 바닥 청소') {
        return [
          { keyword: '화장실바닥청소', searchVolume: 1640 },
          { keyword: '바닥청소세제', searchVolume: 1480 },
          { keyword: '타일바닥', searchVolume: 12000 },
        ];
      }
      return [];
    },
    autocomplete: async (seed) => {
      calls.push(`auto:${seed}`);
      return seed === '타일 바닥' ? ['타일 바닥 청소 세제', '타일 바닥 청소 방법'] : [];
    },
    volumes: async (keywords) => {
      calls.push(`volumes:${keywords.length}`);
      return new Map(keywords.map((k) => [k.replace(/\s+/g, '').toLowerCase(), k.includes('세제') ? 880 : 5000] as [string, number]));
    },
  };
  return { ...base, ...overrides };
};

describe('내 블로그 판 — 30위 안에 붙어 본 말에서 넓혀 찾는다', () => {
  it('가까운 씨앗부터 연관어로 넓히고, 긴 씨앗은 짧게 줄여 한 번 더 묻는다', async () => {
    const deps = fakeDeps();
    const got = await findFromMyBlog(measured, profile, deps);
    expect(got.seeds).toBe(6);
    expect(deps.calls).toContain('suggest:베란다 청소');
    expect(got.candidates.map((x) => x.keyword)).toEqual(['베란다곰팡이', '화장실바닥청소', '베란다청소업체', '바닥청소세제', '타일 바닥 청소 세제']);
  });

  it('자동완성 말은 검색량을 따로 재서 범위 안인 것만 남긴다', async () => {
    const deps = fakeDeps();
    const got = await findFromMyBlog(measured, profile, deps);
    expect(deps.calls).toContain('volumes:2');
    expect(got.candidates.some((x) => x.keyword === '타일 바닥 청소 방법')).toBe(false);
    const auto = got.candidates.find((x) => x.keyword === '타일 바닥 청소 세제')!;
    expect(auto.searchVolume).toBe(880);
    expect(auto.why).toBe("내 글이 10위였던 '타일 바닥 청소'에서 자동완성으로 찾은 말");
  });

  it('카드에 내 블로그 판·블로그 주제가 붙고, 경쟁 글 수는 지어내지 않는다', async () => {
    const got = await findFromMyBlog(measured, profile, fakeDeps());
    expect(got.candidates.length).toBeGreaterThan(0);
    for (const x of got.candidates) {
      expect(x.source).toBe('내 블로그');
      expect(x.topic).toBe('인테리어·DIY');
      expect(x.documentCount).toBeNull();
    }
  });

  it('범위가 없으면 찾지 않는다 — 기준 없이 넓히지 않는다', async () => {
    const far = [r('먼 말', null, 500)];
    const deps = fakeDeps();
    const got = await findFromMyBlog(far, buildProfile({ wonRows: far })!, deps);
    expect(got.candidates).toHaveLength(0);
    expect(deps.calls).toHaveLength(0);
  });

  it('연관어·자동완성이 실패해도 판 전체가 죽지 않는다', async () => {
    const deps = fakeDeps({
      suggest: async () => { throw new Error('429'); },
      autocomplete: async () => { throw new Error('timeout'); },
    });
    const got = await findFromMyBlog(measured, profile, deps);
    expect(got.candidates).toHaveLength(0);
    expect(got.seeds).toBe(6);
  });
});
