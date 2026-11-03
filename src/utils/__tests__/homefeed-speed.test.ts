import { describe, expect, it } from 'vitest';
import {
  HOMEFEED_NEWS_MEASURE_LIMIT,
  bucketNewsTimes,
  computeLead,
  computeSpeedScoreboard,
  earliestNewsAt,
  isNewsSampleCapped,
  leadFromEntry,
  mergeNewsProbe,
  normalizeSpeedScoreboard,
} from '../homefeed/speed';
import type { HomefeedNewsProbe, HomefeedSignalStateEntry } from '../homefeed/types';
import { at, T0 } from './homefeed-fixtures';

/**
 * 홈판 속도 실측(2026-11-02) — 뉴스 기사 시각 막대 · 앞섬/늦음 판정 · 7일 속도 성적표.
 * 전부 이미 모은 값의 산술이다. 못 잰 것은 '미측정'(null) 이고 추정 · 보간은 하지 않는다.
 * 시각은 절대값(fixtures 의 at)으로만 넘긴다 — 벽시계를 쓰지 않는다.
 */

describe('뉴스 기사 시각 막대', () => {
  const end = Date.parse(at(600));

  it('최근 12시간을 30분씩 24칸으로 세고, 오른쪽 끝이 수집 시각이다', () => {
    const result = bucketNewsTimes([at(600), at(599), at(570), at(569), at(-120)], end);
    expect(result.counts).toHaveLength(24);
    expect(result.bucketMinutes).toBe(30);
    expect(result.endAt).toBe(at(600));
    // 수집 시각 · 1분 전 · 30분 전 경계 → 마지막 칸, 31분 전 → 그 앞 칸, 12시간 전 경계 → 첫 칸
    expect(result.counts[23]).toBe(3);
    expect(result.counts[22]).toBe(1);
    expect(result.counts[0]).toBe(1);
    expect(result.counted).toBe(5);
    expect(result.counts.reduce((sum, value) => sum + value, 0)).toBe(result.counted);
  });

  it('시각이 없거나 읽을 수 없으면 막대에서 빼고 개수만 따로 센다', () => {
    const result = bucketNewsTimes([at(590), null, undefined, '', '시각아님', at(580)], end);
    expect(result.counted).toBe(2);
    expect(result.undated).toBe(4);
    expect(result.outOfRange).toBe(0);
  });

  it('범위 밖(12시간보다 오래됨 · 수집 시각보다 뒤)도 막대에 넣지 않고 따로 센다', () => {
    const result = bucketNewsTimes([at(-121), at(601), at(300)], end);
    expect(result.counted).toBe(1);
    expect(result.outOfRange).toBe(2);
    expect(result.undated).toBe(0);
  });

  it('기사가 없으면 전부 0 이다 — 채워 넣지 않는다', () => {
    const result = bucketNewsTimes([], end);
    expect(result.counts.every((value) => value === 0)).toBe(true);
    expect(result).toMatchObject({ counted: 0, undated: 0, outOfRange: 0 });
  });

  it('창 길이와 칸 길이를 바꿀 수 있고, 입력 배열은 건드리지 않는다', () => {
    const input = Object.freeze([at(595), at(541)]);
    const result = bucketNewsTimes(input, end, { windowHours: 1, bucketMinutes: 10 });
    expect(result.counts).toHaveLength(6);
    expect(result.counts[5]).toBe(1);
    expect(result.counts[0]).toBe(1);
    expect(input).toHaveLength(2);
  });

  it('수집 시각이 올바르지 않으면 만들지 않는다', () => {
    expect(() => bucketNewsTimes([at(0)], Number.NaN)).toThrow();
  });
});

describe('가장 이른 기사 시각 · 표본 상한', () => {
  it('읽을 수 있는 시각 중 가장 이른 것을 ISO 로 돌려주고, 없으면 null', () => {
    expect(earliestNewsAt([at(30), '시각아님', null, at(5), at(12)])).toBe(at(5));
    expect(earliestNewsAt([])).toBeNull();
    expect(earliestNewsAt([null, undefined, 'x'])).toBeNull();
  });

  it('검색 total 이 요청 크기를 넘으면 상한에 닿은 것이다', () => {
    expect(HOMEFEED_NEWS_MEASURE_LIMIT).toBe(100);
    expect(isNewsSampleCapped({ total: 50, returned: 50, limit: 100 })).toBe(false);
    expect(isNewsSampleCapped({ total: 100, returned: 100, limit: 100 })).toBe(false);
    expect(isNewsSampleCapped({ total: 101, returned: 100, limit: 100 })).toBe(true);
    expect(isNewsSampleCapped({ total: 5000, returned: 10, limit: 100 })).toBe(true);
  });

  it('total 을 모르면 받은 개수가 요청 크기에 닿았는지로만 본다', () => {
    expect(isNewsSampleCapped({ total: null, returned: 100, limit: 100 })).toBe(true);
    expect(isNewsSampleCapped({ total: null, returned: 40, limit: 100 })).toBe(false);
  });
});

describe('뉴스 표본 기록 합치기', () => {
  it('상한에 안 닿은 표본에서 본 가장 이른 시각을 지킨다', () => {
    const first = mergeNewsProbe(undefined, { earliestAt: at(25), capped: false });
    expect(first).toEqual({ earliestAt: at(25), completeSeen: true, cappedSeen: false });
    // 뉴스 색인이 늦게 따라와 더 이른 기사가 뒤늦게 보이면 그 시각으로 내려간다.
    const later = mergeNewsProbe(first, { earliestAt: at(15), capped: false });
    expect(later.earliestAt).toBe(at(15));
    // 기사가 한 건도 없는 회차는 앞서 본 시각을 지우지 않는다.
    expect(mergeNewsProbe(later, { earliestAt: null, capped: false }).earliestAt).toBe(at(15));
  });

  it('상한에 닿은 표본은 가장 이른 시각으로 쓰지 않는다 — 더 이른 기사가 표본 밖에 있을 수 있다', () => {
    const capped = mergeNewsProbe(undefined, { earliestAt: at(40), capped: true });
    expect(capped).toEqual({ earliestAt: null, completeSeen: false, cappedSeen: true });
    const complete: HomefeedNewsProbe = { earliestAt: at(25), completeSeen: true, cappedSeen: false };
    expect(mergeNewsProbe(complete, { earliestAt: at(3), capped: true })).toEqual({ earliestAt: at(25), completeSeen: true, cappedSeen: true });
  });

  it('입력 객체를 바꾸지 않는다', () => {
    const prev = Object.freeze({ earliestAt: at(25), completeSeen: true, cappedSeen: false });
    const next = mergeNewsProbe(prev, { earliestAt: at(10), capped: false });
    expect(prev.earliestAt).toBe(at(25));
    expect(next).not.toBe(prev);
  });
});

describe('앞섬/늦음 판정', () => {
  const base = { firstSeenCensored: false, sampleCapped: false, resolutionMinutes: 10 };

  it('우리가 먼저 봤으면 앞섬 — 뉴스 첫 기사까지 걸린 분을 담고, 오차 한계를 같이 싣는다', () => {
    expect(computeLead({ ...base, firstSeenAt: at(0), newsPublishedAts: [at(25), at(40)] })).toEqual({
      status: 'ahead', minutes: 25, reason: null, resolutionMinutes: 10, firstSeenAt: at(0), firstNewsAt: at(25),
    });
  });

  it('뉴스가 먼저였으면 늦음 — 표본 안 가장 이른 기사를 기준으로 한다', () => {
    const lead = computeLead({ ...base, firstSeenAt: at(30), newsPublishedAts: [at(20), at(5), at(12)] });
    expect(lead).toMatchObject({ status: 'behind', minutes: 25, reason: null, firstNewsAt: at(5) });
  });

  it('앱이 꺼져 있던 구간에 처음 본 이슈(검열)는 미측정 — 뉴스가 있어도 판정하지 않는다', () => {
    const lead = computeLead({ ...base, firstSeenCensored: true, firstSeenAt: at(0), newsPublishedAts: [at(25)] });
    expect(lead).toMatchObject({ status: 'unmeasured', minutes: null, reason: 'censored', firstNewsAt: null });
  });

  it('표본이 상한에 닿았으면 미측정 — 더 이른 기사가 표본 밖에 있을 수 있다', () => {
    const lead = computeLead({ ...base, sampleCapped: true, firstSeenAt: at(0), newsPublishedAts: [at(25)] });
    expect(lead).toMatchObject({ status: 'unmeasured', minutes: null, reason: 'sample_capped', firstNewsAt: null });
  });

  it('뉴스 표본이 비었거나 시각을 하나도 못 읽으면 미측정', () => {
    expect(computeLead({ ...base, firstSeenAt: at(0), newsPublishedAts: [] })).toMatchObject({ status: 'unmeasured', reason: 'no_news_sample' });
    expect(computeLead({ ...base, firstSeenAt: at(0), newsPublishedAts: [null, '시각아님'] })).toMatchObject({ status: 'unmeasured', reason: 'no_news_sample' });
  });

  it('1분도 안 벌어진 차이는 앞섬도 늦음도 아니다 — 같은 분은 가릴 수 없다', () => {
    const lead = computeLead({ ...base, firstSeenAt: at(0), newsPublishedAts: [new Date(T0 + 30_000).toISOString()] });
    expect(lead).toMatchObject({ status: 'unmeasured', minutes: null, reason: 'within_one_minute' });
  });

  it('처음 본 시각이 없으면 미측정이고, 검열 사유가 상한 사유보다 먼저다', () => {
    expect(computeLead({ ...base, firstSeenAt: null, newsPublishedAts: [at(25)] })).toMatchObject({ status: 'unmeasured', reason: 'no_first_seen', firstSeenAt: null });
    expect(computeLead({ ...base, firstSeenCensored: true, sampleCapped: true, firstSeenAt: at(0), newsPublishedAts: [] })).toMatchObject({ reason: 'censored' });
  });

  it('오차 한계(분)는 그대로 싣고, 올바르지 않은 값은 기본 수집 주기 10분으로 둔다', () => {
    expect(computeLead({ ...base, resolutionMinutes: 5, firstSeenAt: at(0), newsPublishedAts: [at(25)] }).resolutionMinutes).toBe(5);
    expect(computeLead({ ...base, resolutionMinutes: 0, firstSeenAt: at(0), newsPublishedAts: [at(25)] }).resolutionMinutes).toBe(10);
    expect(computeLead({ ...base, resolutionMinutes: Number.NaN, firstSeenAt: at(0), newsPublishedAts: [at(25)] }).resolutionMinutes).toBe(10);
  });
});

function entry(firstSeenAt: string, patch: Partial<HomefeedSignalStateEntry> = {}): HomefeedSignalStateEntry {
  return { issueKey: `k${firstSeenAt}`, keyword: 'k', firstSeenAt, lastSeenAt: firstSeenAt, firstSeenCensored: false, appearances: 1, ...patch };
}
const completeProbe = (earliestAt: string | null): HomefeedNewsProbe => ({ earliestAt, completeSeen: true, cappedSeen: false });

describe('장부 항목에서 판정', () => {
  it('장부의 뉴스 표본 기록으로 앞섬/늦음을 낸다', () => {
    expect(leadFromEntry(entry(at(0), { newsProbe: completeProbe(at(20)) }), 10)).toMatchObject({ status: 'ahead', minutes: 20 });
    expect(leadFromEntry(entry(at(60), { newsProbe: completeProbe(at(20)) }), 10)).toMatchObject({ status: 'behind', minutes: 40 });
  });

  it('기록이 없으면 뉴스 표본 없음, 상한에 닿은 표본뿐이면 상한 미측정, 한 번이라도 전부 받았으면 판정한다', () => {
    expect(leadFromEntry(entry(at(0)), 10)).toMatchObject({ status: 'unmeasured', reason: 'no_news_sample' });
    expect(leadFromEntry(entry(at(0), { newsProbe: { earliestAt: null, completeSeen: false, cappedSeen: true } }), 10)).toMatchObject({ reason: 'sample_capped' });
    expect(leadFromEntry(entry(at(0), { newsProbe: { earliestAt: at(9), completeSeen: true, cappedSeen: true } }), 10)).toMatchObject({ status: 'ahead', minutes: 9 });
    expect(leadFromEntry(entry(at(0), { newsProbe: completeProbe(null) }), 10)).toMatchObject({ reason: 'no_news_sample' });
  });

  it('검열 항목과 항목 없음은 미측정이다', () => {
    expect(leadFromEntry(entry(at(0), { firstSeenCensored: true, newsProbe: completeProbe(at(20)) }), 10)).toMatchObject({ reason: 'censored' });
    expect(leadFromEntry(undefined, 10)).toMatchObject({ status: 'unmeasured', reason: 'no_first_seen' });
  });
});

describe('7일 속도 성적표', () => {
  const now = Date.parse('2026-09-23T06:00:00.000Z');
  const ahead = (iso: string) => entry(iso, { newsProbe: completeProbe(new Date(Date.parse(iso) + 20 * 60_000).toISOString()) });
  const behind = (iso: string) => entry(iso, { newsProbe: completeProbe(new Date(Date.parse(iso) - 20 * 60_000).toISOString()) });
  const keyed = (rows: HomefeedSignalStateEntry[]) => Object.fromEntries(rows.map((row, index) => [`${row.issueKey}#${index}`, row]));

  it('앞섬 · 늦음 · 미측정을 사실 그대로 센다', () => {
    const board = computeSpeedScoreboard(keyed([
      ahead('2026-09-22T03:00:00.000Z'), ahead('2026-09-22T04:00:00.000Z'),
      behind('2026-09-22T05:00:00.000Z'),
      entry('2026-09-22T06:00:00.000Z', { firstSeenCensored: true }),
      entry('2026-09-22T07:00:00.000Z'),
    ]), now);
    expect(board).toMatchObject({ windowDays: 7, total: 5, ahead: 2, behind: 1, unmeasured: 2, resolutionMinutes: 10, computedAt: new Date(now).toISOString() });
    expect(board.unmeasuredReasons).toEqual({ censored: 1, no_news_sample: 1 });
  });

  it('측정된 날이 7일 미만이면 ready 가 아니다 — 앞섬/늦음이 있는 날만 측정된 날로 센다', () => {
    const board = computeSpeedScoreboard(keyed([
      ahead('2026-09-21T03:00:00.000Z'), behind('2026-09-22T03:00:00.000Z'),
      entry('2026-09-23T01:00:00.000Z'), // 미측정만 있는 날은 측정된 날이 아니다
    ]), now);
    expect(board.measuredDays).toBe(2);
    expect(board.ready).toBe(false);
  });

  it('7일을 채우면 ready, 8일째 조각이 있어도 측정 일수는 7일을 넘기지 않는다', () => {
    const days = ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];
    const seven = computeSpeedScoreboard(keyed(days.map((day) => ahead(`${day}T03:00:00.000Z`))), now);
    expect(seven).toMatchObject({ measuredDays: 7, ready: true, total: 7 });
    const eight = computeSpeedScoreboard(keyed([...days.map((day) => ahead(`${day}T03:00:00.000Z`)), ahead('2026-09-16T07:00:00.000Z')]), now);
    expect(eight.measuredDays).toBe(7);
  });

  it('하루의 경계는 한국 시각이다 — UTC 같은 날 15시 전후는 다른 날', () => {
    const board = computeSpeedScoreboard(keyed([ahead('2026-09-22T14:59:00.000Z'), ahead('2026-09-22T15:01:00.000Z')]), now);
    expect(board.measuredDays).toBe(2);
  });

  it('7일보다 오래된 항목과 미래 시각 항목은 세지 않는다', () => {
    const board = computeSpeedScoreboard(keyed([ahead('2026-09-10T03:00:00.000Z'), ahead('2026-09-23T07:00:00.000Z'), ahead('2026-09-22T03:00:00.000Z')]), now);
    expect(board.total).toBe(1);
  });

  it('장부가 비면 전부 0 이고 ready 가 아니다', () => {
    expect(computeSpeedScoreboard({}, now)).toMatchObject({ total: 0, ahead: 0, behind: 0, unmeasured: 0, measuredDays: 0, ready: false });
  });

  it('입력 장부를 바꾸지 않는다', () => {
    const entries = Object.freeze(keyed([ahead('2026-09-22T03:00:00.000Z')]));
    const before = JSON.stringify(entries);
    computeSpeedScoreboard(entries, now);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe('성적표 공개 검사(바깥 입력)', () => {
  const good = {
    windowDays: 7, measuredDays: 3, ready: false, total: 10, ahead: 4, behind: 2, unmeasured: 4,
    unmeasuredReasons: { censored: 3, sample_capped: 1 }, resolutionMinutes: 10, computedAt: at(0),
  };

  it('올바른 모양은 그대로 통과한다', () => {
    expect(normalizeSpeedScoreboard(good)).toEqual(good);
  });

  it('모양이 아니거나 숫자가 올바르지 않으면 null — 칸을 비운다', () => {
    expect(normalizeSpeedScoreboard(null)).toBeNull();
    expect(normalizeSpeedScoreboard('성적표')).toBeNull();
    expect(normalizeSpeedScoreboard({ ...good, ahead: -1 })).toBeNull();
    expect(normalizeSpeedScoreboard({ ...good, total: Number.NaN })).toBeNull();
    expect(normalizeSpeedScoreboard({ ...good, ready: 'yes' })).toBeNull();
    expect(normalizeSpeedScoreboard({ ...good, computedAt: 3 })).toBeNull();
  });

  it('모르는 사유 키는 버리고, 알려진 키만 남긴다', () => {
    const cleaned = normalizeSpeedScoreboard({ ...good, unmeasuredReasons: { censored: 2, 이상한사유: 9, sample_capped: -1 }, extra: 'x' });
    expect(cleaned?.unmeasuredReasons).toEqual({ censored: 2 });
    expect(cleaned).not.toHaveProperty('extra');
  });
});
