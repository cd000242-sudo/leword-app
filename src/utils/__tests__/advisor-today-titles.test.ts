import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord } from '../advisor/daily-summary';
import type { TodayKeywordRow } from '../advisor/today-plan';
import type { IssueContext } from '../issue-context';
import {
  TODAY_NO_FACTS_NOTE,
  TODAY_TITLES_PER_KEYWORD,
  TODAY_TITLE_ASK,
  buildTodayTitlePrompt,
  cardsForTodayKeywords,
  collectTodayTitles,
  factsFromContexts,
  type TodayTitleFacts,
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

/**
 * 사실 재료(2026-09-30 두 번째 판) — 첫 판 20개가 전부 "반응이 갈리네요 · 이유가 있네요" 껍데기에 "~네요/~고요" 통일이었다.
 * 원인은 재료 부재(내 옛 제목·홈판 제목뿐, 그것도 '따라 쓰지 마라'). 키워드마다 실측 사실을 넣고, 없으면 비워 둔다.
 */
const facts = new Map<string, TodayTitleFacts>([
  ['엔진오일 교환주기', {
    autocomplete: ['엔진오일 교환주기 km', '엔진오일 교환주기 1년'],
    related: ['엔진오일 경고등', '합성유 교환주기'],
    headlines: ['정비사가 말하는 엔진오일 교환주기 1만km 논쟁'],
  }],
  ['투싼', { autocomplete: [], related: [], headlines: [] }],
]);

describe('cardsForTodayKeywords + facts — 붙여 묻는 말·뉴스 제목이 재료가 되고, 키워드 자신은 뺀다', () => {
  it('재료를 주면 relatedKeywords·facts 가 차고, 재료 없는 키워드는 둘 다 빈 배열(facts 정의됨)', () => {
    const cards = cardsForTodayKeywords([row('엔진오일 교환주기'), row('투싼'), row('운전면허증 갱신')], record, facts);
    expect(cards[0].relatedKeywords).toEqual(['엔진오일 교환주기 km', '엔진오일 교환주기 1년', '엔진오일 경고등', '합성유 교환주기']);
    expect(cards[0].facts).toEqual(['정비사가 말하는 엔진오일 교환주기 1만km 논쟁']);
    expect(cards[1]).toMatchObject({ relatedKeywords: [], facts: [] });
    expect(cards[2]).toMatchObject({ relatedKeywords: [], facts: [] });
  });
  it('재료 Map 을 안 주면 옛 동작 — facts 없음(서브 검사 꺼짐)', () => {
    const cards = cardsForTodayKeywords([row('엔진오일 교환주기')], record);
    expect(cards[0].facts).toBeUndefined();
  });
  it('issue-context 결과 → 키워드별 재료(상한·자기 자신 제외)', () => {
    const contexts: IssueContext[] = [{
      issue: '엔진오일 교환주기',
      headlines: Array.from({ length: 7 }, (_, i) => ({ title: `기사 ${i}`, press: null, publishedAt: null, link: `l${i}` })),
      autocomplete: ['엔진오일 교환주기', '엔진오일 교환주기 km', '엔진오일  교환주기 km', ...Array.from({ length: 9 }, (_, i) => `자동완성 ${i}`)],
      related: [{ keyword: '엔진오일 경고등', monthlyVolume: 300 }, { keyword: '엔진오일교환주기', monthlyVolume: 10 }],
    }];
    const out = factsFromContexts(contexts).get('엔진오일 교환주기')!;
    expect(out.headlines).toHaveLength(5);
    expect(out.autocomplete).toHaveLength(8);
    expect(out.autocomplete[0]).toBe('엔진오일 교환주기 km');
    expect(out.autocomplete).not.toContain('엔진오일 교환주기');
    expect(out.related).toEqual(['엔진오일 경고등']);
  });
});

describe('buildTodayTitlePrompt + facts', () => {
  it('붙여 묻는 말·뉴스 제목을 싣고, 재료가 제목에 보여야 한다고 못 박는다', () => {
    const prompt = buildTodayTitlePrompt(cardsForTodayKeywords([row('엔진오일 교환주기')], record, facts));
    expect(prompt).toContain('사람들이 붙여 묻는 말(이 중 하나가 제목에 보여야 한다): 엔진오일 교환주기 km / 엔진오일 교환주기 1년 / 엔진오일 경고등 / 합성유 교환주기');
    expect(prompt).toContain('최근 뉴스 제목(상황·숫자만 빌리고 문장은 따라 쓰지 마라): 1. 정비사가 말하는 엔진오일 교환주기 1만km 논쟁');
    expect(prompt).toContain('껍데기 후킹 금지');
    expect(prompt).toContain('같은 끝맺음 3개 넘게 반복 금지');
    expect(prompt).not.toContain('④ 사람 냄새(~네요');
  });
});

describe('collectTodayTitles + facts', () => {
  it('재료 없는 키워드는 청하지 않고 빈 칸 + 사유, 재료 없는 말이 든 제목은 NO_SUB, 껍데기는 HOLLOW_HOOK', async () => {
    const cards = cardsForTodayKeywords([row('엔진오일 교환주기'), row('투싼')], record, facts);
    let prompt = '';
    const reply = JSON.stringify([
      { id: '엔진오일 교환주기', titles: [
        '엔진오일 교환주기 두고 반응이 갈리네요',                 // 껍데기
        '엔진오일 교환주기 지키고도 이 소리가 나더라고요',          // 재료 없음
        '엔진오일 교환주기 1만km 얘기에 정비사가 고개를 젓던 순간',
        '엔진오일 경고등 켜지기 전에 먼저 오는 신호',
      ] },
      { id: '투싼', titles: ['투싼 타 보니 다르네요'] },
    ]);
    const out = await collectTodayTitles(cards, async (p) => { prompt = p; return { reply, provider: 'claude' }; });
    expect(prompt).toContain('id: 엔진오일 교환주기');
    expect(prompt).not.toContain('id: 투싼');
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.items[0].titles).toEqual(['엔진오일 교환주기 1만km 얘기에 정비사가 고개를 젓던 순간', '엔진오일 경고등 켜지기 전에 먼저 오는 신호']);
    expect(out.items[0].rejected).toEqual([
      { title: '엔진오일 교환주기 두고 반응이 갈리네요', reasons: ['HOLLOW_HOOK', 'NO_SUB'] },
      { title: '엔진오일 교환주기 지키고도 이 소리가 나더라고요', reasons: ['NO_SUB'] },
    ]);
    expect(out.items[1]).toEqual({ keyword: '투싼', titles: [], rejected: [], note: TODAY_NO_FACTS_NOTE });
  });

  it('재료 있는 카드가 하나도 없으면 엔진을 안 부르고 전부 빈 칸 + 사유', async () => {
    let called = 0;
    const out = await collectTodayTitles(cardsForTodayKeywords([row('투싼')], record, facts), async () => { called += 1; return { reply: '[]', provider: 'x' }; });
    expect(called).toBe(0);
    expect(out).toEqual({ status: 'ok', provider: null, items: [{ keyword: '투싼', titles: [], rejected: [], note: TODAY_NO_FACTS_NOTE }] });
  });

  it('판 전체에서 같은 끝맺음은 3개까지 — 4번째는 ENDING_REPEAT 로 밀리고 다른 후보가 자리를 채운다', async () => {
    const keywords = ['키워드 하나', '키워드 둘', '키워드 셋', '키워드 넷'];
    const many = new Map<string, TodayTitleFacts>(keywords.map((k) => [k, { autocomplete: [`${k} 조건`], related: [], headlines: [] }]));
    const cards = cardsForTodayKeywords(keywords.map((k) => row(k)), record, many);
    const tails = ['것은 뭘까', '것', '이유', '자리'];
    const reply = JSON.stringify(keywords.map((k, i) => ({ id: k, titles: [`${k} 조건 맞춰 봤더니 생각보다 다르더라고요`, `${k} 조건 바뀐 뒤에 남는 ${tails[i]}`] })));
    const out = await collectTodayTitles(cards, async () => ({ reply, provider: 'claude' }));
    if (out.status !== 'ok') throw new Error(out.reason);
    expect(out.items.slice(0, 3).map((item) => item.titles.length)).toEqual([2, 2, 2]);
    expect(out.items[3].titles).toEqual(['키워드 넷 조건 바뀐 뒤에 남는 자리']);
    expect(out.items[3].rejected).toEqual([{ title: '키워드 넷 조건 맞춰 봤더니 생각보다 다르더라고요', reasons: ['ENDING_REPEAT'] }]);
  });
});
