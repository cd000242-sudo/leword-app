/**
 * '오늘 쓸 글 10' 판 — 순수 함수 (D 판, docs/my-blog-homefeed-fit-plan-2026-09-30.md).
 *
 * 후보는 어드바이저 하루 기록에서만 나온다: 내 주제 인기 검색어(주간) ∪ 내 주제 트렌드 검색어(일간).
 * 각 후보에 붙는 것은 전부 사실이다 — 어느 창구가 가리켰나(근거 이름), 내 글 중 그 말이 든 편수와
 * 그중 홈판 탄 편수, 오늘 홈판에 뜬 같은 말 제목 수, 검색량 실측, 자리 실측.
 * 확률·예상 트래픽·점수는 없다. 순위는 실측 자리 → 근거 개수 → 검색량 순서의 정렬일 뿐이다.
 */
import type { SeatVerdict } from '../seat-measure';
import type { AdvisorDailyRecord, HomefeedDayPattern } from './daily-summary';

/** 근거 창구 이름 — 화면은 이 이름을 초보자 말로 바꿔 보여준다. */
export type TodayEvidence = 'popularWeek' | 'trendDay' | 'risingDay' | 'myTopic' | 'myPost' | 'homefeedTitle';

export interface TodaySeat {
  verdict: SeatVerdict;
  facing: number;
  vacancy: number | null;
  sampled: number;
}

export interface TodayKeywordRow {
  keyword: string;
  topic: string;
  evidence: TodayEvidence[];
  /** 트렌드 검색어 순위 변동(어드바이저 rankChange). 인기 검색어에만 있으면 null. */
  rankChange: number | null;
  /** 내 글 중 이 말(어절)이 제목에 든 편수 · 그중 홈판 탄 편수 · 홈판을 못 잰 편수. */
  myPosts: { count: number; homefeedHits: number; unmeasured: number };
  /** 오늘 홈판에 뜬 글 제목 중 이 말이 든 것 수. */
  homefeedTitleMatches: number;
  /** 검색광고 월간 검색량 실측. 안 잰 것은 null. */
  searchVolume: number | null;
  /** 자리 실측기 결과. 안 잰 것은 null. */
  seat: TodaySeat | null;
}

export interface TodayHourValue { hour: number; value: number }

export interface TodayTimeFacts {
  /** 어제 내 유입이 있던 시각(많은 순). */
  myHoursYesterday: TodayHourValue[];
  /** 30일 평균 내 유입 시각(많은 순). */
  myHoursMonth: TodayHourValue[];
  /** 내 1순위 주제 독자가 읽는 시각(비율, 많은 순). */
  topicHours: { topic: string; hours: TodayHourValue[] } | null;
  /** 홈판 탄 날 내 발행 패턴 실측 — 탄 날이 없으면 null(일반 규칙으로 채우지 않는다). */
  homefeedPublish: {
    daysWithHomefeed: number;
    daysMeasured: number;
    hours: { hour: number; posts: number }[];
    postsPerDay: number[];
    gapsMinutes: number[];
  } | null;
}

const HOURS_SHOWN = 5;

const compact = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** 어절 — 기호를 떼고 소문자, 두 글자 이상만. */
export function keywordWords(keyword: string): string[] {
  return String(keyword || '')
    .split(/\s+/)
    .map((token) => token.replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase())
    .filter((token) => token.length >= 2);
}

/** 매칭에 쓰는 어절 — 숫자로 시작하는 어절('2027')은 다른 글에도 흔해 빼되, 전부 숫자면 그대로. */
function matchWords(keyword: string): string[] {
  const words = keywordWords(keyword);
  const named = words.filter((word) => !/^\d/.test(word));
  return named.length > 0 ? named : words;
}

const titleHasAny = (title: string, words: string[]) => {
  const lower = String(title || '').toLowerCase();
  return words.some((word) => lower.includes(word));
};

interface Seed { keyword: string; topic: string; evidence: TodayEvidence[]; rankChange: number | null }

/** 인기 검색어 → 트렌드 검색어 순서로 모으고, 공백·대소문자만 다른 말은 하나로 합친다. */
function seeds(record: AdvisorDailyRecord): Seed[] {
  const out: Seed[] = [];
  const index = new Map<string, number>();
  const push = (keyword: string, topic: string, evidence: TodayEvidence[], rankChange: number | null) => {
    const trimmed = String(keyword || '').trim();
    if (!trimmed) return;
    const key = compact(trimmed);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ keyword: trimmed, topic, evidence, rankChange });
      return;
    }
    const prev = out[at];
    out[at] = {
      ...prev,
      evidence: [...prev.evidence, ...evidence.filter((name) => !prev.evidence.includes(name))],
      rankChange: prev.rankChange ?? rankChange,
    };
  };
  const popular = record.popularKeywords;
  for (const item of popular?.items || []) push(item.keyword, popular?.topic || '', ['popularWeek'], null);
  for (const item of record.topicKeywords || []) {
    const evidence: TodayEvidence[] = item.rankChange !== null && item.rankChange > 0 ? ['trendDay', 'risingDay'] : ['trendDay'];
    push(item.keyword, item.topic, evidence, item.rankChange);
  }
  return out;
}

/** 하루 기록 → 후보 행(검색량·자리는 아직 null — 실측기가 채운다). */
export function todayKeywordCandidates(record: AdvisorDailyRecord): TodayKeywordRow[] {
  const myTopics = new Set([...(record.topicsDay || []), ...(record.topicsWeek || [])].map((row) => row.topic));
  return seeds(record).map((seed) => {
    const words = matchWords(seed.keyword);
    const mine = (record.posts || []).filter((post) => titleHasAny(post.title, words));
    const myPosts = {
      count: mine.length,
      homefeedHits: mine.filter((post) => post.homefeed !== null && post.homefeed.count > 0).length,
      unmeasured: mine.filter((post) => post.homefeed === null).length,
    };
    const homefeedTitleMatches = (record.homefeedTitles || []).filter((row) => titleHasAny(row.title, words)).length;
    const evidence: TodayEvidence[] = [
      ...seed.evidence,
      ...(seed.topic && myTopics.has(seed.topic) ? (['myTopic'] as TodayEvidence[]) : []),
      ...(myPosts.count > 0 ? (['myPost'] as TodayEvidence[]) : []),
      ...(homefeedTitleMatches > 0 ? (['homefeedTitle'] as TodayEvidence[]) : []),
    ];
    return {
      keyword: seed.keyword,
      topic: seed.topic,
      evidence,
      rankChange: seed.rankChange,
      myPosts,
      homefeedTitleMatches,
      searchVolume: null,
      seat: null,
    };
  });
}

/** 자리 실측 순서 — 열림 0 · 반열림 1 · 잠김/카드답/자료없음 2 · 안 잼 3. */
function seatOrder(seat: TodaySeat | null): number {
  if (!seat) return 3;
  if (seat.verdict === '열림') return 0;
  if (seat.verdict === '반열림') return 1;
  return 2;
}

/** 실측 자리 → 근거 개수 → 검색량. 원본은 건드리지 않는다. */
export function rankTodayKeywords(rows: readonly TodayKeywordRow[], cap: number): TodayKeywordRow[] {
  return [...rows]
    .sort((a, b) =>
      seatOrder(a.seat) - seatOrder(b.seat)
      || b.evidence.length - a.evidence.length
      || (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, Math.max(0, cap));
}

const topHours = (rows: TodayHourValue[]) =>
  rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, HOURS_SHOWN);

/** 시간대 사실 세 줄 + 홈판 탄 날 발행 패턴. 규칙을 지어내지 않는다. */
export function todayTimeFacts(record: AdvisorDailyRecord, pattern: HomefeedDayPattern): TodayTimeFacts {
  const first = (record.topicHours || [])[0];
  return {
    myHoursYesterday: topHours((record.myHours || []).map((row) => ({ hour: row.hour, value: row.yesterday }))),
    myHoursMonth: topHours((record.myHours || []).map((row) => ({ hour: row.hour, value: row.monthAverage }))),
    topicHours: first ? { topic: first.topic, hours: topHours(first.hours.map((row) => ({ hour: row.hour, value: row.ratio }))) } : null,
    homefeedPublish: pattern.daysWithHomefeed > 0
      ? {
        daysWithHomefeed: pattern.daysWithHomefeed,
        daysMeasured: pattern.daysMeasured,
        hours: pattern.hours,
        postsPerDay: pattern.postsPerDay,
        gapsMinutes: pattern.gapsMinutes,
      }
      : null,
  };
}
