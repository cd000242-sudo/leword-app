/**
 * 속도 실측(2026-11-02) — 뉴스 기사 시각 막대 · 앞섬/늦음 판정 · 7일 속도 성적표.
 *
 * 사장님: "다른 기사보다 빠르다는 말은 측정으로 입증될 때만." 그래서 이 파일은 이미 모은 값의 산술만 한다.
 *   - 센 값만 담는다(추정 · 보간 없음). 못 잰 것은 null 이고 화면은 '미측정'이다.
 *   - 한계를 숨기지 않는다: 수집 주기(resolutionMinutes), 앱이 꺼져 있던 구간(검열), 표본이 상한에 닿은 경우를 결과에 싣는다.
 * 순수 함수만 둔다(파일 · 네트워크 · 시계 없음). ledger.ts · collector.ts · publish.ts 가 가져다 쓴다 — 순환 import 없음(types 만 본다).
 */
import type {
  HomefeedLead,
  HomefeedLeadReason,
  HomefeedNewsBuckets,
  HomefeedNewsObservation,
  HomefeedNewsProbe,
  HomefeedSignalStateEntry,
  HomefeedSpeedScoreboard,
} from './types';

/** 뉴스 검색 한 번에 요청하는 표본 크기 — 네이버 뉴스 검색 display 상한. 호출 횟수는 그대로이고 한 번에 더 받는다. */
export const HOMEFEED_NEWS_MEASURE_LIMIT = 100;
export const NEWS_BUCKET_WINDOW_HOURS = 12;
export const NEWS_BUCKET_MINUTES = 30;
export const SPEED_WINDOW_DAYS = 7;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** 수집 주기 기본값(settings 기본과 같다) — 올바르지 않은 값이 들어왔을 때만 쓴다. */
const DEFAULT_RESOLUTION_MINUTES = 10;
/** 한국 표준시(일광절약 없음) — '측정된 날'의 경계. */
const KST_OFFSET_MS = 9 * 3_600_000;

const LEAD_REASONS: readonly HomefeedLeadReason[] = ['censored', 'no_first_seen', 'sample_capped', 'no_news_sample', 'within_one_minute'];

type TimeLike = string | null | undefined;

function parseTime(value: TimeLike): number {
  return typeof value === 'string' && value ? Date.parse(value) : Number.NaN;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

/**
 * 기사 시각을 구간별로 센다. 구간은 수집 시각(endAtMs)에서 거꾸로 이어 붙인다 — 마지막 칸이 항상 꽉 찬 구간이다.
 * 구간 i 는 [start + i·b, start + (i+1)·b), 마지막 칸만 endAt 을 포함한다.
 */
export function bucketNewsTimes(
  publishedAts: readonly TimeLike[],
  endAtMs: number,
  options: { windowHours?: number; bucketMinutes?: number } = {},
): HomefeedNewsBuckets {
  if (!Number.isFinite(endAtMs)) throw new Error('수집 시각이 올바르지 않습니다.');
  const bucketMinutes = positiveInt(options.bucketMinutes, NEWS_BUCKET_MINUTES);
  const windowHours = positiveInt(options.windowHours, NEWS_BUCKET_WINDOW_HOURS);
  const bucketMs = bucketMinutes * MINUTE_MS;
  const size = Math.max(1, Math.floor((windowHours * 60) / bucketMinutes));
  const startMs = endAtMs - size * bucketMs;
  const counts = new Array<number>(size).fill(0);
  let undated = 0;
  let outOfRange = 0;
  for (const value of publishedAts) {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) { undated += 1; continue; }
    if (ms < startMs || ms > endAtMs) { outOfRange += 1; continue; }
    counts[Math.min(size - 1, Math.floor((ms - startMs) / bucketMs))] += 1;
  }
  return {
    endAt: new Date(endAtMs).toISOString(),
    bucketMinutes,
    counts,
    counted: counts.reduce((sum, value) => sum + value, 0),
    undated,
    outOfRange,
  };
}

/** 읽을 수 있는 시각 중 가장 이른 것(ISO). 하나도 없으면 null. */
export function earliestNewsAt(publishedAts: readonly TimeLike[]): string | null {
  let best = Number.NaN;
  for (const value of publishedAts) {
    const ms = parseTime(value);
    if (Number.isFinite(ms) && !(ms >= best)) best = ms;
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}

/**
 * 뉴스 표본이 상한에 닿았는가 — 닿았으면 더 이른 기사가 표본 밖에 있을 수 있다.
 * 검색 total 이 요청 크기 이하면 전부 받은 것이다. total 을 모르면 받은 개수가 요청 크기에 닿았는지로만 본다.
 */
export function isNewsSampleCapped(input: { total: number | null; returned: number; limit: number }): boolean {
  if (typeof input.total === 'number' && Number.isFinite(input.total)) return input.total > input.limit;
  return input.returned >= input.limit;
}

function earlier(a: string | null, b: string | null): string | null {
  return earliestNewsAt([a, b]);
}

/**
 * 회차마다 이슈의 뉴스 표본 기록을 합친다(새 객체).
 * 상한에 안 닿은 표본만 '가장 이른 기사 시각'으로 쓴다. 뉴스 색인이 늦게 따라와 더 이른 기사가 뒤늦게 보이면 그 시각으로 내려간다.
 */
export function mergeNewsProbe(prev: HomefeedNewsProbe | null | undefined, observation: HomefeedNewsObservation): HomefeedNewsProbe {
  const base: HomefeedNewsProbe = prev ?? { earliestAt: null, completeSeen: false, cappedSeen: false };
  if (observation.capped) return { ...base, cappedSeen: true };
  return { earliestAt: earlier(base.earliestAt, observation.earliestAt), completeSeen: true, cappedSeen: base.cappedSeen };
}

function validResolution(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESOLUTION_MINUTES;
}

/**
 * 우리가 처음 본 시각 − 뉴스 표본의 가장 이른 기사 시각.
 * 앞섬: 우리가 먼저 봤다. 늦음: 뉴스가 먼저였다. 미측정 사유는 앞에서부터 하나만 적는다
 * (처음 본 시각 없음 → 검열 → 표본 상한 → 뉴스 표본 없음 → 같은 분).
 * 처음 본 시각은 수집 주기(resolutionMinutes) 안에서만 맞다 — 결과에 같이 싣는다.
 */
export function computeLead(input: {
  firstSeenAt: TimeLike;
  firstSeenCensored: boolean;
  newsPublishedAts: readonly TimeLike[];
  sampleCapped: boolean;
  resolutionMinutes: number;
}): HomefeedLead {
  const resolutionMinutes = validResolution(input.resolutionMinutes);
  const firstSeenMs = parseTime(input.firstSeenAt);
  const firstSeenAt = Number.isFinite(firstSeenMs) ? new Date(firstSeenMs).toISOString() : null;
  const unmeasured = (reason: HomefeedLeadReason, firstNewsAt: string | null = null): HomefeedLead => (
    { status: 'unmeasured', minutes: null, reason, resolutionMinutes, firstSeenAt, firstNewsAt }
  );
  if (firstSeenAt === null) return unmeasured('no_first_seen');
  if (input.firstSeenCensored) return unmeasured('censored');
  if (input.sampleCapped) return unmeasured('sample_capped');
  const firstNewsAt = earliestNewsAt(input.newsPublishedAts);
  if (firstNewsAt === null) return unmeasured('no_news_sample');
  const diffMs = Date.parse(firstNewsAt) - firstSeenMs;
  if (Math.abs(diffMs) < MINUTE_MS) return unmeasured('within_one_minute', firstNewsAt);
  return {
    status: diffMs > 0 ? 'ahead' : 'behind',
    minutes: Math.round(Math.abs(diffMs) / MINUTE_MS),
    reason: null,
    resolutionMinutes,
    firstSeenAt,
    firstNewsAt,
  };
}

/** 장부 항목(처음 본 시각 + 뉴스 표본 기록)으로 판정한다. 항목이 없으면 처음 본 시각이 없는 것이다. */
export function leadFromEntry(entry: HomefeedSignalStateEntry | null | undefined, resolutionMinutes: number): HomefeedLead {
  const probe = entry?.newsProbe;
  return computeLead({
    firstSeenAt: entry?.firstSeenAt,
    firstSeenCensored: entry?.firstSeenCensored ?? false,
    newsPublishedAts: probe?.earliestAt ? [probe.earliestAt] : [],
    // 전부 받은 표본이 한 번이라도 있으면 그것으로 판정한다. 상한에 닿은 표본뿐일 때만 막는다.
    sampleCapped: Boolean(probe && !probe.completeSeen && probe.cappedSeen),
    resolutionMinutes,
  });
}

function kstDay(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

/**
 * 장부의 최근 windowDays 일 이슈에 판정을 적용해 센다.
 * 측정된 날 = 앞섬/늦음이 하나라도 잰 한국 달력일. windowDays 에 못 미치면 ready=false 이고 화면은 '기록 쌓는 중'만 보인다.
 */
export function computeSpeedScoreboard(
  entries: Readonly<Record<string, HomefeedSignalStateEntry>>,
  nowMs: number,
  options: { windowDays?: number; resolutionMinutes?: number } = {},
): HomefeedSpeedScoreboard {
  const windowDays = positiveInt(options.windowDays, SPEED_WINDOW_DAYS);
  const resolutionMinutes = validResolution(options.resolutionMinutes ?? DEFAULT_RESOLUTION_MINUTES);
  const fromMs = nowMs - windowDays * DAY_MS;
  const measuredDaySet = new Set<number>();
  const unmeasuredReasons: Partial<Record<HomefeedLeadReason, number>> = {};
  let total = 0;
  let ahead = 0;
  let behind = 0;
  let unmeasured = 0;
  for (const entry of Object.values(entries)) {
    const firstMs = parseTime(entry.firstSeenAt);
    if (!Number.isFinite(firstMs) || firstMs < fromMs || firstMs > nowMs) continue;
    total += 1;
    const lead = leadFromEntry(entry, resolutionMinutes);
    if (lead.status === 'ahead') ahead += 1;
    else if (lead.status === 'behind') behind += 1;
    else {
      unmeasured += 1;
      if (lead.reason) unmeasuredReasons[lead.reason] = (unmeasuredReasons[lead.reason] ?? 0) + 1;
    }
    if (lead.status !== 'unmeasured') measuredDaySet.add(kstDay(firstMs));
  }
  const measuredDays = Math.min(measuredDaySet.size, windowDays);
  return {
    windowDays,
    measuredDays,
    ready: measuredDays >= windowDays,
    total,
    ahead,
    behind,
    unmeasured,
    unmeasuredReasons,
    resolutionMinutes,
    computedAt: new Date(nowMs).toISOString(),
  };
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** 공개 발행 경계 — 바깥(앱 응답)에서 온 성적표를 검사해 모양이 맞을 때만 돌려준다. 아니면 null(칸을 비운다). */
export function normalizeSpeedScoreboard(value: unknown): HomefeedSpeedScoreboard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const windowDays = count(row.windowDays);
  const measuredDays = count(row.measuredDays);
  const total = count(row.total);
  const ahead = count(row.ahead);
  const behind = count(row.behind);
  const unmeasured = count(row.unmeasured);
  const resolutionMinutes = typeof row.resolutionMinutes === 'number' && row.resolutionMinutes > 0 && Number.isFinite(row.resolutionMinutes) ? row.resolutionMinutes : null;
  if ([windowDays, measuredDays, total, ahead, behind, unmeasured, resolutionMinutes].some((item) => item === null)) return null;
  if (typeof row.ready !== 'boolean' || typeof row.computedAt !== 'string' || !row.computedAt) return null;
  const rawReasons = row.unmeasuredReasons && typeof row.unmeasuredReasons === 'object' ? row.unmeasuredReasons as Record<string, unknown> : {};
  const unmeasuredReasons: Partial<Record<HomefeedLeadReason, number>> = {};
  for (const reason of LEAD_REASONS) {
    const reasonCount = count(rawReasons[reason]);
    if (reasonCount !== null && reasonCount > 0) unmeasuredReasons[reason] = reasonCount;
  }
  return {
    windowDays: windowDays as number,
    measuredDays: measuredDays as number,
    ready: row.ready,
    total: total as number,
    ahead: ahead as number,
    behind: behind as number,
    unmeasured: unmeasured as number,
    unmeasuredReasons,
    resolutionMinutes: resolutionMinutes as number,
    computedAt: row.computedAt,
  };
}
