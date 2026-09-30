/**
 * 사이트 동기화 판(플랜 B, docs/my-blog-homefeed-fit-plan-2026-09-30.md) — 앱이 잰 것 중 사이트 표에 쓰는 칸만.
 *
 * 빠지는 것: 어드바이저 채널 id·글 contentId(계정·글 식별자), 창구 목록·기록 파일 경로. 사이트가 알 이유가 없다.
 * 남는 것: 통계 날짜, 글별 제목·홈판 유입·발행 시각, 내 주제·시간대·인기/트렌드 검색어, 오늘 홈판 제목, 오늘 쓸 글 판.
 * 값은 그대로 옮긴다 — 여기서 새로 셈하거나 판정하지 않는다.
 */
import type { AdvisorDailyRecord } from './daily-summary';
import type { TodayPlan } from './today-build';

export interface AdvisorDailySyncView {
  day: string;
  collectedAt: string;
  posts: { title: string; views: number; publishedAt: string | null; homefeed: { count: number; ratio: number } | null; searchCount: number | null }[];
  topicsDay: AdvisorDailyRecord['topicsDay'];
  topicsWeek: AdvisorDailyRecord['topicsWeek'];
  myHours: AdvisorDailyRecord['myHours'];
  topicHours: AdvisorDailyRecord['topicHours'];
  popularKeywords: AdvisorDailyRecord['popularKeywords'];
  topicKeywords: AdvisorDailyRecord['topicKeywords'];
  homefeedTitles: AdvisorDailyRecord['homefeedTitles'];
  weeklyRecommendation: AdvisorDailyRecord['weeklyRecommendation'];
  /** 못 받은 창구 수만 — 이름(창구 목록)은 넘기지 않는다. */
  missingCount: number;
}

export function advisorDailySyncView(record: AdvisorDailyRecord | null | undefined): AdvisorDailySyncView | null {
  if (!record) return null;
  return {
    day: record.day,
    collectedAt: record.collectedAt,
    posts: (record.posts || []).map((post) => ({
      title: post.title,
      views: post.views,
      publishedAt: post.publishedAt,
      homefeed: post.homefeed ? { count: post.homefeed.count, ratio: post.homefeed.ratio } : null,
      searchCount: post.searchCount,
    })),
    topicsDay: record.topicsDay || [],
    topicsWeek: record.topicsWeek || [],
    myHours: record.myHours || [],
    topicHours: record.topicHours || [],
    popularKeywords: record.popularKeywords || null,
    topicKeywords: record.topicKeywords || [],
    homefeedTitles: record.homefeedTitles || [],
    weeklyRecommendation: record.weeklyRecommendation || null,
    missingCount: (record.missing || []).length,
  };
}

export type TodayPlanSyncView = Omit<TodayPlan, 'channelId'>;

export function todayPlanSyncView(plan: TodayPlan | null | undefined): TodayPlanSyncView | null {
  if (!plan) return null;
  const { channelId: _channelId, ...rest } = plan;
  return rest;
}
