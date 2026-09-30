/**
 * 최근 7일 홈판 본보기 — '오늘 쓸 글' 제목 프롬프트에 넣을 실제 홈판 제목을 고른다(2026-09-30 4단계).
 *
 * 재료: 하루 기록의 homefeedWeek(어제 + 그 전 6일 상위 20, 어드바이저 main-inflow-content-ranks 실측).
 * 옛 기록(homefeedWeek 없음)은 어제 것(homefeedTitles)만으로 간다.
 * 고르는 순서: 같은 글(url) 하나로 → 표면 규칙(길이·상투구·AI 티·껍데기) 통과한 것만 → 내 주제에 해당하는 제목이 앞
 * → 판 전체 틀 상한(같은 끝맺음 3 · 구어 어미 · 따옴표 스타터 — today-titles 와 같은 집계) → 상한 12.
 * '내 주제 해당'은 기록의 주제 검색어·인기 검색어·주제명 어절이 제목에 들었다는 매칭 사실이다. 점수·확률 같은 추정치는 없다.
 * 표면 규칙 SSoT 는 benchmark-title-engine 의 homefeedTitleSurfaceReasons — 카드 검사(checkBenchmarkTitle)와 같은 함수다.
 */
import { homefeedTitleSurfaceReasons } from '../benchmark-title-engine';
import { compactKey } from '../homefeed/text';
import type { AdvisorDailyRecord } from './daily-summary';
import { keywordWords } from './today-plan';
import { frameReason, tallyFor, tallyWith, type FrameTally } from './today-titles';

export interface HomefeedExemplar {
  day: string;
  /** 그 날 홈판 상위 20 안 순서(응답 순서). */
  rank: number;
  title: string;
  url: string;
  /** 내 주제 어휘(주제 검색어·인기 검색어·주제명)가 제목에 든 매칭 사실. */
  myTopic: boolean;
}

export interface HomefeedExemplarSet {
  /** 어제 홈판 상위 20 원 행 수(걸러진 뒤 수가 아니다). */
  yesterdayTotal: number;
  /** 어제 원 행 중 내 주제 어휘가 든 제목 수. */
  myTopicYesterday: number;
  /** 최근 7일 원 행 수. */
  weekTotal: number;
  exemplars: HomefeedExemplar[];
}

/** 프롬프트에 넣는 본보기 상한 — 판(10키워드 × 2)과 비슷한 크기라 틀 상한 몫도 같이 간다. */
export const HOMEFEED_EXEMPLAR_CAP = 12;

type WeekRow = AdvisorDailyRecord['homefeedWeek'][number];

/** 옛 기록은 homefeedWeek 가 없다 — 어제 제목(homefeedTitles)을 기록 날짜·순서로 옮긴다. */
function weekRows(record: AdvisorDailyRecord): WeekRow[] {
  if (Array.isArray(record.homefeedWeek)) return record.homefeedWeek;
  return (record.homefeedTitles || []).map((item, index) => ({ day: record.day, rank: index + 1, title: item.title, url: item.url }));
}

/** 내 주제 어휘 — 글 제목 어절은 '경우·그냥' 같은 흔한 말이 섞여 오탐이 나서 쓰지 않는다. 숫자로 시작하는 어절도 뺀다. */
function topicWords(record: AdvisorDailyRecord): string[] {
  const sources = [
    ...(record.topicKeywords || []).map((row) => row.keyword),
    ...(record.popularKeywords?.items || []).map((row) => row.keyword),
    ...(record.topicsDay || []).map((row) => row.topic),
    ...(record.topicsWeek || []).map((row) => row.topic),
  ];
  return [...new Set(sources.flatMap((source) => keywordWords(source)).filter((word) => !/^\d/.test(word)))];
}

const hasTopicWord = (title: string, words: readonly string[]): boolean => {
  const lower = title.toLowerCase();
  return words.some((word) => lower.includes(word));
};

/** 같은 글(url, 없으면 제목)은 최근 것 하나만 — 행은 이미 날짜 내림차순이다. */
function dedupeRows(rows: readonly HomefeedExemplar[]): HomefeedExemplar[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.url || compactKey(row.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 틀 상한을 지키며 앞에서부터 담는다 — 넘치는 갈래는 건너뛰고 다음 후보를 본다. */
function pickWithFrames(rows: readonly HomefeedExemplar[], cap: number): HomefeedExemplar[] {
  const picked = rows.reduce<{ items: HomefeedExemplar[]; tally: FrameTally }>((acc, row) => {
    if (acc.items.length >= cap || frameReason(row.title, acc.tally)) return acc;
    return { items: [...acc.items, row], tally: tallyWith(acc.tally, row.title) };
  }, { items: [], tally: tallyFor(cap) });
  return picked.items;
}

export function selectHomefeedExemplars(record: AdvisorDailyRecord, cap: number = HOMEFEED_EXEMPLAR_CAP): HomefeedExemplarSet {
  const words = topicWords(record);
  const rows: HomefeedExemplar[] = weekRows(record)
    .filter((row) => row.title)
    .map((row) => ({ day: row.day, rank: row.rank, title: row.title, url: row.url, myTopic: hasTopicWord(row.title, words) }));
  const yesterdayRows = rows.filter((row) => row.day === record.day);
  const clean = dedupeRows(rows).filter((row) => homefeedTitleSurfaceReasons(row.title).length === 0);
  // 내 주제가 앞, 그 안에서는 원래 순서(날짜 내림차순 · 순위) 그대로 — sort 는 안정 정렬이다
  const ordered = [...clean].sort((a, b) => Number(b.myTopic) - Number(a.myTopic));
  return {
    yesterdayTotal: yesterdayRows.length,
    myTopicYesterday: yesterdayRows.filter((row) => row.myTopic).length,
    weekTotal: rows.length,
    exemplars: pickWithFrames(ordered, cap),
  };
}
