/**
 * 실검 틈새 발행본의 이월 행 재측정 — 검색량(검색광고)·추세(데이터랩)만 다시 잰다.
 *
 * 왜 필요한가(실사고 2026-09-03): 갓 태어난 이슈 키워드는 첫 회차에 키워드도구가
 * 모른다(검색량 null). 행은 48시간 이월되는데 그동안 아무도 다시 안 재서, 도구가
 * 이미 알게 된 뒤에도 화면엔 '—' 로 남았다('지예은 남편'). 그래프도 같다 — 데이터랩이
 * 첫날 0점을 주면 카드에 그래프가 영영 없다.
 *
 * 여기는 순수 함수만 있다 — 누구를 잴지 고르고, 잰 값을 새 행으로 돌려준다. 판정
 * (verdict)은 건드리지 않는다: 선점 후보가 수요를 얻었는지는 헌터가 다음 회차에 다시
 * 판정할 일이지, 재측정이 몰래 바꿀 일이 아니다. 숫자가 있는 검색량은 절대 지우지 않는다.
 */

import type { BoardTrend } from './issue-niche-board-shape';
import type { SearchAdVolumeRead } from './searchad-volume-read';

/** 검색량이 없는 행은 이만큼 지나면 다시 잰다 — 같은 회차 안의 중복 호출만 막는다. */
export const VOLUME_STALE_MS = 60 * 60 * 1000;
/** 그래프가 있는 행은 이만큼 지나면 추세를 갱신한다(회차 간격과 같다). */
export const TREND_STALE_MS = 6 * 60 * 60 * 1000;

export type RemeasurableRow = {
  keyword: string;
  searchVolume: number | null;
  searchVolumeLt10?: boolean;
  searchVolumeMeasuredAt?: string;
  measuredAt: string;
  trend?: BoardTrend | null;
  carried?: boolean;
};

export type TrendRead = { series: number[]; label?: string; recommendation?: string };

function compactKey(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function parseMs(value: unknown): number {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

/** 검색량을 마지막으로 잰 시각 — 재측정 기록이 없으면 행의 measuredAt 이다. */
export function volumeMeasuredMs(row: RemeasurableRow): number {
  return parseMs(row.searchVolumeMeasuredAt) || parseMs(row.measuredAt);
}

/** 추세를 마지막으로 잰 시각 — 재측정 기록이 없으면 행의 measuredAt 이다. */
export function trendMeasuredMs(row: RemeasurableRow): number {
  return parseMs(row.trend?.measuredAt) || parseMs(row.measuredAt);
}

export function hasTrendGraph(row: RemeasurableRow): boolean {
  return Array.isArray(row.trend?.series) && (row.trend?.series.length ?? 0) >= 2;
}

/** 검색량이 없고(숫자 아님) 마지막 측정이 한 시간 넘은 행. 키워드는 중복 없이. */
export function pickVolumeTargets(rows: RemeasurableRow[], nowMs: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (typeof row.searchVolume === 'number') continue;
    if (nowMs - volumeMeasuredMs(row) < VOLUME_STALE_MS) continue;
    const key = compactKey(row.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.keyword);
  }
  return out;
}

/** 그래프가 없으면 한 시간, 있으면 여섯 시간 지난 행. 키워드는 중복 없이. */
export function pickTrendTargets(rows: RemeasurableRow[], nowMs: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const stale = hasTrendGraph(row) ? TREND_STALE_MS : VOLUME_STALE_MS;
    if (nowMs - trendMeasuredMs(row) < stale) continue;
    const key = compactKey(row.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.keyword);
  }
  return out;
}

/**
 * 검색량 읽기를 행에 입힌다 — 새 배열·새 행이다. 숫자가 이미 있는 행은 그대로 둔다.
 * 추정으로 표시된 값은 싣지 않는다(발행기와 같은 규칙). 도구에 여전히 없어도
 * searchVolumeMeasuredAt 은 찍는다 — 잰 사실은 사실이다.
 */
export function applyVolume<T extends RemeasurableRow>(
  rows: T[],
  reads: Map<string, SearchAdVolumeRead>,
  measuredAt: string,
): T[] {
  return rows.map((row) => {
    if (typeof row.searchVolume === 'number') return row;
    const read = reads.get(compactKey(row.keyword));
    if (!read) return row;
    return {
      ...row,
      searchVolume: read.isSearchVolumeEstimated ? null : read.searchVolume,
      searchVolumeLt10: read.searchVolumeLt10,
      searchVolumeMeasuredAt: measuredAt,
    };
  });
}

/**
 * 추세 읽기를 행에 입힌다 — 두 점 이상일 때만. 0~1점이면 행을 그대로 둔다(빈 그래프를
 * 지어내지 않는다). 값은 데이터랩 상대지수를 반올림한 것이다.
 */
export function applyTrend<T extends RemeasurableRow>(
  rows: T[],
  reads: Map<string, TrendRead>,
  measuredAt: string,
): T[] {
  return rows.map((row) => {
    const read = reads.get(compactKey(row.keyword));
    if (!read || !Array.isArray(read.series) || read.series.length < 2) return row;
    const trend: BoardTrend = {
      series: read.series.map((v) => Math.round(Number(v) || 0)),
      ...(read.label ? { label: read.label } : {}),
      ...(read.recommendation ? { recommendation: read.recommendation } : {}),
      measuredAt,
    };
    return { ...row, trend };
  });
}

/** 읽기 결과를 compactKey 로 찾는 지도로 — 검색광고는 요청한 표기 그대로 돌려주지만 안전하게. */
export function keyReads<V>(entries: Array<{ keyword: string; read: V }>): Map<string, V> {
  return new Map(entries.map((e) => [compactKey(e.keyword), e.read]));
}
