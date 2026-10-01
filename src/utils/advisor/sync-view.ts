/**
 * 사이트 동기화 판(플랜 B, docs/my-blog-homefeed-fit-plan-2026-09-30.md) — 앱이 잰 것 중 사이트 표에 쓰는 칸만.
 *
 * 빠지는 것: 어드바이저 채널 id·글 contentId(계정·글 식별자), 창구 목록·기록 파일 경로. 사이트가 알 이유가 없다.
 * 남는 것: 통계 날짜, 글별 제목·홈판 유입·발행 시각, 내 주제·시간대·인기/트렌드 검색어, 오늘 홈판 제목, 오늘 쓸 글 판.
 * 값은 그대로 옮긴다 — 여기서 새로 셈하거나 판정하지 않는다.
 * 예외: 0명 글 부검 사실(autopsy, 2026-10-01)은 내 공개 글 주소를 싣는다 — 사이트가 글로 이어 주고 홈판 글과 맞대야 해서다(묶음은 비밀번호로 잠긴다).
 */
import type { AdvisorDailyRecord } from './daily-summary';
import type { TodayPlan } from './today-build';
import type { AutopsyFacts } from './autopsy-history';

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
  /** 최근 7일 홈판 유입 상위 20(날짜 · 순위 · 제목 · 주소) — 벤치마크 판이 '실제 홈판에 오른 소재'와 맞댄다(2026-10-01). */
  homefeedWeek: AdvisorDailyRecord['homefeedWeek'];
  /** 여러 날 기록에서 모은 '홈판 유입을 받은 내 글'(제목 · 날짜 · 유입 수) — 벤치마크 판의 '내 블로그 홈판 소재' 표시. */
  myHomefeedHits: { title: string; day: string; count: number }[];
  weeklyRecommendation: AdvisorDailyRecord['weeklyRecommendation'];
  /** 0명 글 부검 사실 — 최근 14일 내 글(조회 · 발행 시각 · 검색 허용)과 그 기간 홈판 상위. 판정은 사이트가 한다. */
  autopsy: AutopsyFacts | null;
  /** 못 받은 창구 수만 — 이름(창구 목록)은 넘기지 않는다. */
  missingCount: number;
}

const MY_HOMEFEED_HITS_MAX = 60;

/** 같은 글(제목)은 가장 큰 유입 수 · 가장 최근 날짜로 하나만. 유입 0 은 뺀다. 최신 날짜 → 유입 많은 순. */
function myHomefeedHits(records: readonly AdvisorDailyRecord[]): AdvisorDailySyncView['myHomefeedHits'] {
  const byTitle = new Map<string, { title: string; day: string; count: number }>();
  for (const record of records) {
    for (const post of record.posts || []) {
      const count = post.homefeed?.count ?? 0;
      if (!post.title || !(count > 0)) continue;
      const seen = byTitle.get(post.title);
      byTitle.set(post.title, {
        title: post.title,
        day: !seen || record.day > seen.day ? record.day : seen.day,
        count: Math.max(count, seen?.count ?? 0),
      });
    }
  }
  return [...byTitle.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || b.count - a.count)
    .slice(0, MY_HOMEFEED_HITS_MAX);
}

export function advisorDailySyncView(record: AdvisorDailyRecord | null | undefined, history: readonly AdvisorDailyRecord[] = [], autopsy: AutopsyFacts | null = null): AdvisorDailySyncView | null {
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
    homefeedWeek: record.homefeedWeek || [],
    myHomefeedHits: myHomefeedHits([...history, record]),
    weeklyRecommendation: record.weeklyRecommendation || null,
    autopsy,
    missingCount: (record.missing || []).length,
  };
}

export type TodayPlanSyncView = Omit<TodayPlan, 'channelId'>;

export function todayPlanSyncView(plan: TodayPlan | null | undefined): TodayPlanSyncView | null {
  if (!plan) return null;
  const { channelId: _channelId, ...rest } = plan;
  return rest;
}
