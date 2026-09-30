import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord } from '../advisor/daily-summary';
import type { TodayPlan } from '../advisor/today-build';
import { advisorDailySyncView, todayPlanSyncView } from '../advisor/sync-view';

/**
 * 사이트 동기화 판(플랜 B) — 계정·글 식별자·창구 이름은 빠지고, 표에 쓰는 실측 값은 그대로 옮겨지는지.
 */
const record = {
  day: '2026-09-29',
  collectedAt: '2026-09-30T03:43:00.000Z',
  channelId: 'DRIVELEDGER',
  posts: [{ contentId: '224385098124', title: '쏘렌토 하이브리드 실연비', views: 120, publishedAt: '2026-09-28T10:00:00.000Z', homefeed: { count: 80, ratio: 0.66 }, searchCount: 30 }],
  topicsDay: [{ topic: '자동차', value: 64 }],
  topicsWeek: [{ topic: '자동차', value: 70 }],
  myHours: [{ hour: 7, yesterday: 12, dayBefore: 9, monthAverage: 10.5 }],
  topicHours: [{ topic: '자동차', hours: [{ hour: 7, ratio: 0.1 }] }],
  popularKeywords: { topic: '자동차', items: [{ keyword: '쏘렌토', ratio: 0.9 }] },
  topicKeywords: [{ topic: '자동차', keyword: '아이오닉', rank: 1, rankChange: 3 }],
  homefeedTitles: [{ title: '오늘 홈판 제목', url: 'https://blog.naver.com/x/1' }],
  weeklyRecommendation: { category: '자동차', titles: ['추천 제목'] },
  categoryComparison: [{ group: 'a', topic: '자동차', value: 1, averageDuration: 2 }],
  soaring: [{ contentId: '1', title: 't', value: 1, delta: null }],
  adImpressions: [{ contentId: '1', click: 1, impression: 2 }],
  missing: ['hourDistribution', 'soaringContents'],
} as AdvisorDailyRecord;

describe('advisorDailySyncView', () => {
  it('채널 id·글 contentId·창구 이름을 빼고, 표에 쓰는 값은 그대로 옮긴다', () => {
    const view = advisorDailySyncView(record)!;
    const text = JSON.stringify(view);
    expect(text).not.toContain('DRIVELEDGER');
    expect(text).not.toContain('224385098124');
    expect(text).not.toContain('hourDistribution');
    expect(view.missingCount).toBe(2);
    expect(view.posts).toEqual([{ title: '쏘렌토 하이브리드 실연비', views: 120, publishedAt: '2026-09-28T10:00:00.000Z', homefeed: { count: 80, ratio: 0.66 }, searchCount: 30 }]);
    expect(view.popularKeywords).toEqual(record.popularKeywords);
    expect(view.topicKeywords).toEqual(record.topicKeywords);
    expect(view.homefeedTitles).toEqual(record.homefeedTitles);
    expect(view.myHours).toEqual(record.myHours);
    expect((view as any).soaring).toBeUndefined();
    expect((view as any).adImpressions).toBeUndefined();
  });
  it('기록이 없으면 null', () => {
    expect(advisorDailySyncView(null)).toBeNull();
  });
  /*
   * 2026-10-01 사장님 "1번 2번 3번 전부": 벤치마크 판에서 ① 실제 홈판 상위에 오른 소재와 맞대고 ③ 내 블로그가
   * 홈판 유입을 받았던 소재를 표시한다. 재료는 어드바이저 실측 — 최근 7일 홈판 상위 20 과 여러 날의 글별 홈판 유입.
   */
  it('최근 7일 홈판 상위 제목을 그대로 싣는다', () => {
    const week = [{ day: '2026-09-29', rank: 1, title: '홈판 1위 제목', url: 'https://blog.naver.com/y/2' }];
    expect(advisorDailySyncView({ ...record, homefeedWeek: week } as AdvisorDailyRecord)!.homefeedWeek).toEqual(week);
    expect(advisorDailySyncView(record)!.homefeedWeek).toEqual([]);
  });
  it('여러 날 기록에서 내 글의 홈판 유입을 모은다 — 0 은 빼고, 같은 글은 큰 값 · 최근 날짜, 최신순', () => {
    const older = { ...record, day: '2026-09-27', posts: [
      { contentId: '1', title: '쏘렌토 하이브리드 실연비', views: 50, publishedAt: null, homefeed: { count: 30, ratio: 0.5 }, searchCount: 1 },
      { contentId: '2', title: '카니발 하이리무진', views: 9, publishedAt: null, homefeed: { count: 4, ratio: 0.4 }, searchCount: 1 },
      { contentId: '3', title: '홈판 못 받은 글', views: 3, publishedAt: null, homefeed: { count: 0, ratio: 0 }, searchCount: 1 },
    ] } as AdvisorDailyRecord;
    const hits = advisorDailySyncView(record, [older, record])!.myHomefeedHits;
    expect(hits).toEqual([
      { title: '쏘렌토 하이브리드 실연비', day: '2026-09-29', count: 80 },
      { title: '카니발 하이리무진', day: '2026-09-27', count: 4 },
    ]);
    expect(JSON.stringify(hits)).not.toContain('224385098124');
  });
});

describe('todayPlanSyncView', () => {
  it('channelId 만 빼고 판은 그대로', () => {
    const plan = { day: '2026-09-29', builtAt: 'x', channelId: 'DRIVELEDGER', candidatesTotal: 3, keywords: [], measured: { searchVolume: 0, seat: 0 }, time: {}, titles: { status: 'ok', provider: null, items: [] }, notes: ['자리 실측 실패: 브라우저 없음'] } as unknown as TodayPlan;
    const view = todayPlanSyncView(plan)!;
    expect((view as any).channelId).toBeUndefined();
    expect(view.notes).toEqual(['자리 실측 실패: 브라우저 없음']);
    expect(view.candidatesTotal).toBe(3);
    expect(todayPlanSyncView(null)).toBeNull();
  });
});
