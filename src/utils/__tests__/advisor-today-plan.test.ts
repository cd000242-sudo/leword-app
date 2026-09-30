import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord } from '../advisor/daily-summary';
import {
  keywordWords,
  rankTodayKeywords,
  todayKeywordCandidates,
  todayTimeFacts,
  type TodayKeywordRow,
} from '../advisor/today-plan';

/**
 * D 판 '오늘 쓸 글 10' — 후보는 어드바이저 하루 기록에서만 나오고, 순위는 실측(자리·검색량)과 근거 개수로만 매긴다.
 * 확률·예상 트래픽은 어디에도 없다. 근거는 "어느 창구가 가리켰나"의 이름 목록이다.
 */
function record(over: Partial<AdvisorDailyRecord> = {}): AdvisorDailyRecord {
  return {
    day: '2026-09-29',
    collectedAt: '2026-09-30T03:43:00.000Z',
    channelId: 'leadernam-',
    posts: [
      { contentId: 'p1', title: '엔진오일 경고등이 잠깐 떴다 사라졌다? 그냥 넘기면 안 되는 경우', views: 8, publishedAt: '2026-09-27T08:20:00.000Z', homefeed: { count: 7, ratio: 0.88 }, searchCount: 0 },
      { contentId: 'p2', title: '투싼 방향지시등 이유가 있다', views: 4, publishedAt: '2026-09-26T15:48:00.000Z', homefeed: { count: 0, ratio: 0 }, searchCount: 1 },
      { contentId: 'p3', title: '엔진오일 교환 뒤 연비가 떨어졌다?', views: 6, publishedAt: '2026-09-28T05:50:00.000Z', homefeed: null, searchCount: null },
    ],
    topicsDay: [{ topic: '자동차', value: 64 }],
    topicsWeek: [{ topic: '자동차', value: 187 }],
    myHours: [
      { hour: 20, yesterday: 7, dayBefore: 1, monthAverage: 4.2 },
      { hour: 13, yesterday: 6, dayBefore: 2, monthAverage: 5 },
      { hour: 9, yesterday: 0, dayBefore: 0, monthAverage: 6.1 },
    ],
    topicHours: [{ topic: '자동차', hours: [{ hour: 11, ratio: 0.055 }, { hour: 12, ratio: 0.054 }, { hour: 3, ratio: 0.01 }] }],
    popularKeywords: { topic: '자동차', items: [{ keyword: '투싼', ratio: 1 }, { keyword: '테슬라 모델y', ratio: 0.8 }, { keyword: '운전면허증 갱신', ratio: 0.5 }] },
    topicKeywords: [
      { topic: '자동차', keyword: '테슬라 모델Y', rank: 2, rankChange: 2 },
      { topic: '자동차', keyword: '뷰익 일렉트라 E7', rank: 4, rankChange: 17 },
      { topic: '자동차', keyword: '투싼', rank: 7, rankChange: -2 },
      { topic: '자동차', keyword: '엔진오일 교환주기', rank: 15, rankChange: null },
    ],
    homefeedTitles: [{ title: '테슬라 모델Y 주니퍼 실구매 후기', url: 'u1' }, { title: '엔진오일 5000km 마다? 정비사 말', url: 'u2' }],
    weeklyRecommendation: null,
    categoryComparison: [{ group: '취미', topic: '자동차', value: 31, averageDuration: 1 }],
    soaring: [],
    adImpressions: [],
    missing: [],
    ...over,
  };
}

describe('후보 — 인기 검색어 ∪ 주제 검색어, 같은 말은 하나로', () => {
  const rows = todayKeywordCandidates(record());
  const by = Object.fromEntries(rows.map((r) => [r.keyword, r]));

  it('대소문자·공백만 다른 말은 한 후보이고 근거 창구 이름이 합쳐진다', () => {
    expect(rows.map((r) => r.keyword)).toEqual(['투싼', '테슬라 모델y', '운전면허증 갱신', '뷰익 일렉트라 E7', '엔진오일 교환주기']);
    expect(by['테슬라 모델y'].evidence).toEqual(['popularWeek', 'trendDay', 'risingDay', 'myTopic', 'homefeedTitle']);
    expect(by['테슬라 모델y'].rankChange).toBe(2);
    expect(by['투싼'].evidence).toEqual(['popularWeek', 'trendDay', 'myTopic', 'myPost']);
    expect(by['투싼'].rankChange).toBe(-2);
  });

  it('내 글 매칭은 어절 포함 사실만 — 든 편수·그중 홈판 탄 편수', () => {
    expect(by['엔진오일 교환주기'].myPosts).toEqual({ count: 2, homefeedHits: 1, unmeasured: 1 });
    expect(by['엔진오일 교환주기'].evidence).toContain('myPost');
    expect(by['운전면허증 갱신'].myPosts).toEqual({ count: 0, homefeedHits: 0, unmeasured: 0 });
    expect(by['엔진오일 교환주기'].homefeedTitleMatches).toBe(1);
  });

  it('주제 기록이 없으면 빈 후보', () => {
    expect(todayKeywordCandidates(record({ popularKeywords: null, topicKeywords: [] }))).toEqual([]);
  });

  it('어절은 두 글자 이상만, 기호를 뗀 소문자', () => {
    expect(keywordWords('테슬라 모델Y')).toEqual(['테슬라', '모델y']);
    expect(keywordWords('2027 투싼')).toEqual(['2027', '투싼']);
  });
});

describe('순위 — 실측 자리가 열린 것 → 근거 많은 것 → 검색량 큰 것, 미측정은 뒤', () => {
  const base = (keyword: string, over: Partial<TodayKeywordRow>): TodayKeywordRow => ({
    keyword, topic: '자동차', evidence: ['popularWeek'], rankChange: null,
    myPosts: { count: 0, homefeedHits: 0, unmeasured: 0 }, homefeedTitleMatches: 0,
    searchVolume: null, seat: null, ...over,
  });
  const rows = [
    base('a-잠김-근거3', { evidence: ['popularWeek', 'trendDay', 'risingDay'], searchVolume: 9000, seat: { verdict: '잠김', facing: 9, vacancy: null, sampled: 10 } }),
    base('b-열림-근거1', { searchVolume: 300, seat: { verdict: '열림', facing: 2, vacancy: 3, sampled: 10 } }),
    base('c-열림-근거2', { evidence: ['popularWeek', 'trendDay'], searchVolume: 200, seat: { verdict: '열림', facing: 1, vacancy: 4, sampled: 10 } }),
    base('d-미측정', { evidence: ['popularWeek', 'trendDay', 'risingDay', 'myTopic'], searchVolume: null, seat: null }),
    base('e-열림-근거2-검색량큼', { evidence: ['popularWeek', 'risingDay'], searchVolume: 5000, seat: { verdict: '열림', facing: 3, vacancy: 2, sampled: 10 } }),
    base('f-반열림-근거1', { searchVolume: 700, seat: { verdict: '반열림', facing: 4, vacancy: 6, sampled: 10 } }),
    base('g-카드답', { evidence: ['popularWeek', 'trendDay', 'risingDay', 'myTopic', 'myPost'], searchVolume: 30000, seat: { verdict: '카드답', facing: 0, vacancy: 1, sampled: 10 } }),
  ];

  it('열림 → 반열림 → 잠김·카드답 → 미측정, 같은 칸 안에선 근거 개수 그다음 검색량', () => {
    expect(rankTodayKeywords(rows, 10).map((r) => r.keyword)).toEqual([
      'e-열림-근거2-검색량큼', 'c-열림-근거2', 'b-열림-근거1', 'f-반열림-근거1', 'g-카드답', 'a-잠김-근거3', 'd-미측정',
    ]);
  });

  it('상한을 지키고 원본을 바꾸지 않는다', () => {
    const before = rows.map((r) => r.keyword);
    expect(rankTodayKeywords(rows, 2).map((r) => r.keyword)).toEqual(['e-열림-근거2-검색량큼', 'c-열림-근거2']);
    expect(rows.map((r) => r.keyword)).toEqual(before);
  });
});

describe('시간대 사실 — 내 유입·주제 독자·홈판 탄 내 글 발행 시, 지어내는 규칙 없음', () => {
  it('세 줄을 실측 그대로, 홈판 패턴이 없으면 그 줄은 null', () => {
    const facts = todayTimeFacts(record(), { daysMeasured: 1, daysWithHomefeed: 0, hours: [], postsPerDay: [], gapsMinutes: [] });
    expect(facts.myHoursYesterday).toEqual([{ hour: 20, value: 7 }, { hour: 13, value: 6 }]);
    expect(facts.myHoursMonth).toEqual([{ hour: 9, value: 6.1 }, { hour: 13, value: 5 }, { hour: 20, value: 4.2 }]);
    expect(facts.topicHours).toEqual({ topic: '자동차', hours: [{ hour: 11, value: 0.055 }, { hour: 12, value: 0.054 }, { hour: 3, value: 0.01 }] });
    expect(facts.homefeedPublish).toBeNull();
  });

  it('홈판 탄 날 패턴이 있으면 발행 시·편수·간격을 그대로 옮긴다', () => {
    const facts = todayTimeFacts(record(), { daysMeasured: 3, daysWithHomefeed: 2, hours: [{ hour: 7, posts: 2 }, { hour: 19, posts: 1 }], postsPerDay: [2, 1], gapsMinutes: [750] });
    expect(facts.homefeedPublish).toEqual({ daysWithHomefeed: 2, daysMeasured: 3, hours: [{ hour: 7, posts: 2 }, { hour: 19, posts: 1 }], postsPerDay: [2, 1], gapsMinutes: [750] });
  });
});
