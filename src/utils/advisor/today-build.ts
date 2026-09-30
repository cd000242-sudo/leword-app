/**
 * '오늘 쓸 글 10' 판 조립 — 후보(하루 기록) → 검색량 실측 → 앞줄 자리 실측 → 순위 → 골라진 것만 제목.
 *
 * 실측기는 밖에서 넣는다(deps) — 검색광고·브라우저·에이전트 CLI 는 핸들러가 붙인다.
 * 실측기 하나가 죽어도 판은 나온다: 그 열만 null 로 남고 notes 에 사유가 적힌다(0 으로 채우지 않는다).
 */
import type { BenchmarkTitleCard } from '../benchmark-title-engine';
import type { AdvisorDailyRecord, HomefeedDayPattern } from './daily-summary';
import { selectHomefeedExemplars, type HomefeedExemplarSet } from './homefeed-exemplars';
import {
  rankTodayKeywords,
  todayKeywordCandidates,
  todayTimeFacts,
  type TodayKeywordRow,
  type TodaySeat,
  type TodayTimeFacts,
} from './today-plan';
import { cardsForTodayKeywords, type TodayTitleFacts, type TodayTitles } from './today-titles';

export const TODAY_KEYWORD_COUNT = 10;
/** 자리 실측은 한 건에 몇 초씩 걸려 앞줄만 잰다(근거 개수·검색량 순). */
export const TODAY_SEAT_MEASURE_CAP = 20;

export interface TodayPlanDeps {
  /** 키워드 → 월간 검색량 실측(없으면 null). 키는 넣어 준 키워드 그대로. */
  searchVolume: (keywords: string[]) => Promise<Map<string, number | null>>;
  /** 키워드 → 자리 실측(못 잰 것은 null). */
  measureSeats: (keywords: string[]) => Promise<Map<string, TodaySeat | null>>;
  /**
   * 골라진 키워드 → 제목 사실 재료(자동완성 · 연관검색어 · 뉴스 제목). 없으면 재료 없이 청한다(옛 동작).
   * 실측기가 죽으면 빈 Map — 그러면 모든 키워드가 '재료 없음'으로 비고 notes 에 사유가 남는다(지어내지 않는다).
   */
  facts?: (keywords: string[]) => Promise<Map<string, TodayTitleFacts>>;
  /** exemplars = 최근 7일 실제 홈판 제목(틀 본보기). 프롬프트에 싣고 베낀 제목은 떨어뜨린다. */
  titles: (cards: BenchmarkTitleCard[], exemplars: string[]) => Promise<TodayTitles>;
}

export interface TodayPlan {
  /** 바탕이 된 통계 날짜(어제). */
  day: string;
  builtAt: string;
  channelId: string;
  candidatesTotal: number;
  keywords: TodayKeywordRow[];
  /** 값이 실제로 온 수 — 청한 수가 아니다. */
  measured: { searchVolume: number; seat: number };
  time: TodayTimeFacts;
  /** 최근 7일 홈판 실측 수와 제목 본보기 — 화면에 그대로 보인다(추정치 아님). */
  homefeed: HomefeedExemplarSet;
  titles: TodayTitles;
  /** 실측기 실패 사유 — 화면에 그대로. */
  notes: string[];
}

const compact = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Map 의 키가 공백·대소문자만 다를 수 있어 눌러서 찾는다. */
function lookup<T>(map: Map<string, T>, keyword: string): T | undefined {
  if (map.has(keyword)) return map.get(keyword);
  const key = compact(keyword);
  for (const [k, v] of map) if (compact(k) === key) return v;
  return undefined;
}

async function attempt<T>(label: string, run: () => Promise<Map<string, T>>, notes: string[]): Promise<Map<string, T>> {
  try {
    return await run();
  } catch (error) {
    notes.push(`${label} 실패: ${error instanceof Error ? error.message : String(error)}`);
    return new Map();
  }
}

export async function buildTodayPlan(record: AdvisorDailyRecord, pattern: HomefeedDayPattern, deps: TodayPlanDeps, now: Date = new Date()): Promise<TodayPlan> {
  const notes: string[] = [];
  const time = todayTimeFacts(record, pattern);
  const candidates = todayKeywordCandidates(record);
  const homefeed = selectHomefeedExemplars(record);
  const base = { day: record.day, builtAt: now.toISOString(), channelId: record.channelId, candidatesTotal: candidates.length, time, homefeed, notes };
  if (candidates.length === 0) {
    return { ...base, keywords: [], measured: { searchVolume: 0, seat: 0 }, titles: { status: 'ok', provider: null, items: [] } };
  }

  const volumes = await attempt('검색량 실측', () => deps.searchVolume(candidates.map((row) => row.keyword)), notes);
  const withVolume = candidates.map((row) => ({ ...row, searchVolume: lookup(volumes, row.keyword) ?? null }));

  const frontRow = rankTodayKeywords(withVolume, TODAY_SEAT_MEASURE_CAP).map((row) => row.keyword);
  const seats = await attempt('자리 실측', () => deps.measureSeats(frontRow), notes);
  const withSeat = withVolume.map((row) => ({ ...row, seat: lookup(seats, row.keyword) ?? null }));

  const keywords = rankTodayKeywords(withSeat, TODAY_KEYWORD_COUNT);
  const facts = deps.facts
    ? await attempt('제목 재료 수집', () => deps.facts!(keywords.map((row) => row.keyword)), notes)
    : undefined;
  const titles = await deps.titles(cardsForTodayKeywords(keywords, record, facts), homefeed.exemplars.map((row) => row.title));
  return {
    ...base,
    keywords,
    measured: {
      searchVolume: withSeat.filter((row) => row.searchVolume !== null).length,
      seat: withSeat.filter((row) => row.seat !== null).length,
    },
    titles,
  };
}
