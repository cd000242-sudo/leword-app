import { describe, expect, it } from 'vitest';
import { roundSlotOf, scheduledRound } from '../topic-briefs';

/**
 * 늦게 돈 예약이 남의 회차를 잡아먹던 것(2026-09-11).
 *
 * 사장님 "12시 오늘의 글감 안돌았네". 발행본을 열어 보니 오늘 회차가 **'아침' 하나뿐**인데
 * 그 builtAt 이 2026-09-11 00:36 KST 였다.
 *
 * 무슨 일이 있었나(실측):
 *   09-10 저녁 예약(UTC 11:23 = KST 20:23)이 4시간 늦어 09-11 00:36 KST 에 돌았다.
 *   roundSlotOf 는 **실행 시각**을 보므로 0시는 '아침'이고, kstToday() 도 09-11 이다.
 *   → 09-10 저녁 회차가 **09-11 아침**으로 등록됐다.
 *   → 그날 진짜 아침 틱 셋(08:13·09:16·10:11)이 "아침은 이미 실렸다"며 전부 건너뛰었다.
 *   → 낮 틱은 깃허브가 떨어뜨렸고, 오늘 회차는 하나로 끝났다.
 *
 * 3틱 + skipIfSlotDone 은 예약 지연을 견디려고 넣은 것인데, 시각으로 회차를 정하는 한
 * 자정을 넘긴 지연은 오히려 **다음 날 회차를 잡아먹는다.**
 *
 * 깃허브는 `github.event.schedule` 로 **어느 예약이 발동했는지** 알려준다.
 * 그 예약이 원래 돌았어야 할 시각으로 회차를 정하면 늦어도 제자리를 찾는다.
 */
describe('예약이 준 cron 으로 회차를 정한다', () => {
  it('실측한 그 사고를 바로잡는다 — 자정 넘겨 돈 저녁 예약은 어제 저녁이다', () => {
    // 09-10 저녁 3번째 틱(UTC 11:23 = KST 20:23)이 09-10T15:36Z(= 09-11 00:36 KST)에 돌았다.
    expect(scheduledRound('23 11 * * *', new Date('2026-09-10T15:36:42Z'))).toEqual({ day: '2026-09-10', slot: '저녁' });
  });

  it('그래서 그날 아침 틱이 제 회차를 갖는다', () => {
    // 09-11 아침 1번째 틱(UTC 21:23 = KST 06:23)이 09-10T23:13Z(= 09-11 08:13 KST)에 돌았다.
    expect(scheduledRound('23 21 * * *', new Date('2026-09-10T23:13:00Z'))).toEqual({ day: '2026-09-11', slot: '아침' });
  });

  it('낮 예약 셋은 다 오후다', () => {
    const at = new Date('2026-09-11T06:30:00Z');
    for (const cron of ['23 3 * * *', '23 4 * * *', '23 5 * * *']) {
      expect(scheduledRound(cron, at)!.slot, cron).toBe('오후');
    }
  });

  it('아침 셋·저녁 셋도 각자 제자리다', () => {
    const at = new Date('2026-09-11T12:00:00Z');
    for (const cron of ['23 21 * * *', '23 22 * * *', '23 23 * * *']) {
      expect(scheduledRound(cron, at)!.slot, cron).toBe('아침');
    }
    for (const cron of ['23 9 * * *', '23 10 * * *', '23 11 * * *']) {
      expect(scheduledRound(cron, at)!.slot, cron).toBe('저녁');
    }
  });

  it('제때 돈 예약도 그대로다 — 늦은 것만 고치는 게 아니라 규칙이 하나다', () => {
    expect(scheduledRound('23 3 * * *', new Date('2026-09-11T03:23:10Z'))).toEqual({ day: '2026-09-11', slot: '오후' });
  });

  it('예약보다 조금 빨리 돌아도(깃허브가 가끔 그런다) 그 예약의 회차로 본다', () => {
    // 03:23Z 예약이 03:21Z 에 불렸다 — 하루 전으로 밀지 않는다.
    expect(scheduledRound('23 3 * * *', new Date('2026-09-11T03:21:00Z'))).toEqual({ day: '2026-09-11', slot: '오후' });
  });
});

describe('예약이 아닌 실행은 시계를 쓴다', () => {
  it('손으로 돌린 회차(cron 없음)는 null — 부르는 쪽이 시계로 간다', () => {
    expect(scheduledRound('', new Date())).toBeNull();
    expect(scheduledRound(undefined as any, new Date())).toBeNull();
  });

  it('모양이 이상한 cron 은 지어내지 않는다', () => {
    expect(scheduledRound('매일 아침', new Date())).toBeNull();
    expect(scheduledRound('99 99 * * *', new Date())).toBeNull();
  });
});

describe('시계로 정하는 규칙은 그대로 둔다', () => {
  it('11시 전은 아침, 17시 전은 오후, 그 뒤는 저녁', () => {
    const kst = (h: number) => new Date(Date.UTC(2026, 8, 11, h, 30));
    expect(roundSlotOf(kst(6))).toBe('아침');
    expect(roundSlotOf(kst(10))).toBe('아침');
    expect(roundSlotOf(kst(12))).toBe('오후');
    expect(roundSlotOf(kst(16))).toBe('오후');
    expect(roundSlotOf(kst(18))).toBe('저녁');
  });
});
