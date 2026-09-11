import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { todaysRounds, roundSlotOf, scheduledRound } from '../topic-briefs';

/**
 * 예약 회차가 전부 죽던 것(2026-09-11, 내가 만든 회귀).
 *
 * 회차를 예약(github.event.schedule)으로 정하게 고치면서 today 를 Date → 문자열로 바꿨다.
 * 그런데 todaysRounds·pickFactsForPrompt·buildBriefPrompt·validateBriefs 가 전부 Date 를 받는다:
 *
 *   예약 '23 10 * * *' → 2026-09-11 저녁 회차로 기록한다     ← 회차 판정은 맞았는데
 *   오늘의 글감 실패: TypeError: kstNow.toISOString is not a function
 *       at todaysRounds (src/utils/topic-briefs.ts:662)
 *
 * 손으로 돌린 회차는 schedule 이 비어 planned 가 null → clockToday(Date) 라 멀쩡했다.
 * 그래서 내가 돌린 것만 되고 **예약만 조용히 전부 죽었다**(22:39·23:29 두 건 연속 실패).
 */
describe('회차 날짜는 Date 로 넘어간다', () => {
  it('todaysRounds 는 Date 를 받는다 — 문자열이면 죽는다', () => {
    expect(() => todaysRounds([], new Date('2026-09-11T00:00:00.000Z'))).not.toThrow();
    expect(() => todaysRounds([], '2026-09-11' as unknown as Date)).toThrow();
  });

  it('예약이 정한 날짜를 Date 로 바꿔 쓴다', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'topic-briefs.js'), 'utf8');
    expect(script, 'planned.day 를 그대로 넘기면 또 죽는다').not.toMatch(/const today = planned \? planned\.day/);
    expect(script).toContain('new Date(`${planned.day}T00:00:00.000Z`)');
  });

  it('그 Date 로도 회차 판정이 같다 — 바꿔 쓴 값이 틀리면 안 된다', () => {
    const planned = scheduledRound('23 10 * * *', new Date('2026-09-11T15:06:21Z'))!;
    expect(planned.day).toBe('2026-09-11');
    expect(planned.slot).toBe('저녁');
    // 스크립트가 만드는 그 Date
    const asDate = new Date(`${planned.day}T00:00:00.000Z`);
    expect(asDate.toISOString().slice(0, 10)).toBe('2026-09-11');
    // 자정으로 민 Date 라 시계 기준 회차는 '아침' 이 되지만, 실제 slot 은 planned 가 정한다.
    expect(roundSlotOf(asDate)).toBe('아침');
  });
});
