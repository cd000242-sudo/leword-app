import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord } from '../advisor/daily-summary';
import type { TodayKeywordRow } from '../advisor/today-plan';
import {
  TODAY_TITLES_PER_KEYWORD,
  TODAY_TITLE_ASK,
  buildTodayTitlePrompt,
  cardsForTodayKeywords,
  collectTodayTitles,
} from '../advisor/today-titles';

/**
 * 제목 20 — 키워드당 2개. 에이전트 CLI 가 짓고 홈판 교리 검사(checkBenchmarkTitle)가 거른다.
 * 미통과면 그 키워드는 빈 칸이다. 규칙 템플릿으로 채우지 않는다. 엔진이 없으면 사실 한 줄.
 */
const record = {
  posts: [
    { contentId: 'p1', title: '엔진오일 경고등이 잠깐 떴다 사라졌다? 그냥 넘기면 안 되는 경우', views: 8, publishedAt: '2026-09-27T08:20:00.000Z', homefeed: { count: 7, ratio: 0.88 }, searchCount: 0 },
    { contentId: 'p2', title: '투싼 방향지시등 이유가 있다', views: 4, publishedAt: '2026-09-26T15:48:00.000Z', homefeed: null, searchCount: null },
  ],
  homefeedTitles: [{ title: '테슬라 모델Y 주니퍼 실구매 후기', url: 'u1' }, { title: '엔진오일 5000km 마다? 정비사 말', url: 'u2' }],
} as unknown as AdvisorDailyRecord;

const row = (keyword: string, over: Partial<TodayKeywordRow> = {}): TodayKeywordRow => ({
  keyword, topic: '자동차', evidence: ['popularWeek'], rankChange: null,
  myPosts: { count: 0, homefeedHits: 0, unmeasured: 0 }, homefeedTitleMatches: 0, searchVolume: null, seat: null, ...over,
});

describe('cardsForTodayKeywords — 재료는 내 글 제목·오늘 홈판 제목 중 그 말이 든 것만', () => {
  const cards = cardsForTodayKeywords([row('엔진오일 교환주기'), row('운전면허증 갱신')], record);

  it('id 는 키워드 그대로, 분야는 주제, 재료는 어절 매칭 사실', () => {
    expect(cards[0]).toMatchObject({ id: '엔진오일 교환주기', keyword: '엔진오일 교환주기', category: '자동차' });
    expect(cards[0].summary).toContain('엔진오일 경고등');
    expect(cards[0].sourceTitles).toEqual(['엔진오일 경고등이 잠깐 떴다 사라졌다? 그냥 넘기면 안 되는 경우', '엔진오일 5000km 마다? 정비사 말']);
    expect(cards[1].summary).toBe('');
    expect(cards[1].sourceTitles).toEqual([]);
  });
});

describe('buildTodayTitlePrompt', () => {
  it('키워드마다 청하는 개수·쉼표 금지·앵커 예시가 실린다', () => {
    const prompt = buildTodayTitlePrompt(cardsForTodayKeywords([row('테슬라 모델y')], record));
    expect(prompt).toContain('테슬라 모델y');
    expect(prompt).toContain(`${TODAY_TITLE_ASK}개`);
    expect(prompt).toContain('쉼표');
    expect(prompt).toContain('이러니까 바로 풀리네요');
    expect(TODAY_TITLES_PER_KEYWORD).toBe(2);
  });
});

describe('collectTodayTitles', () => {
  const cards = cardsForTodayKeywords([row('엔진오일 교환주기'), row('투싼')], record);

  it('통과한 것만 키워드당 2개, 떨어진 이유는 남긴다, 안 준 키워드는 빈 칸', async () => {
    const reply = JSON.stringify([
      { id: '엔진오일 교환주기', titles: [
        '엔진오일 교환주기 지키고도 이 소리가 나더라고요',
        '엔진오일 교환주기, 정비사가 말리던 이유',           // 쉼표 이분법
        '엔진오일 교환주기 총정리',                            // 상투구
        '엔진오일 교환주기 앞당긴 뒤 계기판이 달라졌네요',
        '엔진오일 교환주기 놓친 차가 먼저 보이는 신호였대요',
      ] },
    ]);
    const out = await collectTodayTitles(cards, async () => ({ reply, provider: 'claude' }));
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.provider).toBe('claude');
    expect(out.items).toEqual([
      {
        keyword: '엔진오일 교환주기',
        titles: ['엔진오일 교환주기 지키고도 이 소리가 나더라고요', '엔진오일 교환주기 앞당긴 뒤 계기판이 달라졌네요'],
        rejected: [
          { title: '엔진오일 교환주기, 정비사가 말리던 이유', reasons: ['COMMA_SPLIT'] },
          { title: '엔진오일 교환주기 총정리', reasons: ['CLICHE'] },
        ],
      },
      { keyword: '투싼', titles: [], rejected: [] },
    ]);
  });

  it('엔진이 없거나 실패하면 사실 한 줄만 — 템플릿으로 채우지 않는다', async () => {
    const out = await collectTodayTitles(cards, async () => { throw new Error('claude CLI 를 찾지 못했습니다'); });
    expect(out).toEqual({ status: 'no-engine', reason: 'claude CLI 를 찾지 못했습니다' });
  });

  it('카드가 없으면 부르지도 않는다', async () => {
    let called = 0;
    const out = await collectTodayTitles([], async () => { called += 1; return { reply: '[]', provider: 'x' }; });
    expect(called).toBe(0);
    expect(out).toEqual({ status: 'ok', provider: null, items: [] });
  });
});
