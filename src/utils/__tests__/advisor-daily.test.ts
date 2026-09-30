import { describe, expect, it } from 'vitest';
import {
  ADVISOR_DAILY_POST_CAP,
  ADVISOR_DAILY_TOPIC_CAP,
  ADVISOR_HOMEFEED_WEEK_DAYS,
  baseProbes,
  followUpProbes,
  lastCompletedWeekMonday,
  localDay,
  monthStart,
  yesterday,
} from '../advisor/daily-plan';
import { buildDailyRecord, homefeedDayPattern, pickBlogChannelId, type AdvisorDailyRecord } from '../advisor/daily-summary';

/**
 * 내 블로그 특화도 A 층 — 하루 1회 어드바이저 수집기의 순수 함수(2026-09-30 플랜 D).
 *
 * 창구 규칙은 전부 실측(2026-09-30, 93건)에서 왔다: week 는 월요일·month 는 1일, categories 는 한글 주제명,
 * 응답 parameters 에 계정 아이디(channel)가 실린다 → 저장 판엔 남기지 않는다.
 */
const TUE = new Date(2026, 8, 29, 6, 10); // 2026-09-29 화요일 06:10 (로컬)

describe('날짜 규칙 — 어드바이저가 400 을 내지 않는 날짜', () => {
  it('어제·이번 달 1일을 로컬 날짜로 만든다', () => {
    expect(localDay(TUE)).toBe('2026-09-29');
    expect(yesterday(TUE)).toBe('2026-09-28');
    expect(monthStart(TUE)).toBe('2026-09-01');
    expect(yesterday(new Date(2026, 9, 1, 5))).toBe('2026-09-30');
  });

  it('week 는 마지막으로 끝난 주의 월요일 — 화요일이면 지난주, 월요일이면 바로 전 주, 일요일엔 아직 지난주', () => {
    expect(lastCompletedWeekMonday(TUE)).toBe('2026-09-21');
    expect(lastCompletedWeekMonday(new Date(2026, 9, 5, 5))).toBe('2026-09-28'); // 월요일
    expect(lastCompletedWeekMonday(new Date(2026, 9, 4, 23))).toBe('2026-09-21'); // 일요일 — 이번 주는 아직 안 끝남
  });
});

describe('기본 창구 목록', () => {
  const probes = baseProbes({ channelId: 'leadernam-', now: TUE });
  const byKey = Object.fromEntries(probes.map((p) => [p.key, p.path]));

  it('실측으로 살아 있던 창구만, 날짜 규칙을 지켜 만든다', () => {
    expect(byKey.cvRanks).toBe('/integrated-analysis/cv-ranks?service=naver_blog&channelId=leadernam-&contentType=text&interval=day&date=2026-09-28&limit=50');
    expect(byKey.d1RanksDay).toContain('/integrated-analysis/d1-ranks?');
    expect(byKey.d1RanksDay).toContain('date=2026-09-28');
    expect(byKey.d1RanksWeek).toContain('interval=week&date=2026-09-21');
    expect(byKey.hourDistribution).toContain('/integrated-analysis/hour-distribution?');
    expect(byKey.popularCategoryKeyword).toBe('/home/popular-category-keyword?service=naver_blog&channelId=leadernam-&date=2026-09-21');
    expect(byKey.weeklyRecommendation).toBe('/home/weekly-recommendation?service=naver_blog&date=2026-09-21');
    expect(byKey.categoryComparison).toContain('/trend/category-comparison?');
    expect(byKey.soaringContents).toContain('/home/soaring-contents?');
    expect(byKey.mainInflowContentRanks).toBe('/trend/main-inflow-content-ranks?service=naver_blog&interval=day&date=2026-09-28');
    expect(byKey.impressionClickRanks).toContain('/revenue/impression-click-ranks?');
  });

  it('전체 홈판 상위 20 은 어제에 더해 그 전 6일도 받는다(오늘 쓸 글 본보기용 최근 7일) — 날짜마다 한 요청, 키에 날짜가 붙는다', () => {
    expect(ADVISOR_HOMEFEED_WEEK_DAYS).toBe(6);
    const days = ['2026-09-27', '2026-09-26', '2026-09-25', '2026-09-24', '2026-09-23', '2026-09-22'];
    for (const d of days) expect(byKey[`mainInflowContentRanks:${d}`]).toBe(`/trend/main-inflow-content-ranks?service=naver_blog&interval=day&date=${d}`);
    expect(probes.filter((p) => p.key.startsWith('mainInflowContentRanks:'))).toHaveLength(ADVISOR_HOMEFEED_WEEK_DAYS);
  });

  it('uv-count·visit-count 처럼 contentType 을 넣으면 400 나는 창구엔 안 넣고, 로그인 페이지는 절대 없다', () => {
    for (const p of probes) {
      expect(p.path.startsWith('/')).toBe(true);
      expect(p.path).not.toContain('nid.naver.com');
    }
    expect(probes.map((p) => p.key)).toHaveLength(new Set(probes.map((p) => p.key)).size);
  });
});

describe('후속 창구 — 기본 응답을 보고 정한다', () => {
  it('내 유입 주제는 한글 이름 그대로(코드 CAR 은 빈 결과), 상한 3 · 글별 홈판 실측은 상한 30', () => {
    const topics = ['자동차', '리빙', 'IT·컴퓨터', '요리·레시피'];
    const postIds = Array.from({ length: 40 }, (_, i) => `http://blog.naver.com/leadernam-/2244${String(i).padStart(4, '0')}`);
    const probes = followUpProbes({ channelId: 'leadernam-', now: TUE }, { topics, postIds });
    const trend = probes.filter((p) => p.key.startsWith('trendCategory:'));
    const hours = probes.filter((p) => p.key.startsWith('categoryHour:'));
    const posts = probes.filter((p) => p.key.startsWith('referrerDomain:'));
    expect(trend).toHaveLength(ADVISOR_DAILY_TOPIC_CAP);
    expect(hours).toHaveLength(ADVISOR_DAILY_TOPIC_CAP);
    expect(posts).toHaveLength(ADVISOR_DAILY_POST_CAP);
    expect(trend[0].path).toBe('/trend/category?service=naver_blog&categories=%EC%9E%90%EB%8F%99%EC%B0%A8&contentType=text&interval=day&date=2026-09-28&hasRankChange=true&limit=20');
    expect(posts[0].path).toContain('contentId=http%3A%2F%2Fblog.naver.com%2Fleadernam-%2F22440000');
    expect(posts[0].path).toContain('/inflow-analysis/referrer-domain?');
  });

  it('주제·글이 없으면 후속 창구도 없다 — 빈 값을 지어내지 않는다', () => {
    expect(followUpProbes({ channelId: 'leadernam-', now: TUE }, { topics: [], postIds: [] })).toEqual([]);
  });
});

const NID = 'tjdgus24280';
const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: JSON.stringify({ path: '/api/v6/x', parameters: { service: 'naver_blog', channel: NID }, data, ...extra }),
});
const POST_A = 'http://blog.naver.com/leadernam-/224425804695';
const POST_B = 'http://blog.naver.com/leadernam-/224422185507';

function sampleResults() {
  return {
    cvRanks: ok([
      { rank: 1, title: '펠리세이드 블랙잉크, 계약 전 캘리그래피와 가격 차이', metricValue: 25, contentId: POST_A, createdAt: Date.UTC(2026, 8, 28, 22, 21) },
      { rank: 2, title: '엔진오일 경고등이 잠깐 떴다 사라졌다?', metricValue: 8, contentId: POST_B, createdAt: Date.UTC(2026, 8, 25, 10, 0) },
    ]),
    d1RanksDay: ok([{ rank: 1, d1: '자동차', metricValue: 64 }]),
    d1RanksWeek: ok([{ rank: 1, d1: '자동차', metricValue: 300 }, { rank: 2, d1: '리빙', metricValue: 4 }]),
    hourDistribution: ok(
      [{ hour: '00', metrics: [2, 0, 3.67] }, { hour: '09', metrics: [1, 12, 4.29] }],
      { metricInfo: [{ name: 'selectedDay', date: '2026-09-28' }, { name: 'selectedDay-1', date: '2026-09-27' }, { name: 'prevMonthAverage', date: '2026-08-01' }] },
    ),
    popularCategoryKeyword: ok({ category: { id: '자동차', name: '자동차' }, trendRank: [{ keyword: '투싼', ratio: 0.0028 }, { keyword: '투싼 풀체인지', ratio: 0.0026 }] }),
    weeklyRecommendation: ok({ category: { category: '스포츠', contentRank: [{ channel: 'ehdwns3405', contentId: 'http://blog.naver.com/ehdwns3405/1', title: '"AI로 만든 줄 알았다" 외신까지 놀란 펜싱 국가대표', url: 'http://blog.naver.com/ehdwns3405/1' }] } }),
    categoryComparison: ok([{ id: '엔터테인먼트·예술', name: '엔터테인먼트·예술', categories: [{ id: '드라마', name: '드라마', metricValue: 12, averageDuration: 177398 }] }]),
    soaringContents: ok([{ title: '펠리세이드 블랙잉크, 계약 전 캘리그래피와 가격 차이', contentId: POST_A, rank: 1, metricValue: 25, metricDeltaValue: 20, createdAt: 1790653318020 }]),
    mainInflowContentRanks: ok([{ title: '’79세’ 윤여정, 조용히 전해진 소식… 눈물 바다', url: 'http://blog.naver.com/jungbo125/224416910697' }]),
    // 그 전 6일 — 응답 항목은 {title,url} 뿐이라 rank 는 순서에서 나온다. 하루는 못 받았고(429), 하루는 비었다.
    'mainInflowContentRanks:2026-09-27': ok([
      { title: '아이오닉9 리콜 통지서 받고 서비스센터 가 보니 보인 것', url: 'http://blog.naver.com/carlog/1' },
      { title: '"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', url: 'http://blog.naver.com/foodlog/2' },
    ]),
    'mainInflowContentRanks:2026-09-26': ok([{ title: '’79세’ 윤여정, 조용히 전해진 소식… 눈물 바다', url: 'http://blog.naver.com/jungbo125/224416910697' }]),
    'mainInflowContentRanks:2026-09-25': ok([]),
    'mainInflowContentRanks:2026-09-24': ok([{ title: '투싼 하이브리드 계약하고 두 달 기다린 끝에 받은 안내', url: 'http://blog.naver.com/carlog/3' }]),
    'mainInflowContentRanks:2026-09-23': { status: 429, body: 'Too Many Requests' },
    'mainInflowContentRanks:2026-09-22': ok([{ title: '가을 이사 앞두고 장판 먼저 걷어 본 집의 바닥 상태', url: 'http://blog.naver.com/homelog/4' }]),
    impressionClickRanks: { status: 200, body: JSON.stringify({ parameters: { channelId: 'leadernam-' }, clickData: { data: [] }, impressionData: { data: [{ rank: 1, title: '펠리세이드 …', click: 0, impression: 0.375, contentId: POST_A }] } }) },
    'trendCategory:자동차': ok([{ category: '자동차', queryList: [{ keyword: '투싼', rank: 1, rankChange: 3 }, { query: '사이버트럭', rank: 2, rankChange: -1 }] }]),
    'categoryHour:자동차': ok([{ category: '자동차', metricList: [{ hour: '09', ratio: 0.08 }, { hour: '21', ratio: 0.1 }] }]),
    [`referrerDomain:${POST_A}`]: ok([
      { referrerDomain: '네이버 블로그_모바일', isSearchEngine: false, ratio: 0.32, metricValue: 8 },
      { referrerDomain: '네이버 메인_모바일_홈판', isSearchEngine: false, ratio: 0.28, metricValue: 7 },
      { referrerDomain: '네이버 통합검색_모바일', isSearchEngine: true, ratio: 0.16, metricValue: 4 },
    ]),
    [`referrerDomain:${POST_B}`]: { status: 429, body: 'Too Many Requests' },
  };
}

describe('응답 → 하루 기록', () => {
  const record = buildDailyRecord({ channelId: 'leadernam-', now: TUE, collectedAt: new Date(2026, 8, 29, 6, 12) }, sampleResults());

  it('글별 홈판 유입은 건수·비율 실측 그대로, 발행 시각은 createdAt(ms) 에서, 못 잰 글은 null', () => {
    expect(record.day).toBe('2026-09-28');
    expect(record.posts).toHaveLength(2);
    const a = record.posts.find((p) => p.contentId === POST_A)!;
    expect(a.views).toBe(25);
    expect(a.homefeed).toEqual({ count: 7, ratio: 0.28 });
    expect(a.searchCount).toBe(4);
    expect(a.publishedAt).toBe(new Date(Date.UTC(2026, 8, 28, 22, 21)).toISOString());
    const b = record.posts.find((p) => p.contentId === POST_B)!;
    expect(b.homefeed).toBeNull();
  });

  it('내 유입 주제·인기 검색어·주제 검색어(keyword 든 query 든)·전체 홈판 제목을 판에 담는다', () => {
    expect(record.topicsDay).toEqual([{ topic: '자동차', value: 64 }]);
    expect(record.topicsWeek[1]).toEqual({ topic: '리빙', value: 4 });
    expect(record.popularKeywords).toEqual({ topic: '자동차', items: [{ keyword: '투싼', ratio: 0.0028 }, { keyword: '투싼 풀체인지', ratio: 0.0026 }] });
    expect(record.topicKeywords).toEqual([
      { topic: '자동차', keyword: '투싼', rank: 1, rankChange: 3 },
      { topic: '자동차', keyword: '사이버트럭', rank: 2, rankChange: -1 },
    ]);
    expect(record.homefeedTitles).toEqual([{ title: '’79세’ 윤여정, 조용히 전해진 소식… 눈물 바다', url: 'http://blog.naver.com/jungbo125/224416910697' }]);
    expect(record.weeklyRecommendation).toEqual({ category: '스포츠', titles: ['"AI로 만든 줄 알았다" 외신까지 놀란 펜싱 국가대표'] });
    expect(record.categoryComparison).toEqual([{ group: '엔터테인먼트·예술', topic: '드라마', value: 12, averageDuration: 177398 }]);
  });

  it('시간대는 내 유입(어제·그제·지난달 평균)과 주제 독자 비율을 시간별로 나란히', () => {
    expect(record.myHours.find((h) => h.hour === 9)).toEqual({ hour: 9, yesterday: 1, dayBefore: 12, monthAverage: 4.29 });
    expect(record.topicHours).toEqual([{ topic: '자동차', hours: [{ hour: 9, ratio: 0.08 }, { hour: 21, ratio: 0.1 }] }]);
  });

  it('최근 7일 전체 홈판 제목은 어제 → 그 전 날짜 내림차순, rank 는 응답 순서(응답에 rank 칸이 없다), 못 받은 날·빈 날은 행이 없다', () => {
    expect(record.homefeedWeek.map((r) => `${r.day}#${r.rank}`)).toEqual(['2026-09-28#1', '2026-09-27#1', '2026-09-27#2', '2026-09-26#1', '2026-09-24#1', '2026-09-22#1']);
    expect(record.homefeedWeek[2]).toEqual({ day: '2026-09-27', rank: 2, title: '"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', url: 'http://blog.naver.com/foodlog/2' });
    // 어제 것만 담는 homefeedTitles 는 그대로다(옛 화면·카드가 읽는다)
    expect(record.homefeedTitles).toHaveLength(1);
  });

  it('실패한 창구는 missing 에 이름만 남기고 나머지는 그대로 만든다', () => {
    expect(record.missing).toEqual(['mainInflowContentRanks:2026-09-23', `referrerDomain:${POST_B}`]);
    expect(record.adImpressions[0]).toEqual({ contentId: POST_A, click: 0, impression: 0.375 });
  });

  it('계정 아이디(응답 parameters.channel)는 저장 판 어디에도 없다', () => {
    expect(JSON.stringify(record)).not.toContain(NID);
    expect(record.channelId).toBe('leadernam-');
  });

  it('기본 창구가 통째로 빠져도 판은 만들어지고 missing 에 적힌다', () => {
    const partial = buildDailyRecord({ channelId: 'leadernam-', now: TUE, collectedAt: TUE }, { cvRanks: { status: 403, body: 'Forbidden' } });
    expect(partial.posts).toEqual([]);
    expect(partial.missing).toContain('cvRanks');
    expect(partial.missing).toContain('d1RanksDay');
  });
});

describe('내 채널 아이디 — /accounts/channels 에서 블로그 채널만', () => {
  it('naver_blog 중 선택된 채널의 channelId 를 고른다. 없으면 null', () => {
    const body = JSON.stringify([
      { userId: NID, service: 'naver_post', channelId: 'p1', isSelected: true },
      { userId: NID, service: 'naver_blog', channelId: 'leadernam-', channelName: 'DRIVELEDGER', channelOwnerId: NID, isSelected: true },
    ]);
    expect(pickBlogChannelId(body)).toBe('leadernam-');
    expect(pickBlogChannelId(JSON.stringify([{ service: 'naver_blog', channelId: 'only-one', isSelected: false }]))).toBe('only-one');
    expect(pickBlogChannelId('[]')).toBeNull();
    expect(pickBlogChannelId('Forbidden')).toBeNull();
  });
});

describe('홈판 탄 날 패턴 — 잰 것만 센다', () => {
  const day = (d: string, posts: AdvisorDailyRecord['posts']): AdvisorDailyRecord =>
    ({ ...buildDailyRecord({ channelId: 'x', now: TUE, collectedAt: TUE }, {}), day: d, posts });
  const post = (id: string, iso: string, homefeed: { count: number; ratio: number } | null) =>
    ({ contentId: id, title: id, views: 1, publishedAt: iso, homefeed, searchCount: 0 });

  it('홈판 유입이 있던 글의 발행 시각(로컬 시)만 모아 시간대·그날 편수·간격을 센다', () => {
    const pattern = homefeedDayPattern([
      day('2026-09-28', [post('a', '2026-09-28T07:10:00+09:00', { count: 7, ratio: 0.3 }), post('b', '2026-09-28T19:40:00+09:00', { count: 2, ratio: 0.1 }), post('c', '2026-09-28T12:00:00+09:00', null)]),
      day('2026-09-27', [post('d', '2026-09-27T07:50:00+09:00', { count: 1, ratio: 0.05 })]),
      day('2026-09-26', [post('e', '2026-09-26T09:00:00+09:00', null)]),
    ]);
    expect(pattern.daysMeasured).toBe(3);
    expect(pattern.daysWithHomefeed).toBe(2);
    expect(pattern.hours).toEqual([{ hour: 7, posts: 2 }, { hour: 19, posts: 1 }]);
    expect(pattern.postsPerDay).toEqual([2, 1]);
    expect(pattern.gapsMinutes).toEqual([750]);
  });

  it('홈판 탄 글이 하나도 없으면 빈 패턴 — 기본값을 지어내지 않는다', () => {
    const pattern = homefeedDayPattern([day('2026-09-28', [post('c', '2026-09-28T12:00:00+09:00', null)])]);
    expect(pattern).toEqual({ daysMeasured: 1, daysWithHomefeed: 0, hours: [], postsPerDay: [], gapsMinutes: [] });
  });
});
