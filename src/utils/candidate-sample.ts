/**
 * 검색량을 잴 표본을 뽑는다 — 선점 후보 발굴(scripts/preemption-candidates.js)의 표본 단계 (2026-09-15).
 *
 * 사장님 결정 "실용 말을 먼저 재기". 깔때기 실측(2026-09-15, 4주제 완결 문장 51,771개): 분류기가 정보 · 비교 · 거래로 본
 * 실용 의도 말 6,623개 중 3,087개(47%)가 표본 상한(주제당 4,000문장) 밖이라 검색량을 아예 안 쟀다.
 * 표본은 씨앗별로 돌아가며 뽑았고 의도 순서가 없었다.
 *
 * 표본 수와 관문은 그대로다. 순서만 바꾼다 — 두 번 돈다.
 *   ① 실용 의도 말을 씨앗별로 돌아가며
 *   ② 남은 자리를 나머지 말로, 씨앗별로 돌아가며
 * 씨앗별로 돌아가는 규칙은 지킨다 — 앞에서부터 자르면 첫 씨앗의 자동완성이 표본을 다 채운다(스크립트 주석의 옛 사고).
 * 하드 스톱으로 검색량을 중간에 끊을 때도 실용 말이 먼저 재인다.
 */
import { classifySearchIntent } from './keyword-intent';

export interface SampleCandidate {
  keyword: string;
  seed: string;
}

export interface MeasureSample<T extends SampleCandidate> {
  rows: T[];
  /** 문장 중 실용 의도로 분류된 수 */
  practicalTotal: number;
  /** 표본에 든 실용 의도 말 수 */
  practicalSampled: number;
}

/** 분류기(keyword-intent)가 정보 · 비교(구매 검토) · 거래로 보는 말. 새 분류를 짓지 않는다. */
export function isPracticalIntentKeyword(keyword: string): boolean {
  const text = String(keyword || '').trim();
  return text.length > 0 && classifySearchIntent(text).intent !== 'unknown';
}

/** 씨앗별 줄 — 씨앗이 처음 나온 순서, 줄 안은 들어온 순서 그대로. */
function queuesBySeed<T extends SampleCandidate>(rows: readonly T[]): T[][] {
  const queues = new Map<string, T[]>();
  for (const row of rows) {
    const queue = queues.get(row.seed);
    if (queue) queue.push(row);
    else queues.set(row.seed, [row]);
  }
  return [...queues.values()];
}

/** 씨앗 줄을 한 바퀴씩 돌며 하나씩 꺼낸다. room 개가 차거나 모든 줄이 비면 멈춘다. */
function takeRoundRobin<T>(queues: readonly T[][], room: number): T[] {
  const picked: T[] = [];
  for (let round = 0; picked.length < room; round += 1) {
    let added = 0;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      picked.push(queue[round]);
      added += 1;
      if (picked.length >= room) break;
    }
    if (added === 0) break;
  }
  return picked;
}

export function pickMeasureSample<T extends SampleCandidate>(
  candidates: Iterable<T>,
  sampleCap: number,
  isPractical: (row: T) => boolean = (row) => isPracticalIntentKeyword(row.keyword),
): MeasureSample<T> {
  const all = [...candidates];
  const flags = all.map((row) => isPractical(row));
  const practical = all.filter((_, index) => flags[index]);
  const rest = all.filter((_, index) => !flags[index]);
  const cap = Math.max(0, Math.floor(Number(sampleCap) || 0));
  const first = takeRoundRobin(queuesBySeed(practical), cap);
  const second = takeRoundRobin(queuesBySeed(rest), cap - first.length);
  return { rows: [...first, ...second], practicalTotal: practical.length, practicalSampled: first.length };
}
