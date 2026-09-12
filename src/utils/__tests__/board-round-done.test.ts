import { describe, expect, it } from 'vitest';

// 문지기는 CI 에서 도는 순수 JS 다. 앱 코드가 아니라 여기서 직접 불러 검사한다.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { kstDay, parseRound, lastScheduledBefore, roundAlreadyDone, readPublishedAt } = require('../../../scripts/board-round-done.js');

/*
 * 회차 문지기 (2026-09-12).
 *
 * 사장님: "사이트 11일자로 황금키워드 또 안돌았고".
 * 실측: 선점 보드 예약은 8/14 부터 월·금 8회 전부 성공했는데 09-11 금요일 틱만 실행 기록이 없다.
 * 깃허브가 예약을 떨어뜨린 것이라 코드로는 못 막는다 — 대신 한 회차를 세 번 예약하고
 * 먼저 도는 하나만 일하게 한다. 그 '먼저 하나만'을 가르는 것이 이 문지기다.
 *
 * 선점 보드 한 회차는 4시간 + BD 예산이다. 문지기가 틀리면 그 비용이 세 배가 되거나
 * (헛돔) 보드가 통째로 빈다(안 돎). 두 방향 다 검사한다.
 */
/** 한국 시각을 UTC ms 로. */
const kst = (month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute) - 9 * 3_600_000;
/** 한국 시각을 발행본이 적는 ISO 문자열로. */
const publishedKst = (month: number, day: number, hour: number, minute = 0) =>
  new Date(kst(month, day, hour, minute)).toISOString();

const DAILY = ['06:23'];
const THRICE = ['07:23', '13:23', '19:23'];

describe('이미 실린 회차는 건너뛴다', () => {
  it('이번 회차 예정 시각 뒤에 실렸으면 건너뛴다 — 같은 회차의 두 번째·세 번째 틱', () => {
    // 한국 09-12 06:30 에 실렸고, 07:23 틱이 깨어났다
    expect(roundAlreadyDone(publishedKst(9, 12, 6, 30), DAILY, kst(9, 12, 7, 23))).toBe(true);
  });

  it('어제 것이면 건너뛰지 않는다 — 오늘 회차는 아직 비었다', () => {
    expect(roundAlreadyDone(publishedKst(9, 11, 10, 24), DAILY, kst(9, 12, 6, 23))).toBe(false);
  });

  it('사흘 묵었으면 당연히 돈다 — 사장님이 보신 그 상태', () => {
    // 실제 값: 선점 보드 publishedAt = 2026-09-09T01:24:19Z = 한국 09-09 10:24
    expect(roundAlreadyDone('2026-09-09T01:24:19.386Z', DAILY, kst(9, 12, 8, 12))).toBe(false);
  });
});

describe('하루 세 번 도는 보드는 회차로 가른다 — 날짜로 세면 두 회차가 통째로 막힌다', () => {
  it('아침 회차를 실었다고 오후 회차까지 막지 않는다', () => {
    const morning = publishedKst(9, 12, 7, 40);
    expect(roundAlreadyDone(morning, THRICE, kst(9, 12, 8, 23))).toBe(true);   // 아침의 다음 틱 → 건너뜀
    expect(roundAlreadyDone(morning, THRICE, kst(9, 12, 13, 23))).toBe(false); // 오후 회차 → 일한다
    expect(roundAlreadyDone(morning, THRICE, kst(9, 12, 19, 23))).toBe(false); // 저녁 회차 → 일한다
  });

  it('저녁 회차를 실으면 그날은 더 안 돈다', () => {
    expect(roundAlreadyDone(publishedKst(9, 12, 19, 50), THRICE, kst(9, 12, 21, 0))).toBe(true);
  });

  it('한국 새벽에 깨어난 틱은 어제 저녁 회차를 기준으로 본다 — 오늘 회차를 기다리다 놓치지 않게', () => {
    const due = lastScheduledBefore(THRICE, kst(9, 12, 2, 0));
    expect(new Date(due + 9 * 3_600_000).toISOString()).toBe('2026-09-11T19:23:00.000Z');
    // 어제 저녁 것이 실렸으면 새벽 틱은 할 일이 없다
    expect(roundAlreadyDone(publishedKst(9, 11, 19, 40), THRICE, kst(9, 12, 2, 0))).toBe(true);
    // 어제 저녁이 비었으면 새벽 틱이라도 깨운다
    expect(roundAlreadyDone(publishedKst(9, 11, 13, 40), THRICE, kst(9, 12, 2, 0))).toBe(false);
  });
});

describe('모르면 도는 쪽을 고른다', () => {
  it('시각이 없으면 돈다 — 안 돌아 보드가 비는 것이 헛도는 것보다 나쁘다', () => {
    expect(roundAlreadyDone(null, DAILY, Date.now())).toBe(false);
    expect(roundAlreadyDone('', DAILY, Date.now())).toBe(false);
  });

  it('시각이 망가졌으면 돈다', () => {
    expect(roundAlreadyDone('어제쯤', DAILY, Date.now())).toBe(false);
  });

  it('예정 시각을 못 읽으면 돈다', () => {
    expect(lastScheduledBefore(['스물다섯시'], Date.now())).toBe(null);
    expect(roundAlreadyDone(publishedKst(9, 12, 6, 30), ['스물다섯시'], kst(9, 12, 7, 23))).toBe(false);
  });

  it('발행본을 못 읽으면 시각이 null 이다 — "이미 돌았다"로 오해하지 않는다', async () => {
    const dead = (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    const got = await readPublishedAt('https://example.invalid/x.json', 'publishedAt', dead);
    expect(got.value).toBe(null);
    expect(roundAlreadyDone(got.value, DAILY, Date.now())).toBe(false);
  });

  it('404 도 마찬가지다', async () => {
    const notFound = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    const got = await readPublishedAt('https://example.invalid/x.json', 'publishedAt', notFound);
    expect(got.value).toBe(null);
    expect(got.note).toContain('404');
  });
});

describe('한국 시각 경계', () => {
  it('UTC 자정 직전은 이미 한국의 다음 날 아침이다', () => {
    expect(kstDay('2026-09-11T21:30:00.000Z')).toBe('2026-09-12');
  });

  it('UTC 오후 2시대는 아직 한국의 그날 밤이다', () => {
    expect(kstDay('2026-09-11T14:47:26.967Z')).toBe('2026-09-11');
  });

  it('예정 시각은 한국 시각으로 읽는다 — 크론과 같은 분이다', () => {
    expect(parseRound('06:23')).toEqual({ hour: 6, minute: 23 });
    const due = lastScheduledBefore(DAILY, kst(9, 12, 9, 0));
    expect(new Date(due + 9 * 3_600_000).toISOString()).toBe('2026-09-12T06:23:00.000Z');
  });
});
