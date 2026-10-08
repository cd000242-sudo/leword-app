/**
 * 어드바이저 응답 → 하루 기록 판 (A 층, 2026-09-30 플랜).
 *
 * 응답에서 **고른 칸만** 옮긴다 — 어드바이저 응답 parameters 에는 계정 아이디(channel)가 실리는데
 * 저장 판에는 channelId(블로그 주소 아이디) 하나만 남는다. 못 받은 창구는 이름만 missing 에 적고 값은 비운다(0 으로 채우지 않음).
 * 시간은 전부 한국 시각(어드바이저 시간대 값도 KST).
 */
import { yesterday, type AdvisorDailyContext } from './daily-plan';

export interface AdvisorProbeResult {
  status: number;
  body: string;
}

export interface AdvisorPostRow {
  contentId: string;
  title: string;
  /** 어제 조회(cv). */
  views: number;
  /** 발행 시각 ISO(createdAt ms). 없으면 null. */
  publishedAt: string | null;
  /** "네이버 메인_모바일_홈판" 유입 건수·비율. 글별 창구를 못 받았으면 null(0 아님). */
  homefeed: { count: number; ratio: number } | null;
  /** 검색 유입 건수 합(isSearchEngine). 못 받았으면 null. */
  searchCount: number | null;
}

export interface AdvisorHourRow { hour: number; yesterday: number; dayBefore: number; monthAverage: number }

export interface AdvisorDailyRecord {
  /** 통계 날짜(어제). */
  day: string;
  collectedAt: string;
  channelId: string;
  posts: AdvisorPostRow[];
  topicsDay: { topic: string; value: number }[];
  topicsWeek: { topic: string; value: number }[];
  myHours: AdvisorHourRow[];
  topicHours: { topic: string; hours: { hour: number; ratio: number }[] }[];
  popularKeywords: { topic: string; items: { keyword: string; ratio: number }[] } | null;
  /** searchVolume = 실측 월 검색량(워커 keyword-volumes · 2026-10-08) — 못 잰 말 null, 예전 기록엔 없음. */
  topicKeywords: { topic: string; keyword: string; rank: number; rankChange: number | null; searchVolume?: number | null }[];
  homefeedTitles: { title: string; url: string }[];
  /** 어제 + 그 전 6일 홈판 상위 20(main-inflow-content-ranks). rank 는 응답 순서(응답에 rank 칸이 없다). 날짜 내림차순. */
  homefeedWeek: { day: string; rank: number; title: string; url: string }[];
  weeklyRecommendation: { category: string; titles: string[] } | null;
  categoryComparison: { group: string; topic: string; value: number; averageDuration: number }[];
  soaring: { contentId: string; title: string; value: number; delta: number | null }[];
  adImpressions: { contentId: string; click: number; impression: number }[];
  missing: string[];
}

const BASE_KEYS = [
  'cvRanks', 'd1RanksDay', 'd1RanksWeek', 'hourDistribution', 'popularCategoryKeyword', 'weeklyRecommendation',
  'categoryComparison', 'soaringContents', 'mainInflowContentRanks', 'impressionClickRanks',
] as const;

const HOMEFEED_DOMAIN = '네이버 메인_모바일_홈판';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type Results = Record<string, AdvisorProbeResult | undefined>;

/** 200 이고 JSON 이면 본문, 아니면 undefined. */
function parsed(results: Results, key: string): any {
  const result = results[key];
  if (!result || result.status !== 200) return undefined;
  try { return JSON.parse(result.body); } catch { return undefined; }
}

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

function postRows(results: Results): AdvisorPostRow[] {
  return list(parsed(results, 'cvRanks')?.data).map((item) => {
    const contentId = str(item?.contentId);
    const referrers = parsed(results, `referrerDomain:${contentId}`);
    const rows = referrers ? list(referrers.data) : null;
    const home = rows?.find((r) => str(r?.referrerDomain) === HOMEFEED_DOMAIN);
    const createdAt = num(item?.createdAt, NaN);
    return {
      contentId,
      title: str(item?.title),
      views: num(item?.metricValue),
      publishedAt: Number.isFinite(createdAt) ? new Date(createdAt).toISOString() : null,
      homefeed: rows ? { count: num(home?.metricValue), ratio: num(home?.ratio) } : null,
      searchCount: rows ? rows.filter((r) => r?.isSearchEngine === true).reduce((sum, r) => sum + num(r?.metricValue), 0) : null,
    };
  }).filter((row) => row.contentId);
}

function topicRows(results: Results, key: string): { topic: string; value: number }[] {
  return list(parsed(results, key)?.data).map((item) => ({ topic: str(item?.d1), value: num(item?.metricValue) })).filter((row) => row.topic);
}

function hourRows(results: Results): AdvisorHourRow[] {
  return list(parsed(results, 'hourDistribution')?.data).map((item) => {
    const metrics = list(item?.metrics);
    return { hour: Number(item?.hour), yesterday: num(metrics[0]), dayBefore: num(metrics[1]), monthAverage: num(metrics[2]) };
  }).filter((row) => Number.isInteger(row.hour));
}

function keysWithPrefix(results: Results, prefix: string): string[] {
  return Object.keys(results).filter((key) => key.startsWith(prefix));
}

function topicHourRows(results: Results): AdvisorDailyRecord['topicHours'] {
  return keysWithPrefix(results, 'categoryHour:').flatMap((key) => {
    const body = parsed(results, key);
    if (!body) return [];
    const topic = key.slice('categoryHour:'.length);
    const hours = list(list(body.data)[0]?.metricList).map((h) => ({ hour: Number(h?.hour), ratio: num(h?.ratio) })).filter((h) => Number.isInteger(h.hour));
    return [{ topic, hours }];
  });
}

function topicKeywordRows(results: Results): AdvisorDailyRecord['topicKeywords'] {
  return keysWithPrefix(results, 'trendCategory:').flatMap((key) => {
    const body = parsed(results, key);
    if (!body) return [];
    const topic = key.slice('trendCategory:'.length);
    return list(body.data).flatMap((group) => list(group?.queryList).map((q) => ({
      topic,
      keyword: str(q?.keyword) || str(q?.query),
      rank: num(q?.rank),
      rankChange: typeof q?.rankChange === 'number' ? q.rankChange : null,
    }))).filter((row) => row.keyword);
  });
}

function popularKeywords(results: Results): AdvisorDailyRecord['popularKeywords'] {
  const body = parsed(results, 'popularCategoryKeyword')?.data;
  if (!body) return null;
  return {
    topic: str(body?.category?.name) || str(body?.category?.id),
    items: list(body?.trendRank).map((item) => ({ keyword: str(item?.keyword), ratio: num(item?.ratio) })).filter((item) => item.keyword),
  };
}

function weeklyRecommendation(results: Results): AdvisorDailyRecord['weeklyRecommendation'] {
  const body = parsed(results, 'weeklyRecommendation')?.data?.category;
  if (!body) return null;
  return { category: str(body?.category), titles: list(body?.contentRank).map((item) => str(item?.title)).filter(Boolean) };
}

function categoryComparison(results: Results): AdvisorDailyRecord['categoryComparison'] {
  return list(parsed(results, 'categoryComparison')?.data).flatMap((group) => list(group?.categories).map((topic) => ({
    group: str(group?.name) || str(group?.id),
    topic: str(topic?.name) || str(topic?.id),
    value: num(topic?.metricValue),
    averageDuration: num(topic?.averageDuration),
  })));
}

function soaring(results: Results): AdvisorDailyRecord['soaring'] {
  return list(parsed(results, 'soaringContents')?.data).map((item) => ({
    contentId: str(item?.contentId),
    title: str(item?.title),
    value: num(item?.metricValue),
    delta: typeof item?.metricDeltaValue === 'number' ? item.metricDeltaValue : null,
  })).filter((row) => row.contentId);
}

function adImpressions(results: Results): AdvisorDailyRecord['adImpressions'] {
  return list(parsed(results, 'impressionClickRanks')?.impressionData?.data).map((item) => ({
    contentId: str(item?.contentId),
    click: num(item?.click),
    impression: num(item?.impression),
  })).filter((row) => row.contentId);
}

const HOMEFEED_KEY = 'mainInflowContentRanks';

function homefeedRows(results: Results, key: string, day: string): AdvisorDailyRecord['homefeedWeek'] {
  return list(parsed(results, key)?.data)
    .map((item, index) => ({ day, rank: index + 1, title: str(item?.title), url: str(item?.url) }))
    .filter((row) => row.title);
}

/** 어제(기본 키) 다음에 날짜 붙은 키(그 전 6일)를 최근 날짜부터 — 못 받은 날·빈 날은 행이 없다. */
function homefeedWeek(results: Results, day: string): AdvisorDailyRecord['homefeedWeek'] {
  const past = keysWithPrefix(results, `${HOMEFEED_KEY}:`)
    .map((key) => key.slice(HOMEFEED_KEY.length + 1))
    .sort((a, b) => b.localeCompare(a))
    .flatMap((pastDay) => homefeedRows(results, `${HOMEFEED_KEY}:${pastDay}`, pastDay));
  return [...homefeedRows(results, HOMEFEED_KEY, day), ...past];
}

function missingKeys(results: Results): string[] {
  const base = BASE_KEYS.filter((key) => parsed(results, key) === undefined);
  const followUps = Object.keys(results).filter((key) => !(BASE_KEYS as readonly string[]).includes(key) && parsed(results, key) === undefined);
  return [...base, ...followUps];
}

export function buildDailyRecord(ctx: AdvisorDailyContext & { collectedAt: Date }, results: Results): AdvisorDailyRecord {
  return {
    day: yesterday(ctx.now),
    collectedAt: ctx.collectedAt.toISOString(),
    channelId: ctx.channelId,
    posts: postRows(results),
    topicsDay: topicRows(results, 'd1RanksDay'),
    topicsWeek: topicRows(results, 'd1RanksWeek'),
    myHours: hourRows(results),
    topicHours: topicHourRows(results),
    popularKeywords: popularKeywords(results),
    topicKeywords: topicKeywordRows(results),
    homefeedTitles: list(parsed(results, 'mainInflowContentRanks')?.data).map((item) => ({ title: str(item?.title), url: str(item?.url) })).filter((row) => row.title),
    homefeedWeek: homefeedWeek(results, yesterday(ctx.now)),
    weeklyRecommendation: weeklyRecommendation(results),
    categoryComparison: categoryComparison(results),
    soaring: soaring(results),
    adImpressions: adImpressions(results),
    missing: missingKeys(results),
  };
}

/** `/accounts/channels` 응답(배열 또는 {data:[…]})에서 블로그 채널 아이디. 선택된 것 우선, 없으면 첫 블로그 채널. */
export function pickBlogChannelId(body: string): string | null {
  let json: any;
  try { json = JSON.parse(body); } catch { return null; }
  const channels = list(Array.isArray(json) ? json : json?.data).filter((c) => str(c?.service) === 'naver_blog' && str(c?.channelId));
  const chosen = channels.find((c) => c?.isSelected === true) ?? channels[0];
  return chosen ? str(chosen.channelId) : null;
}

export interface HomefeedDayPattern {
  daysMeasured: number;
  /** 홈판 유입 글이 한 편이라도 있던 날 수. */
  daysWithHomefeed: number;
  /** 홈판 탄 글의 발행 시(KST)별 편수, 시 오름차순. */
  hours: { hour: number; posts: number }[];
  /** 홈판 탄 날마다 그날 홈판 탄 글 편수(기록 순서). */
  postsPerDay: number[];
  /** 같은 통계일에 홈판 유입이 잡힌 글이 둘 이상일 때, 그 글들의 발행 시각 간격(분). 발행일은 서로 다를 수 있다(실측 30h 도 있었다). */
  gapsMinutes: number[];
}

function kstHour(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + KST_OFFSET_MS).getUTCHours() : null;
}

/** 홈판 유입이 실측된 글만 센다. 없으면 빈 패턴 — 일반 규칙("2시간 간격")을 지어내지 않는다. */
export function homefeedDayPattern(records: readonly AdvisorDailyRecord[]): HomefeedDayPattern {
  const hourCount = new Map<number, number>();
  const postsPerDay: number[] = [];
  const gapsMinutes: number[] = [];
  for (const record of records) {
    const hits = record.posts
      .filter((post) => post.homefeed && post.homefeed.count > 0 && post.publishedAt)
      .map((post) => Date.parse(post.publishedAt as string))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b);
    if (hits.length === 0) continue;
    postsPerDay.push(hits.length);
    for (const ms of hits) {
      const hour = kstHour(new Date(ms).toISOString());
      if (hour !== null) hourCount.set(hour, (hourCount.get(hour) ?? 0) + 1);
    }
    for (let i = 1; i < hits.length; i += 1) gapsMinutes.push(Math.round((hits[i] - hits[i - 1]) / 60000));
  }
  return {
    daysMeasured: records.length,
    daysWithHomefeed: postsPerDay.length,
    hours: [...hourCount.entries()].sort((a, b) => a[0] - b[0]).map(([hour, posts]) => ({ hour, posts })),
    postsPerDay,
    gapsMinutes,
  };
}

/**
 * 주제별 인기 검색어에 실측 월 검색량을 붙인다(2026-10-08 카톡방 아침 "주제별 인기검색어 TOP 20 · 17.3만").
 * 겹치는 키워드는 한 번만 묻는다. 워커는 띄어쓰기 없는 키로 준다. 조회가 실패해도 키워드는 그대로(검색량만 null). 원본은 바꾸지 않는다.
 */
export async function attachTopicVolumes(
  record: AdvisorDailyRecord,
  fetchVolumes: (keywords: string[]) => Promise<Record<string, number>>,
): Promise<AdvisorDailyRecord> {
  // 워커는 띄어쓰기 없는 대문자 꼴로 준다('테슬라모델Y') — 띄어쓰기 · 대소문자 무시하고 맞춘다
  const compact = (s: string) => String(s || '').replace(/\s+/g, '').toUpperCase();
  const keywords = [...new Set((record.topicKeywords || []).map((r) => r.keyword))];
  let volumes: Record<string, number> = {};
  try { volumes = keywords.length ? await fetchVolumes(keywords) : {}; } catch { volumes = {}; }
  const byKey = new Map(Object.entries(volumes || {}).map(([k, v]) => [compact(k), v]));
  return {
    ...record,
    topicKeywords: (record.topicKeywords || []).map((r) => {
      const v = byKey.get(compact(r.keyword));
      return { ...r, searchVolume: typeof v === 'number' && Number.isFinite(v) ? v : null };
    }),
  };
}
