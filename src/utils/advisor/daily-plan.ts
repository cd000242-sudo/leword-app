/**
 * 하루 1회 어드바이저 수집 — 어떤 창구를 어떤 날짜로 부르나 (A 층, 2026-09-30 플랜).
 *
 * 규칙은 전부 2026-09-30 실측(93건)에서 왔다 — 하나라도 어기면 400:
 * - interval=week 는 date 가 월요일, month 는 1일. day 는 어제(오늘 값은 아직 채워지는 중).
 * - categories 는 한글 주제명("자동차"). 코드(CAR)는 200 이지만 빈 목록을 준다.
 * - uv-count·visit-count 는 contentType 을 넣으면 400 → 이 판은 쓰지 않는다.
 * 요청 수 = 기본 11 + 주제 3×2 + 글 30 = 최대 47. 비용 0(로그인 세션).
 */

export interface AdvisorDailyContext {
  channelId: string;
  now: Date;
}

export interface AdvisorProbeSpec {
  /** 기록 판의 키. 후속 창구는 `trendCategory:자동차` 처럼 대상이 붙는다. */
  key: string;
  /** `/api/v6` 뒤 상대경로+쿼리. advisorFetch 에 그대로 준다. */
  path: string;
}

/** 어제 유입 있던 글 중 홈판 실측을 붙일 상한 — 글마다 한 요청이다. */
export const ADVISOR_DAILY_POST_CAP = 30;
/** 인기 검색어·독자 시간대를 붙일 내 상위 유입 주제 상한. */
export const ADVISOR_DAILY_TOPIC_CAP = 3;
/** cv-ranks 한 번에 받는 글 수. */
const CV_RANKS_LIMIT = 50;

const two = (value: number) => String(value).padStart(2, '0');

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function yesterday(now: Date): string {
  return localDay(shiftDays(now, -1));
}

export function monthStart(now: Date): string {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-01`;
}

/**
 * 마지막으로 끝난 주(월~일)의 월요일. 일요일 밤에도 이번 주는 아직 안 끝난 것으로 본다.
 * 화 09-29 → 09-21, 월 10-05 → 09-28, 일 10-04 → 09-21.
 */
export function lastCompletedWeekMonday(now: Date): string {
  const anchor = shiftDays(now, -7);
  const offsetFromMonday = (anchor.getDay() + 6) % 7;
  return localDay(shiftDays(anchor, -offsetFromMonday));
}

function query(params: Record<string, string | number | boolean>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

export function baseProbes(ctx: AdvisorDailyContext): AdvisorProbeSpec[] {
  const service = 'naver_blog';
  const channelId = ctx.channelId;
  const day = yesterday(ctx.now);
  const week = lastCompletedWeekMonday(ctx.now);
  const mine = { service, channelId };
  return [
    { key: 'cvRanks', path: `/integrated-analysis/cv-ranks?${query({ ...mine, contentType: 'text', interval: 'day', date: day, limit: CV_RANKS_LIMIT })}` },
    { key: 'd1RanksDay', path: `/integrated-analysis/d1-ranks?${query({ ...mine, contentType: 'text', interval: 'day', date: day, limit: 20 })}` },
    { key: 'd1RanksWeek', path: `/integrated-analysis/d1-ranks?${query({ ...mine, contentType: 'text', interval: 'week', date: week, limit: 20 })}` },
    { key: 'hourDistribution', path: `/integrated-analysis/hour-distribution?${query({ ...mine, contentType: 'text', metric: 'cv', date: day })}` },
    { key: 'popularCategoryKeyword', path: `/home/popular-category-keyword?${query({ ...mine, date: week })}` },
    { key: 'weeklyRecommendation', path: `/home/weekly-recommendation?${query({ service, date: week })}` },
    { key: 'categoryComparison', path: `/trend/category-comparison?${query({ service, contentType: 'text', interval: 'day', date: day })}` },
    { key: 'soaringContents', path: `/home/soaring-contents?${query({ ...mine, interval: 'day', date: day })}` },
    { key: 'mainInflowContentRanks', path: `/trend/main-inflow-content-ranks?${query({ service, interval: 'day', date: day })}` },
    { key: 'impressionClickRanks', path: `/revenue/impression-click-ranks?${query({ ...mine, interval: 'day', date: day, contentType: 'text', clickLimit: 20, impressionLimit: 20 })}` },
  ];
}

export interface AdvisorFollowUpInput {
  /** 내 상위 유입 주제 — 한글 이름 그대로. */
  topics: readonly string[];
  /** 어제 유입 있던 내 글 contentId(글 URL 그대로). */
  postIds: readonly string[];
}

export function followUpProbes(ctx: AdvisorDailyContext, input: AdvisorFollowUpInput): AdvisorProbeSpec[] {
  const service = 'naver_blog';
  const day = yesterday(ctx.now);
  const topics = input.topics.filter((t) => t.trim()).slice(0, ADVISOR_DAILY_TOPIC_CAP);
  const posts = input.postIds.filter((p) => p.trim()).slice(0, ADVISOR_DAILY_POST_CAP);
  return [
    ...topics.map((topic) => ({
      key: `trendCategory:${topic}`,
      path: `/trend/category?${query({ service, categories: topic, contentType: 'text', interval: 'day', date: day, hasRankChange: true, limit: 20 })}`,
    })),
    ...topics.map((topic) => ({
      key: `categoryHour:${topic}`,
      path: `/trend/category-hour-distribution?${query({ service, contentType: 'text', interval: 'day', date: day, categories: topic })}`,
    })),
    ...posts.map((contentId) => ({
      key: `referrerDomain:${contentId}`,
      path: `/inflow-analysis/referrer-domain?${query({ service, channelId: ctx.channelId, metric: 'cv', interval: 'day', date: day, limit: 20, contentId })}`,
    })),
  ];
}
