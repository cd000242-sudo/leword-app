import { describe, expect, it } from 'vitest';
import { kstToday } from '../topic-brief-dates';
import { isSameRound, pruneBriefShelf, recentRounds, rotateFieldsByRound, roundDayOf, todaysRounds, type BriefRound } from '../topic-brief-rounds';
import type { TopicBrief } from '../topic-briefs';

/*
 * 7일 창고(2026-09-29, 사장님 "분야마다 30개 이상"): 회차 하나가 17분야 × 30개를 담을 수 없어(CI 40분 한도에 30~50개)
 * 추천키워드 보드처럼 최근 7일 회차를 누적한다. 회차는 day+slot 으로 구분한다 — 어제 아침과 오늘 아침은 다른 회차다.
 */
const brief = (field: string, coreKeyword: string): TopicBrief => ({ field, coreKeyword, title: coreKeyword, timing: 'NOW' } as unknown as TopicBrief);
const round = (builtAt: string, slot: BriefRound['slot'], briefs: TopicBrief[], day?: string): BriefRound =>
  ({ ...(day ? { day } : {}), slot, builtAt, counts: { briefs: briefs.length, now: 0, next: 0, always: 0, star: 0 }, briefs });
const TODAY = kstToday(new Date('2026-09-29T02:00:00Z')); // KST 09-29 11:00

describe('회차 날짜', () => {
  it('day 가 있으면 그대로, 없으면 builtAt 의 KST 날짜로 읽는다(옛 파일 호환)', () => {
    expect(roundDayOf(round('2026-09-28T21:01:53Z', '아침', []))).toBe('2026-09-29'); // UTC 21:01 = KST 06:01 다음 날
    expect(roundDayOf(round('2026-09-28T21:01:53Z', '아침', [], '2026-09-28'))).toBe('2026-09-28');
  });
  it('isSameRound 는 날짜와 회차 이름이 둘 다 같아야 한다', () => {
    const a = round('2026-09-28T01:00:00Z', '오후', [], '2026-09-28');
    expect(isSameRound(a, { day: '2026-09-28', slot: '오후' })).toBe(true);
    expect(isSameRound(a, { day: '2026-09-29', slot: '오후' })).toBe(false);
    expect(isSameRound(a, { day: '2026-09-28', slot: '아침' })).toBe(false);
  });
});

describe('recentRounds — 최근 N일 창고', () => {
  const rounds = [
    round('2026-09-21T01:00:00Z', '오후', [brief('게임', '오래된')], '2026-09-21'),
    round('2026-09-23T01:00:00Z', '오후', [brief('게임', '일주일안')], '2026-09-23'),
    round('2026-09-28T21:01:53Z', '아침', [brief('게임', '오늘아침')]), // day 없음 → builtAt 으로 09-29
    round('2026-09-29T01:51:00Z', '오후', [brief('게임', '오늘오후')], '2026-09-29'),
  ];
  it('오늘 포함 7일 안 회차만 남기고 날짜·회차 순으로 세운다', () => {
    expect(recentRounds(rounds, TODAY, 7).map(r => r.briefs[0].coreKeyword)).toEqual(['일주일안', '오늘아침', '오늘오후']);
  });
  it('todaysRounds 는 오늘 것만 남긴다(day 우선)', () => {
    expect(todaysRounds(rounds, TODAY).map(r => r.slot)).toEqual(['아침', '오후']);
  });
  it('미래 날짜·깨진 회차는 버린다', () => {
    const broken = [round('not-a-date', '아침', []), round('2026-10-05T00:00:00Z', '아침', [], '2026-10-05'), null as unknown as BriefRound];
    expect(recentRounds(broken, TODAY, 7)).toEqual([]);
  });
});

describe('pruneBriefShelf — 분야별 상한', () => {
  it('분야마다 새 회차부터 상한까지만 남기고 빈 회차는 지운다', () => {
    const old = round('2026-09-27T01:00:00Z', '오후', [brief('게임', 'g1'), brief('게임', 'g2'), brief('건강', 'h1')], '2026-09-27');
    const fresh = round('2026-09-29T01:00:00Z', '오후', [brief('게임', 'g3'), brief('게임', 'g4')], '2026-09-29');
    const pruned = pruneBriefShelf([old, fresh], 3);
    expect(pruned.map(r => r.briefs.map(b => b.coreKeyword))).toEqual([['g2', 'h1'], ['g3', 'g4']]);
    expect(pruned[0].counts.briefs).toBe(2);
    expect(pruneBriefShelf([round('2026-09-27T01:00:00Z', '오후', [brief('게임', 'g1')], '2026-09-27'), fresh], 2).map(r => r.day)).toEqual(['2026-09-29']);
  });
  it('원본 회차를 바꾸지 않는다', () => {
    const old = round('2026-09-27T01:00:00Z', '오후', [brief('게임', 'g1'), brief('게임', 'g2')], '2026-09-27');
    pruneBriefShelf([old], 1);
    expect(old.briefs).toHaveLength(2);
  });
});

describe('rotateFieldsByRound — 시간 한도에 늘 같은 분야가 잘리지 않게', () => {
  const fields = ['a', 'b', 'c', 'd', 'e'];
  it('회차마다 시작 분야가 옮겨 가고 전체는 그대로다', () => {
    const morning = rotateFieldsByRound(fields, '2026-09-29', '아침');
    const noon = rotateFieldsByRound(fields, '2026-09-29', '오후');
    const nextDay = rotateFieldsByRound(fields, '2026-09-30', '아침');
    expect([...morning].sort()).toEqual(fields);
    expect(morning).not.toEqual(noon);
    expect(nextDay).not.toEqual(morning);
    expect(rotateFieldsByRound(fields, '2026-09-29', '아침')).toEqual(morning); // 결정적
    expect(rotateFieldsByRound([], '2026-09-29', '아침')).toEqual([]);
  });
});
