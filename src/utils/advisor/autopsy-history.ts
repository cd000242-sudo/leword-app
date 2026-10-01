/**
 * 0명 글 부검 재료(2026-10-01) — 사장님 "하루 3~10개 쓰는데 0명 본 글이 너무 많다, 뭐가 문제인지 뜯어 달라".
 *
 * 하루 기록(daily-summary)의 posts 는 cv-ranks(조회 순위, 상한 50)라 **조회 0 글은 원래 안 들어온다**.
 * 그래서 따로 모은다:
 *   - 날짜별 내 조회 순위(cv-ranks) — 줄 수가 상한보다 적으면 그날 조회 있는 글이 전부 들어온 것이고,
 *     목록에 없는 내 글은 그날 조회가 정확히 0 이다. 상한에 닿은 날은 '모름'으로 둔다(0 으로 때우지 않는다).
 *   - 날짜별 전체 홈판 상위 20(main-inflow-content-ranks) — 계정과 무관한 전체 데이터, 90일 전까지 조회된다.
 *   - 내 글 목록(공개, 로그인 불필요)과 글 · 홈판 글의 발행 시각(공개 글 화면) — 시각은 안 바뀌니 한 번 재면 끝.
 * 지난 날의 값은 그날이 끝나면 굳으니, 없는 날만 부르고 받은 날은 그대로 둔다. 판정(같은 소재인가)은 사이트가 한다
 * — 묶기 규칙이 사이트 homefeedLive.mjs 에 있어 세 번째 사본을 만들지 않는다.
 */
import { CV_RANKS_LIMIT, localDay, type AdvisorDailyContext, type AdvisorProbeSpec } from './daily-plan';
import type { AdvisorDailyRecord, AdvisorProbeResult } from './daily-summary';

/** 부검하는 기간 — 어제부터 거꾸로 14일. */
export const AUTOPSY_DAYS = 14;
/** 저장해 두는 기간. 부검 기간보다 넉넉히. */
const HISTORY_KEEP_DAYS = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface HistoryCvRow { contentId: string; views: number; createdAt: string | null }
export interface HistoryHomefeedRow { rank: number; title: string; url: string }
export interface HistoryDay {
  /** complete=true 면 그날 조회 있는 내 글이 전부 들어 있다(줄 수 < 상한). */
  cv?: { rows: HistoryCvRow[]; complete: boolean };
  homefeed?: HistoryHomefeedRow[];
}
export interface AutopsyMyPost {
  logNo: string;
  title: string;
  url: string;
  /** KST 날짜. */
  publishedOn: string | null;
  searchable: boolean;
  blocked: boolean;
  /** 목록 · 글 화면이 'N시간 전'만 줄 때의 어림 시각 — 다음 날이면 정확한 시각으로 바뀐다. */
  approxAt?: string;
}
export interface AutopsyHistory {
  schemaVersion: 1;
  days: Record<string, HistoryDay>;
  /** 글 주소 → 정확한 발행 시각(ISO). 내 글 · 홈판 글 모두. */
  postTimes: Record<string, string>;
  /** 마지막 수집 때의 내 최근 글 목록. */
  myPosts: AutopsyMyPost[];
}

export interface AutopsyPostFact {
  title: string;
  url: string;
  publishedOn: string;
  publishedAt: string | null;
  approxTime: boolean;
  searchable: boolean;
  blocked: boolean;
  /** 발행일부터 어제까지 기록된 날의 조회 합. 하루라도 '모름'이 끼거나 기록된 날이 없으면 null. */
  views: number | null;
  viewDays: number;
  /** 발행일부터 어제까지 하루도 빠짐없이 기록이 있다 — 이때만 '발행 뒤 조회 N'이라고 말할 수 있다. */
  viewsComplete: boolean;
}
export interface AutopsyFacts {
  from: string;
  to: string;
  posts: AutopsyPostFact[];
  homefeed: { day: string; rank: number; title: string; url: string; publishedAt: string | null }[];
}

export const emptyHistory = (): AutopsyHistory => ({ schemaVersion: 1, days: {}, postTimes: {}, myPosts: [] });

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 어제부터 거꾸로 n일(최근 날짜 먼저). */
function pastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => localDay(shiftDays(now, -(1 + i))));
}

function query(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

/** 블로그 글 주소 → https://blog.naver.com/{아이디}/{글번호}. 블로그 글이 아니면 null. */
export function normalizePostUrl(url: string): string | null {
  const m = String(url || '').match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/);
  return m ? `https://blog.naver.com/${m[1]}/${m[2]}` : null;
}

/** 지난 14일 중 아직 없는 날의 조회 순위 · 홈판 상위만. */
export function historyProbes(ctx: AdvisorDailyContext, history: AutopsyHistory): AdvisorProbeSpec[] {
  const service = 'naver_blog';
  return pastDays(ctx.now, AUTOPSY_DAYS).flatMap((day) => [
    ...(history.days[day]?.cv ? [] : [{ key: `cv:${day}`, path: `/integrated-analysis/cv-ranks?${query({ service, channelId: ctx.channelId, contentType: 'text', interval: 'day', date: day, limit: CV_RANKS_LIMIT })}` }]),
    ...(history.days[day]?.homefeed ? [] : [{ key: `hf:${day}`, path: `/trend/main-inflow-content-ranks?${query({ service, interval: 'day', date: day })}` }]),
  ]);
}

function okData(result: AdvisorProbeResult | undefined): any[] | null {
  if (!result || result.status !== 200) return null;
  try {
    const data = JSON.parse(result.body)?.data;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function cvDay(data: any[]): HistoryDay['cv'] {
  const rows = data
    .map((item) => ({
      contentId: normalizePostUrl(str(item?.contentId)) ?? str(item?.contentId),
      views: num(item?.metricValue),
      createdAt: typeof item?.createdAt === 'number' && Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : null,
    }))
    .filter((row) => row.contentId);
  return { rows, complete: data.length < CV_RANKS_LIMIT };
}

function homefeedDay(data: any[]): HistoryHomefeedRow[] {
  return data
    .map((item, index) => ({ rank: index + 1, title: str(item?.title), url: normalizePostUrl(str(item?.url)) ?? str(item?.url) }))
    .filter((row) => row.title);
}

/** 받은 날만 새로 얹고(실패한 날은 다음 수집에 다시), 보존 기간이 지난 날은 버린다. 입력은 건드리지 않는다. */
export function mergeHistory(history: AutopsyHistory, results: Record<string, AdvisorProbeResult | undefined>, now: Date): AutopsyHistory {
  const floor = localDay(shiftDays(now, -HISTORY_KEEP_DAYS));
  const days: Record<string, HistoryDay> = Object.fromEntries(Object.entries(history.days).filter(([day]) => day >= floor));
  for (const [key, result] of Object.entries(results)) {
    const m = key.match(/^(cv|hf):(\d{4}-\d{2}-\d{2})$/);
    const data = m ? okData(result) : null;
    if (!m || !data || m[2] < floor) continue;
    const day = m[2];
    days[day] = m[1] === 'cv' ? { ...days[day], cv: cvDay(data) } : { ...days[day], homefeed: homefeedDay(data) };
  }
  return { ...history, days };
}

/**
 * 하루 기록(daily-summary)이 이미 가진 것으로 먼저 채운다 — 그날 조회 순위(posts = cv-ranks)와 7일 홈판 상위.
 * 이미 있는 날은 덮지 않는다. 채운 날은 historyProbes 가 다시 부르지 않는다.
 */
export function seedFromRecords(history: AutopsyHistory, records: readonly AdvisorDailyRecord[]): AutopsyHistory {
  const days: Record<string, HistoryDay> = { ...history.days };
  for (const record of records) {
    if (record?.day && !days[record.day]?.cv && Array.isArray(record.posts)) {
      const rows = record.posts
        .map((p) => ({ contentId: normalizePostUrl(p.contentId) ?? p.contentId, views: num(p.views), createdAt: p.publishedAt ?? null }))
        .filter((row) => row.contentId);
      days[record.day] = { ...days[record.day], cv: { rows, complete: record.posts.length < CV_RANKS_LIMIT } };
    }
    const byDay = new Map<string, HistoryHomefeedRow[]>();
    for (const row of Array.isArray(record?.homefeedWeek) ? record.homefeedWeek : []) {
      if (!row?.day || !row.title) continue;
      byDay.set(row.day, [...(byDay.get(row.day) ?? []), { rank: row.rank, title: row.title, url: normalizePostUrl(row.url) ?? row.url }]);
    }
    for (const [day, rows] of byDay) if (!days[day]?.homefeed) days[day] = { ...days[day], homefeed: rows };
  }
  return { ...history, days };
}

/**
 * 공개 글 화면의 발행 시각. '2026. 9. 30. 9:49'(KST) · 'N분 전'은 분까지 정확, 'N시간 전'은 어림(approx).
 * 못 읽으면 null.
 */
export function parsePostPageTime(html: string, nowMs: number): { at: string; approx: boolean } | null {
  const text = (String(html || '').match(/class="[^"]*se_publishDate[^"]*"[^>]*>([^<]+)</) || [])[1]?.trim();
  if (!text) return null;
  const abs = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
  if (abs) {
    const [, y, mo, d, h, mi] = abs.map(Number);
    return { at: new Date(Date.UTC(y, mo - 1, d, h, mi) - KST_OFFSET_MS).toISOString(), approx: false };
  }
  const minutes = text.match(/(\d+)\s*분\s*전/);
  if (minutes) return { at: new Date(nowMs - Number(minutes[1]) * 60_000).toISOString(), approx: false };
  const hours = text.match(/(\d+)\s*시간\s*전/);
  if (hours) return { at: new Date(nowMs - Number(hours[1]) * 3_600_000).toISOString(), approx: true };
  if (/방금/.test(text)) return { at: new Date(nowMs).toISOString(), approx: false };
  return null;
}

/** ISO 시각 → KST 날짜. */
export function kstDayOf(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 발행 시각을 아직 모르는 블로그 글 주소 — 내 글 먼저, 그다음 최근 날짜 홈판 글(순위순). 최대 limit 개. */
export function timeTargets(history: AutopsyHistory, limit: number): string[] {
  const known = (url: string) => Boolean(history.postTimes[url]);
  const mine = history.myPosts.map((p) => p.url).filter((url) => !known(url));
  const homefeed = Object.keys(history.days).sort((a, b) => b.localeCompare(a))
    .flatMap((day) => (history.days[day].homefeed ?? []).map((row) => row.url))
    .filter((url) => normalizePostUrl(url) === url && !known(url));
  return [...new Set([...mine, ...homefeed])].slice(0, limit);
}

/** 발행일부터 어제까지 기록된 날의 조회 합. '모름' 날이 끼면 null. */
function viewsSince(history: AutopsyHistory, url: string, publishedOn: string, days: readonly string[]): { views: number | null; viewDays: number; viewsComplete: boolean } {
  let views = 0;
  let viewDays = 0;
  const expected = days.filter((day) => day >= publishedOn).length;
  for (const day of days) {
    const cv = history.days[day]?.cv;
    if (day < publishedOn || !cv) continue;
    const row = cv.rows.find((r) => r.contentId === url);
    if (!row && !cv.complete) return { views: null, viewDays, viewsComplete: false };
    views += row?.views ?? 0;
    viewDays += 1;
  }
  return { views: viewDays ? views : null, viewDays, viewsComplete: viewDays > 0 && viewDays === expected };
}

/** 부검에 넘길 사실 묶음 — 어제까지 발행된 최근 14일 글(최근 글 먼저)과 그 기간 홈판 상위. */
export function autopsyFacts(history: AutopsyHistory, now: Date): AutopsyFacts {
  const days = pastDays(now, AUTOPSY_DAYS);
  const to = days[0];
  const from = days[days.length - 1];
  const posts = history.myPosts
    .filter((p): p is AutopsyMyPost & { publishedOn: string } => Boolean(p.publishedOn) && p.publishedOn! >= from && p.publishedOn! <= to)
    .map((p) => {
      const exact = history.postTimes[p.url] ?? null;
      return {
        title: p.title,
        url: p.url,
        publishedOn: p.publishedOn,
        publishedAt: exact ?? p.approxAt ?? null,
        approxTime: !exact && Boolean(p.approxAt),
        searchable: p.searchable,
        blocked: p.blocked,
        ...viewsSince(history, p.url, p.publishedOn, days),
      };
    })
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const homefeed = days
    .filter((day) => history.days[day]?.homefeed)
    .flatMap((day) => history.days[day].homefeed!.map((row) => ({ day, ...row, publishedAt: history.postTimes[row.url] ?? null })));
  return { from, to, posts, homefeed };
}
